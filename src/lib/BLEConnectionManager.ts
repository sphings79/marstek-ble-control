import { VenusPacket } from "./VenusPacket";
import semaphore from 'semaphore';
import {COMMAND_ID} from "./VenusConst.ts";
import { ConnectionState } from "./ConnectionState";
import type { Transport, TransportKind } from "./transport/Transport";
import { WebBluetoothTransport } from "./transport/WebBluetoothTransport";

export { ConnectionState };
export { SERVICE_UUID, TX_UUID, RX_UUID } from "./transport/WebBluetoothTransport";

type PacketListener = (packet: VenusPacket) => void;

/**
 * Owns the Marstek protocol on top of a byte pipe: frame reassembly, packet dispatch, the
 * periodic STATE poll and the TX mutex. Everything device-facing lives behind a Transport, so the
 * same manager drives a direct Web Bluetooth link or an ESP32 bridge without knowing which.
 */
export class BLEConnectionManager {
    private readonly transport: Transport;

    public onStateChange: (state: ConnectionState, msg?: string) => void = () => {};
    public onRSSI: (rssi: number) => void = () => {};

    // Fired for EVERY incoming notification, regardless of frame shape - used by OTA, which
    // speaks a different frame format (2-byte big-endian length, no 0x23 marker) than the
    // regular VenusPacket frames dispatched below. Normal command consumers should keep using
    // subscribe()/useVenusData(); this is only for OTA-style raw frame handling.
    public onRawNotification: (bytes: Uint8Array) => void = () => {};

    private listeners: Map<number, PacketListener[]> = new Map();

    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private txMutex = semaphore(1);

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
                // Always fire the raw hook first - OTA (and anything else speaking a non-VenusPacket
                // frame shape) needs to see every notification, not just ones that parse as VenusPacket.
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
     * Frames with no 0x23 marker are OTA-shaped; those are consumed here (to keep the buffer aligned)
     * but not dispatched - OTA is handled separately via onRawNotification.
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

            if (buf[2] === BLEConnectionManager.HM_MARKER) {
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

            const frame = Uint8Array.from(buf.splice(0, declaredLen));

            if (type !== 'ota') {
                this.dispatchAssembledFrame(frame, type);
            }
            // OTA frames are drained above but intentionally not dispatched here.
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
        if (!this.transport.isConnected) {
            return;
        }

        try {
            await this.sendPacket(COMMAND_ID.STATE);
        } catch (err) {
            console.warn("Poll failed", err);
        }

        this.pollTimer = setTimeout(() => this.doPoll(), 5_000);
    }

    public pollState() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }

        this.doPoll();
    }

    async scanAndConnect() {
        await this.transport.scanAndConnect();
    }

    async reconnect() {
        await this.transport.reconnect();
    }

    disconnect() {
        this.log("Disconnecting...");
        this.stopPolling();

        this.transport.disconnect();
    }

    async sendPacket(cmd: COMMAND_ID, payload?: Uint8Array) {
        if (!this.transport.isConnected) {
            this.error("Cannot send: Not connected");

            throw new Error("Not connected");
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
        if (!this.transport.isConnected) {
            this.error("Cannot send raw: Not connected");
            throw new Error("Not connected");
        }

        return this.writeLocked(bytes, false);
    }

    private writeLocked(bytes: Uint8Array, withResponse: boolean, logLine?: string) {
        return new Promise<void>((resolve, reject) => {
            this.txMutex.take(async () => {
                try {
                    if (!this.transport.isConnected) {
                        // noinspection ExceptionCaughtLocallyJS
                        throw new Error("Disconnected while waiting for lock");
                    }

                    if (logLine) {
                        this.log(logLine, bytes);
                    }

                    await this.transport.send(bytes, withResponse);
                    resolve();
                } catch (err) {
                    this.error(withResponse ? "Write Failed" : "Raw Write Failed", err);
                    reject(err);
                } finally {
                    // Might be nonsensical, but let's give the firmware some time maybe
                    setTimeout(() => {
                        this.txMutex.leave();
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
        this.stopPolling();
    }

    resumePolling() {
        // OTA drove its own raw frames through the buffer; clear any leftover bytes so the first
        // post-OTA command response starts from a clean slate.
        this.resetReassembler();
        this.pollState();
    }
}
