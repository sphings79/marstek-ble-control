import { VenusPacket } from "./VenusPacket";
import semaphore from 'semaphore';
import {COMMAND_ID} from "./VenusConst.ts";
import { ConnectionState } from "./ConnectionState";
import type { Transport, TransportKind } from "./transport/Transport";
import { WebBluetoothTransport } from "./transport/WebBluetoothTransport";
import { translate } from '../i18n/i18n';

export { ConnectionState };
export { SERVICE_UUID, TX_UUID, RX_UUID } from "./transport/WebBluetoothTransport";

type PacketListener = (packet: VenusPacket) => void;
export interface OtaSession {
    send(bytes: Uint8Array): Promise<void>;
    release(resumePolling?: boolean): void;
}

/**
 * Owns the Marstek protocol on top of a byte pipe: frame reassembly, packet dispatch, the
 * periodic STATE poll and the TX mutex. Everything device-facing lives behind a Transport, so the
 * same manager drives a direct Web Bluetooth link or an ESP32 bridge without knowing which.
 */
export class BLEConnectionManager {
    private readonly transport: Transport;

    public onStateChange: (state: ConnectionState, msg?: string) => void = () => {};
    public onRSSI: (rssi: number) => void = () => {};

    // Legacy diagnostic hook for notification fragments. OTA uses subscribeFrames()
    // instead, which delivers checksum-valid complete frames after reassembly.
    public onRawNotification: (bytes: Uint8Array) => void = () => {};

    private listeners: Map<number, PacketListener[]> = new Map();

    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private pollingSuspended = false;
    private pollTask: Promise<void> | null = null;
    private otaToken: symbol | null = null;
    private reconnectRequired = false;
    private freshConnection = false;
    private frameListeners = new Set<(frame: Uint8Array) => void>();
    private lossListeners = new Set<() => void>();
    private disconnectListeners = new Set<() => void>();
    private txMutex = semaphore(1);
    private connectionGeneration = 0;
    private connectionTask: Promise<void> | null = null;
    private writeRejectors = new Set<(error: Error) => void>();

    // Reassembly buffer for incoming VenusPacket frames. BLE delivers notifications capped at the
    // negotiated ATT MTU, so larger responses (DEVICE_INFO 0x04, GET_WORK_MODE_SETTINGS / "Settings
    // Info" 0x0A, ...) frequently arrive split across several notifications. The original code only
    // accepted a single-notification "Normal HM" frame (`bytes[2] === 0x23` with `len === bytes.length`)
    // and silently dropped everything else, which is why those two widgets spun forever on devices
    // (e.g. Venus D) whose responses don't fit one notification. We now accumulate bytes and dispatch
    // only once a full length-declared frame is present, and also understand the 2-byte "Transition HM"
    // framing. See the sibling "Marstek Venus Monitor" project's AsyncResponseHandler for the
    // reverse-engineered reference behaviour.
    private rxAssembly: number[] = [];
    private rxAssemblyTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(transport: Transport = new WebBluetoothTransport()) {
        this.transport = transport;
        this.transport.setCallbacks({
            onNotify: (bytes) => {
                // Preserve the raw diagnostic hook, then reassemble complete frames for OTA
                // and ordinary command consumers.
                this.onRawNotification(bytes);

                // Feed the reassembler, which buffers across notifications and dispatches complete
                // VenusPacket frames (see feedReassembler). This transparently handles responses that
                // span multiple BLE notifications and the 2-byte "Transition HM" framing.
                this.feedReassembler(bytes);
            },
            onStateChange: (state, msg) => {
                // Clear any stale bytes before the transport starts delivering notifications.
                if (state === ConnectionState.CONNECTING) {
                    this.resetReassembler();
                    this.notifyConnectionLoss();
                    if (!this.isConnected) {
                        this.invalidateConnectionWrites();
                        this.freshConnection = true;
                    }
                }
                if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
                    this.stopPolling();
                    this.resetReassembler();
                    this.notifyConnectionLoss();
                    if (state === ConnectionState.DISCONNECTED) {
                        this.invalidateConnectionWrites();
                        this.freshConnection = true;
                        for (const listener of [...this.disconnectListeners]) listener();
                    }
                }

                if (state === ConnectionState.CONNECTED && this.freshConnection) {
                    if (!this.otaToken) {
                        this.reconnectRequired = false;
                        this.pollingSuspended = false;
                    }
                    // Consume fresh evidence even if an old transfer is still unwinding.
                    this.freshConnection = false;
                }

                this.onStateChange(state, msg);

                if (state === ConnectionState.CONNECTED) {
                    this.doPoll();
                }
            },
            onRssi: (rssi) => this.onRSSI(rssi),
            onDisconnected: () => {
                this.stopPolling();
                this.resetReassembler();
                this.notifyConnectionLoss();
                this.invalidateConnectionWrites();
                this.freshConnection = true;
                for (const listener of [...this.disconnectListeners]) listener();
                this.onStateChange(ConnectionState.DISCONNECTED);
            },
        });
    }

    /** How this manager reaches the device - callers scale their timeouts by it (see OtaManager). */
    public get transportKind(): TransportKind {
        return this.transport.kind;
    }

    /**
     * BLE advertised name of the connected device. Drives model detection (which dashboard is
     * shown) and the OTA model-mismatch guard, so it must survive any transport change.
     */
    public get deviceName(): string | undefined {
        return this.transport.deviceName;
    }

    public get isConnected(): boolean {
        return this.transport.isConnected;
    }

    public get requiresReconnect(): boolean { return this.reconnectRequired; }

    /** Complete checksum-valid frames, independent of notification boundaries. */
    public subscribeFrames(listener: (frame: Uint8Array) => void): () => void {
        this.frameListeners.add(listener);
        return () => { this.frameListeners.delete(listener); };
    }

    public subscribeConnectionLoss(listener: () => void): () => void {
        this.lossListeners.add(listener);
        return () => { this.lossListeners.delete(listener); };
    }

    private notifyConnectionLoss() {
        for (const listener of [...this.lossListeners]) listener();
    }

    /** A dead transport promise must not hold the next connection's queue hostage. */
    private invalidateConnectionWrites() {
        this.connectionGeneration++;
        for (const reject of [...this.writeRejectors]) reject(new Error('Write belongs to a previous connection'));
        this.txMutex = semaphore(1);
        this.pollTask = null;
        this.stopPolling();
    }

    /** Reserve the whole exchange, then drain any write already in progress. */
    public async beginOtaSession(signal?: AbortSignal): Promise<OtaSession> {
        if (this.otaToken) throw new Error('A firmware transfer is already running');
        if (this.reconnectRequired) throw new Error('Reconnect before another firmware transfer');
        if (!this.isConnected) throw new Error('Not connected');
        const token = Symbol('OTA');
        const generation = this.connectionGeneration;
        const mutex = this.txMutex;
        this.otaToken = token;
        const previouslySuspended = this.pollingSuspended;
        this.suspendPolling();
        try {
            await new Promise<void>((resolve, reject) => {
                let done = false;
                const cleanup = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', abort);
                    unsubscribeLoss();
                };
                const fail = (message: string) => {
                    if (done) return;
                    done = true;
                    cleanup();
                    reject(new Error(message));
                };
                const abort = () => fail('Transfer cancelled');
                const timer = setTimeout(() => {
                    this.reconnectRequired = true;
                    fail('Timed out draining prior writes; reconnect before retrying');
                }, 5_000);
                const unsubscribeLoss = this.subscribeConnectionLoss(() => fail('Disconnected before transfer'));
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted) { abort(); return; }
                mutex.take(() => {
                    mutex.leave();
                    if (done) return;
                    done = true;
                    cleanup();
                    resolve();
                });
            });
            if (!this.isConnected || generation !== this.connectionGeneration) throw new Error('Disconnected before transfer');
            this.resetReassembler();
        } catch (error) {
            this.otaToken = null;
            if (!previouslySuspended && this.isConnected) this.resumePolling();
            throw error;
        }
        return {
            send: (bytes) => {
                if (generation !== this.connectionGeneration) return Promise.reject(new Error('Firmware session belongs to a previous connection'));
                return this.writeLocked(bytes, false, undefined, token);
            },
            release: (resume = true) => {
                if (this.otaToken !== token) return;
                this.otaToken = null;
                if (generation === this.connectionGeneration) this.resetReassembler();
                if (!resume) this.reconnectRequired = true;
                if (resume && !previouslySuspended && this.isConnected) this.resumePolling();
            },
        };
    }

    public subscribe(commandId: number, callback: PacketListener) {
        if (!this.listeners.has(commandId)) {
            this.listeners.set(commandId, []);
        }
        this.listeners.get(commandId)?.push(callback);
    }

    public unsubscribe(commandId: number, callback: PacketListener) {
        const listeners = this.listeners.get(commandId);
        if (listeners) {
            this.listeners.set(commandId, listeners.filter(cb => cb !== callback));
        }
    }

    private dispatchPacket(packet: VenusPacket) {
        const handlers = this.listeners.get(packet.commandId);
        if (handlers) {
            handlers.forEach(fn => fn(packet));
        }
    }

    private static readonly HM_MARKER = 0x23;
    // Upper bound for a single declared frame length. Normal HM tops out at 255 (1-byte length),
    // Transition HM can go higher; 4096 is comfortably above any real command response and guards
    // against a corrupt header making us allocate/wait forever.
    private static readonly MAX_FRAME_LEN = 4096;

    private resetReassembler() {
        this.rxAssembly = [];
        if (this.rxAssemblyTimer) {
            clearTimeout(this.rxAssemblyTimer);
            this.rxAssemblyTimer = null;
        }
    }

    /**
     * Accumulate incoming notification bytes and dispatch each complete VenusPacket frame found.
     *
     * A frame is `[0x73][LEN][0x23][CMD][PAYLOAD...][XOR]` (Normal HM, 1-byte LEN = total length)
     * or `[0x73][LEN_HI][LEN_LO][0x23][CMD][PAYLOAD...][XOR]` (Transition HM, 2-byte big-endian
     * length). BLE can split one frame over several notifications and can also pack more than one
     * frame into a single notification, so we drive a small resync/length state machine over a
     * rolling buffer rather than assuming one notification == one frame.
     *
     * All complete checksum-valid frames go to subscribeFrames() consumers. HM frames
     * additionally go to the normal VenusPacket subscriptions.
     */
    private feedReassembler(chunk: Uint8Array) {
        for (let i = 0; i < chunk.length; i++) this.rxAssembly.push(chunk[i]);

        const buf = this.rxAssembly;

        // Extract as many complete frames as the buffer currently holds.
        for (;;) {
            // Resync: drop leading bytes until a plausible frame start (magic byte).
            while (buf.length > 0 && buf[0] !== VenusPacket.MAGIC) buf.shift();

            // Need at least the fixed header to know the framing + declared length.
            if (buf.length < 4) break;

            let declaredLen: number;
            let type: 'normal' | 'transition' | 'ota';

            if (buf[2] === BLEConnectionManager.HM_MARKER && buf[1] >= 5) {
                type = 'normal';
                declaredLen = buf[1];
            } else if (buf[3] === BLEConnectionManager.HM_MARKER) {
                type = 'transition';
                declaredLen = (buf[1] << 8) | buf[2];
            } else {
                // OTA-shaped frame: 2-byte big-endian length, no 0x23 marker.
                type = 'ota';
                declaredLen = (buf[1] << 8) | buf[2];
            }

            const minLen = type === 'transition' ? 6 : 5;
            if (declaredLen < minLen || declaredLen > BLEConnectionManager.MAX_FRAME_LEN) {
                // Bogus header - drop the magic byte and try to resync on the next one.
                buf.shift();
                continue;
            }

            if (buf.length < declaredLen) {
                // Incomplete frame - wait for the next notification(s).
                this.armReassemblyTimeout();
                break;
            }

            const frame = Uint8Array.from(buf.slice(0, declaredLen));
            // HM and OTA both use XOR over every preceding byte (see OtaFrameCodec).
            if (VenusPacket.calculateChecksum(frame.subarray(0, -1)) !== frame[frame.length - 1]) {
                // Preserve a following valid frame when a corrupt prefix claimed its bytes.
                buf.shift();
                continue;
            }
            buf.splice(0, declaredLen);
            for (const listener of [...this.frameListeners]) listener(frame.slice());

            if (type !== 'ota') {
                this.dispatchAssembledFrame(frame, type);
            }
            // OTA has already received the complete frame through frameListeners.
        }

        // Nothing left half-parsed -> no need for the stuck-buffer timer.
        if (buf.length === 0 && this.rxAssemblyTimer) {
            clearTimeout(this.rxAssemblyTimer);
            this.rxAssemblyTimer = null;
        }

        // Hard cap: never let a stream of garbage grow the buffer without bound.
        if (buf.length > BLEConnectionManager.MAX_FRAME_LEN * 2) {
            console.warn("[BLEConnectionManager] RX buffer overflow, resetting reassembler");
            this.resetReassembler();
        }
    }

    /**
     * If a partial frame lingers (e.g. the tail notification never arrives), discard it after a
     * short grace period so the next real response isn't corrupted by stale leading bytes.
     */
    private armReassemblyTimeout() {
        if (this.rxAssemblyTimer) return;
        this.rxAssemblyTimer = setTimeout(() => {
            this.rxAssemblyTimer = null;
            if (this.rxAssembly.length > 0) {
                console.warn(`[BLEConnectionManager] Dropping ${this.rxAssembly.length} stale RX byte(s) (incomplete frame)`);
                this.rxAssembly = [];
            }
        }, 1_000);
    }

    private dispatchAssembledFrame(frame: Uint8Array, type: 'normal' | 'transition') {
        const receivedChecksum = frame[frame.length - 1];
        const calcChecksum = VenusPacket.calculateChecksum(frame.subarray(0, frame.length - 1));
        if (receivedChecksum !== calcChecksum) {
            console.warn(`Checksum mismatch! Exp: ${calcChecksum.toString(16)}, Got: ${receivedChecksum.toString(16)}`);
            return;
        }

        const cmd = type === 'normal' ? frame[3] : frame[4];
        const payload = type === 'normal'
            ? frame.subarray(4, frame.length - 1)
            : frame.subarray(5, frame.length - 1);

        this.log(`RX: Cmd 0x${cmd.toString(16)} (${type}, ${frame.length}B)`, frame);
        this.dispatchPacket(new VenusPacket(cmd as COMMAND_ID, payload));
    }

    private log(msg: string, data?: unknown) {
        console.log(`[BLEConnectionManager] ${msg}`, data || '');
    }

    private error(msg: string, err?: unknown) {
        console.error(`[BLEConnectionManager] ${msg}`, err || '');
    }

    private stopPolling() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    private async doPoll() {
        if (this.pollingSuspended || this.otaToken) return;
        if (this.pollTask) return this.pollTask;
        const task = this.performPoll();
        this.pollTask = task;
        try { await task; } finally { if (this.pollTask === task) this.pollTask = null; }
    }

    private async performPoll() {
        const generation = this.connectionGeneration;
        // Every path schedules the next poll. Returning early without one meant a single moment of
        // "not connected" - a reconnect in progress, a bridge catching its breath - stopped the
        // polling for good, and the dashboard sat on "waiting for first poll" until the whole
        // connection was torn down and rebuilt by hand.
        if (this.transport.isConnected) {
            try {
                await this.sendPacket(COMMAND_ID.STATE);
            } catch (err) {
                console.warn("Poll failed", err);
            }
        }

        if (generation !== this.connectionGeneration) return;
        this.stopPolling();
        if (!this.pollingSuspended && !this.otaToken && this.isConnected) {
            this.pollTimer = setTimeout(() => { void this.doPoll(); }, 5_000);
        }
    }

    public pollState() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        this.doPoll();
    }

    /** Wait for actual teardown so a delayed disconnect cannot erase the new connection. */
    private async disconnectBeforeReconnect(): Promise<void> {
        if (!this.reconnectRequired || !this.isConnected) return;
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                this.disconnectListeners.delete(disconnected);
            };
            const disconnected = () => { cleanup(); resolve(); };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Disconnect timed out; reconnect has not started'));
            }, 5_000);
            this.disconnectListeners.add(disconnected);
            try { this.transport.disconnect(); }
            catch (error) { cleanup(); reject(error); }
        });
    }

    private connectUsing(method: 'scanAndConnect' | 'reconnect'): Promise<void> {
        if (this.connectionTask) return this.connectionTask;
        // Reserve before running transport callbacks, including synchronous/reentrant ones.
        const task = Promise.resolve().then(async () => {
            await this.disconnectBeforeReconnect();
            await this.transport[method]();
        });
        this.connectionTask = task;
        const cleanup = () => { if (this.connectionTask === task) this.connectionTask = null; };
        void task.then(cleanup, cleanup);
        return task;
    }

    scanAndConnect() { return this.connectUsing('scanAndConnect'); }

    reconnect() { return this.connectUsing('reconnect'); }

    disconnect() {
        this.log("Disconnecting...");
        this.stopPolling();

        this.transport.disconnect();
    }

    async sendPacket(cmd: COMMAND_ID, payload?: Uint8Array) {
        if (this.otaToken || this.reconnectRequired) throw new Error('Commands paused for firmware transfer; reconnect to resume');
        if (!this.transport.isConnected) {
            this.error("Cannot send: Not connected");

            throw new Error(translate('err.notConnected'));
        }

        const p = new VenusPacket(cmd, payload);
        const raw = p.toBytes();

        return this.writeLocked(raw, true, `TX: Cmd 0x${cmd.toString(16)}`);
    }

    /**
     * Write raw, pre-built bytes directly to the device, bypassing VenusPacket framing entirely.
     * Used by OTA, which speaks a different frame format. Shares the same mutex as sendPacket()
     * so OTA writes and regular command writes never interleave.
     */
    async sendRaw(bytes: Uint8Array) {
        if (this.otaToken) throw new Error('Raw writes require the active firmware session');
        if (this.reconnectRequired) throw new Error('Reconnect before sending commands');
        if (!this.transport.isConnected) {
            this.error("Cannot send raw: Not connected");
            throw new Error(translate('err.notConnected'));
        }

        return this.writeLocked(bytes, false);
    }

    private writeLocked(bytes: Uint8Array, withResponse: boolean, logLine?: string, token?: symbol) {
        const generation = this.connectionGeneration;
        const mutex = this.txMutex;
        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
                if (settled) return;
                settled = true;
                this.writeRejectors.delete(fail);
                if (error) reject(error); else resolve();
            };
            const fail = (error: Error) => finish(error);
            this.writeRejectors.add(fail);
            mutex.take(async () => {
                if (settled) { mutex.leave(); return; }
                try {
                    if (generation !== this.connectionGeneration) throw new Error('Write belongs to a previous connection');
                    if (this.reconnectRequired) throw new Error('Reconnect before sending commands');
                    if ((token && token !== this.otaToken) || (this.otaToken && token !== this.otaToken)) {
                        throw new Error('Write blocked by firmware session');
                    }
                    if (!this.transport.isConnected) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error(translate('err.disconnectedWaiting'));
                    }

                    if (logLine) {
                        this.log(logLine, bytes);
                    }

                    await this.transport.send(bytes, withResponse);
                    finish();
                } catch (err) {
                    this.error(withResponse ? "Write Failed" : "Raw Write Failed", err);
                    finish(err);
                } finally {
                    // Might be nonsensical, but let's give the firmware some time maybe
                    setTimeout(() => {
                        mutex.leave();
                    }, 25);
                }
            });
        });
    }

    /**
     * Pause the periodic STATE poll (e.g. during OTA, where interleaving unrelated command
     * traffic with the firmware transfer is untested and risky). Call resumePolling() when done.
     */
    suspendPolling() {
        this.pollingSuspended = true;
        this.stopPolling();
    }

    resumePolling() {
        if (this.otaToken || this.reconnectRequired) return;
        this.pollingSuspended = false;
        // OTA drove its own raw frames through the buffer; clear any leftover bytes so the first
        // post-OTA command response starts from a clean slate.
        this.resetReassembler();
        this.pollState();
    }
}
