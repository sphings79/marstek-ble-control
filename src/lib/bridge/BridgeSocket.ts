import { bridgeUrl } from './BridgeApi';
import { decodeNotifyFrame, isSupportedVersion, parseHello, type SlotBinding } from './BridgeProtocol';
import { translate } from '../../i18n/i18n';

/** One device the bridge saw while scanning. */
export interface BridgeDevice {
    name: string;
    address: string;
    rssi: number;
}

/** The subset of WebSocket this class uses, so tests can substitute a fake. */
export interface SocketLike {
    readyState: number;
    binaryType: string;
    send(data: string | Uint8Array): void;
    close(): void;
    addEventListener(type: string, listener: (event: never) => void): void;
    removeEventListener(type: string, listener: (event: never) => void): void;
}

const CONNECTING = 0;
const OPEN = 1;

/** What one slot's transport receives from the shared socket. */
export interface SlotHandlers {
    onBinary: (bytes: Uint8Array) => void;
    /** A `status` message addressed to this slot. */
    onStatus: (msg: Record<string, unknown>) => void;
    /** An `error` message addressed to this slot, or a socket-level failure that concerns it. */
    onError: (msg: Record<string, unknown>) => void;
    /** The socket closed. */
    onSocketGone: () => void;
    /** The slot was unbound from this side. */
    onUnbound: () => void;
}

const DEFAULT_SLOT_COUNT = 3;

const openWebSocket = (): SocketLike => {
    const url = bridgeUrl('api/ws');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url.href) as unknown as SocketLike;
};

/**
 * The one WebSocket to the bridge, shared by all slots.
 *
 * Owns the socket, parses `hello`, keeps the slot bindings, the bridge's WiFi signal and scan
 * results, and routes every frame to the transport of the slot it names. Slot transports register
 * a handler set each, so none of them can take over another one's callbacks.
 */
export class BridgeSocket {
    private ws: SocketLike | null = null;
    private incompatible = false;

    private bindings: (SlotBinding | null)[];
    private handlers = new Map<number, SlotHandlers>();

    private wifiRssi: number | null = null;
    private wifiListeners = new Set<(rssi: number | null) => void>();
    private scanListeners = new Set<(devices: BridgeDevice[]) => void>();
    private slotListeners = new Set<() => void>();
    private errorListeners = new Set<(message: string) => void>();

    private readonly createSocket: () => SocketLike;

    constructor(
        slotCount = DEFAULT_SLOT_COUNT,
        createSocket: () => SocketLike = openWebSocket,
    ) {
        this.createSocket = createSocket;
        this.bindings = Array.from({ length: slotCount }, () => null);
    }

    /** Snapshot of what is bound to each slot. */
    public get slots(): readonly (SlotBinding | null)[] {
        return this.bindings;
    }

    public get isOpen(): boolean {
        return this.ws?.readyState === OPEN;
    }

    public registerSlot(slot: number, handlers: SlotHandlers) {
        this.handlers.set(slot, handlers);
    }

    public onWifiRssi(listener: (rssi: number | null) => void): () => void {
        this.wifiListeners.add(listener);
        listener(this.wifiRssi);
        return () => { this.wifiListeners.delete(listener); };
    }

    public onScanResults(listener: (devices: BridgeDevice[]) => void): () => void {
        this.scanListeners.add(listener);
        return () => { this.scanListeners.delete(listener); };
    }

    /** Fires when a binding changes (hello, bind, unbind, or a status carrying a new name). */
    public onSlotsChange(listener: () => void): () => void {
        this.slotListeners.add(listener);
        return () => { this.slotListeners.delete(listener); };
    }

    /** Bridge-level errors that belong to no slot (a failed scan, an incompatible bridge). */
    public onError(listener: (message: string) => void): () => void {
        this.errorListeners.add(listener);
        return () => { this.errorListeners.delete(listener); };
    }

    /** Open the socket if needed. Resolves once it is usable. */
    public open(): Promise<void> {
        if (this.incompatible) return Promise.reject(new Error(translate('err.bridgeTooOld')));

        if (!this.ws || (this.ws.readyState !== OPEN && this.ws.readyState !== CONNECTING)) {
            console.log('[BridgeSocket] Opening socket');
            const ws = this.createSocket();
            ws.binaryType = 'arraybuffer';
            this.ws = ws;

            ws.addEventListener('message', ((event: { data: unknown }) => this.receive(event.data as string | ArrayBuffer)) as (e: never) => void);
            ws.addEventListener('close', (() => this.handleClosed(ws)) as (e: never) => void);
            // An error is always followed by a close, which does the cleanup; reporting it here
            // would flag every slot, including healthy ones.
            ws.addEventListener('error', (() => console.error('[BridgeSocket] WebSocket error')) as (e: never) => void);
        }

        return this.ready();
    }

    private ready(): Promise<void> {
        const ws = this.ws;
        if (!ws) return Promise.reject(new Error('No socket'));
        if (ws.readyState === OPEN) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(); };
            const onFail = () => { cleanup(); reject(new Error(translate('err.bridgeConnectionFailed'))); };
            const cleanup = () => {
                ws.removeEventListener('open', onOpen as (e: never) => void);
                ws.removeEventListener('error', onFail as (e: never) => void);
                ws.removeEventListener('close', onFail as (e: never) => void);
            };
            ws.addEventListener('open', onOpen as (e: never) => void);
            ws.addEventListener('error', onFail as (e: never) => void);
            ws.addEventListener('close', onFail as (e: never) => void);
        });
    }

    /** Send a JSON control message. False when the socket is not open. */
    public sendControl(msg: Record<string, unknown>): boolean {
        if (!this.ws || this.ws.readyState !== OPEN) {
            console.error('[BridgeSocket] Cannot send control message: socket not open', msg);
            return false;
        }
        this.ws.send(JSON.stringify(msg));
        return true;
    }

    /** Send a binary frame. Throws when the socket is not open. */
    public sendBinary(frame: Uint8Array) {
        if (!this.ws || this.ws.readyState !== OPEN) {
            throw new Error(translate('err.notConnected'));
        }
        this.ws.send(frame);
    }

    /** Open the socket without asking for anything; the bridge answers with its slots. */
    public async hello() {
        await this.open();
    }

    public async scan(seconds = 5) {
        await this.open();
        this.sendControl({ t: 'scan', seconds });
    }

    /**
     * Pin a slot to a device. Survives reboots on the bridge side. The name goes along because it
     * decides which dashboard is shown and guards firmware updates against the wrong model.
     */
    public async bind(slot: number, address: string, name?: string) {
        await this.open();
        if (!this.sendControl({ t: 'bind', slot, address, name })) {
            throw new Error(translate('err.bridgeLost'));
        }
        this.setBinding(slot, { name: name ?? '', address });
    }

    public async unbind(slot: number) {
        await this.open();
        if (!this.sendControl({ t: 'unbind', slot })) {
            throw new Error(translate('err.bridgeLost'));
        }
        this.setBinding(slot, null);
        this.handlers.get(slot)?.onUnbound();
    }

    /** Route one incoming frame. Public so it can be driven without a real socket. */
    public receive(data: string | ArrayBuffer) {
        if (typeof data !== 'string') {
            const frame = decodeNotifyFrame(data);
            if (frame && frame.payload.length > 0) this.handlers.get(frame.slot)?.onBinary(frame.payload);
            return;
        }

        let msg: Record<string, unknown>;
        try {
            msg = JSON.parse(data);
        } catch {
            console.error('[BridgeSocket] Malformed control message', data);
            return;
        }

        switch (msg.t) {
            case 'hello':
                this.handleHello(msg);
                break;
            case 'status':
                this.handleStatus(msg);
                break;
            case 'scanResult': {
                const found = (msg.devices as BridgeDevice[]) ?? [];
                this.scanListeners.forEach(listener => listener(found));
                break;
            }
            case 'error': {
                console.error(`[BridgeSocket] Bridge reported ${msg.code}: ${msg.msg}`);
                if (typeof msg.slot === 'number') {
                    this.handlers.get(msg.slot)?.onError(msg);
                } else {
                    const text = typeof msg.msg === 'string' ? msg.msg : translate('err.bridgeGeneric');
                    this.errorListeners.forEach(listener => listener(text));
                }
                break;
            }
            default:
                console.log('[BridgeSocket] Ignoring unknown control message', msg);
        }
    }

    private handleHello(msg: Record<string, unknown>) {
        const hello = parseHello(msg);

        if (!hello || !isSupportedVersion(hello.version)) {
            // No compatibility code for older bridges: say so and stop.
            this.incompatible = true;
            const text = translate('err.bridgeTooOld');
            const ws = this.ws;
            this.handlers.forEach(handler => handler.onError({ msg: text }));
            this.errorListeners.forEach(listener => listener(text));
            ws?.close();
            return;
        }

        console.log(`[BridgeSocket] Bridge v${hello.version}, ${hello.slots.length} slots`);
        this.bindings = hello.slots;
        this.notifySlots();
    }

    private handleStatus(msg: Record<string, unknown>) {
        if (typeof msg.slot !== 'number' || msg.slot < 0 || msg.slot >= this.bindings.length) {
            console.log('[BridgeSocket] Ignoring status without a valid slot', msg);
            return;
        }

        const wifi = typeof msg.wifiRssi === 'number' ? msg.wifiRssi : null;
        if (wifi !== this.wifiRssi) {
            this.wifiRssi = wifi;
            this.wifiListeners.forEach(listener => listener(wifi));
        }

        // The name rides on every status, not just the first: it selects the dashboard and feeds
        // the OTA model-mismatch guard, so it must not depend on catching one particular message.
        const current = this.bindings[msg.slot];
        const name = typeof msg.deviceName === 'string' && msg.deviceName !== '' ? msg.deviceName : current?.name;
        const address = typeof msg.address === 'string' && msg.address !== '' ? msg.address : current?.address;
        if (name !== undefined && address !== undefined) {
            this.setBinding(msg.slot, { name, address });
        }

        this.handlers.get(msg.slot)?.onStatus(msg);
    }

    private setBinding(slot: number, binding: SlotBinding | null) {
        const current = this.bindings[slot] ?? null;
        if (current?.name === binding?.name && current?.address === binding?.address) return;

        this.bindings = this.bindings.map((entry, index) => index === slot ? binding : entry);
        this.notifySlots();
    }

    private notifySlots() {
        this.slotListeners.forEach(listener => listener());
    }

    private handleClosed(ws: SocketLike) {
        if (this.ws !== ws) return;
        this.ws = null;
        this.handlers.forEach(handler => handler.onSocketGone());
    }
}
