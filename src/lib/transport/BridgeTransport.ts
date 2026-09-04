import { ConnectionState } from '../ConnectionState';
import { bridgeUrl } from '../bridge/BridgeApi';
import { TransportKind, type Transport, type TransportCallbacks } from './Transport';

/** One device the bridge saw while scanning. */
export interface BridgeDevice {
    name: string;
    address: string;
    rssi: number;
}

/** Write kind, encoded as the first byte of every outbound binary frame. */
const WRITE_WITHOUT_RESPONSE = 0x00;
const WRITE_WITH_RESPONSE = 0x01;

const noop = () => {};

type BridgeState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'error';

const STATE_MAP: Record<BridgeState, ConnectionState> = {
    idle: ConnectionState.IDLE,
    scanning: ConnectionState.SCANNING,
    connecting: ConnectionState.CONNECTING,
    connected: ConnectionState.CONNECTED,
    disconnected: ConnectionState.DISCONNECTED,
    error: ConnectionState.ERROR,
};

/**
 * Reaches the battery through an ESP32 that relays raw bytes over a WebSocket, so the browser no
 * longer has to be within Bluetooth range of the storage.
 *
 * Wire format, as specified for the marstek-ble-bridge firmware:
 *
 * - Text frames carry JSON control messages in both directions.
 * - Binary frames carry device bytes. Outbound they are prefixed with one byte selecting the BLE
 *   write kind (0x01 acknowledged for commands, 0x00 unacknowledged for OTA chunks), because that
 *   distinction exists in Transport.send() and would otherwise be lost in transit. Inbound frames
 *   carry no prefix: one frame is exactly one notification, never merged and never split, which is
 *   what the reassembler upstream expects.
 *
 * The session cookie set at login rides along automatically because the socket is same-origin.
 */
export class BridgeTransport implements Transport {
    public readonly kind = TransportKind.BRIDGE;

    private socket: WebSocket | null = null;
    private state: BridgeState = 'idle';

    private boundDeviceName: string | undefined;
    private boundAddress: string | undefined;

    private callbacks: TransportCallbacks = {
        onNotify: noop,
        onStateChange: noop,
        onRssi: noop,
        onDisconnected: noop,
    };

    private mtu: number | null = null;
    private wifiRssi: number | null = null;
    private wifiListeners = new Set<(rssi: number | null) => void>();

    /**
     * Subscribe to the bridge's own WiFi signal strength. A relayed frame crosses two radio links,
     * and the WiFi one is the harder to notice from the browser. Returns an unsubscribe function.
     */
    public onWifiRssi(listener: (rssi: number | null) => void): () => void {
        this.wifiListeners.add(listener);
        listener(this.wifiRssi);
        return () => { this.wifiListeners.delete(listener); };
    }

    private scanListeners = new Set<(devices: BridgeDevice[]) => void>();

    /** Subscribe to scan results for the device picker. Returns an unsubscribe function. */
    public onScanResults(listener: (devices: BridgeDevice[]) => void): () => void {
        this.scanListeners.add(listener);
        return () => { this.scanListeners.delete(listener); };
    }

    public get deviceName(): string | undefined {
        return this.boundDeviceName;
    }

    public get boundDeviceAddress(): string | undefined {
        return this.boundAddress;
    }

    public get isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN && this.state === 'connected';
    }

    public setCallbacks(callbacks: TransportCallbacks) {
        this.callbacks = callbacks;
    }

    private log(msg: string, data?: unknown) {
        console.log(`[BridgeTransport] ${msg}`, data || '');
    }

    private error(msg: string, err?: unknown) {
        console.error(`[BridgeTransport] ${msg}`, err || '');
    }

    /** Open the socket if needed, then ask the bridge to connect to the bound device. */
    async scanAndConnect() {
        await this.openSocket();
        this.sendControl({ t: 'connect' });
    }

    async reconnect() {
        await this.scanAndConnect();
    }

    disconnect() {
        this.log('Disconnecting...');

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.sendControl({ t: 'disconnect' });
            this.socket.close();
        } else {
            this.handleSocketGone();
        }
    }

    /**
     * Open the socket without asking the bridge to do anything.
     *
     * Connecting is enough to learn which storage it is bound to and what state it is in, which a
     * screen needs before the user has clicked anything.
     */
    async hello() {
        await this.openSocket();
    }

    /** Ask the bridge to scan for reachable devices; results arrive via onScanResults(). */
    async scan(seconds = 5) {
        await this.openSocket();
        this.sendControl({ t: 'scan', seconds });
    }

    /**
     * Pin the bridge to a device. Survives reboots on the bridge side.
     *
     * The name goes along because it decides which dashboard is shown and guards firmware updates
     * against the wrong model. The bridge reads it from the device itself as well, so this is
     * belt and braces rather than the only source.
     */
    async bind(address: string, name?: string) {
        await this.openSocket();
        this.sendControl({ t: 'bind', address, name });
    }

    async send(bytes: Uint8Array, withResponse: boolean) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected');
        }

        const frame = new Uint8Array(bytes.length + 1);
        frame[0] = withResponse ? WRITE_WITH_RESPONSE : WRITE_WITHOUT_RESPONSE;
        frame.set(bytes, 1);

        this.socket.send(frame);
    }

    private openSocket(): Promise<void> {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return this.socketReady();
        }

        const url = bridgeUrl('api/ws');
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

        this.log(`Opening ${url.href}`);
        const socket = new WebSocket(url.href);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;

        socket.addEventListener('message', (event) => this.handleMessage(event));
        socket.addEventListener('close', () => this.handleSocketGone());
        socket.addEventListener('error', () => {
            this.error('WebSocket error');
            this.callbacks.onStateChange(ConnectionState.ERROR, 'Bridge connection failed');
        });

        return this.socketReady();
    }

    private socketReady(): Promise<void> {
        const socket = this.socket;
        if (!socket) return Promise.reject(new Error('No socket'));
        if (socket.readyState === WebSocket.OPEN) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(); };
            const onFail = () => { cleanup(); reject(new Error('Bridge connection failed')); };
            const cleanup = () => {
                socket.removeEventListener('open', onOpen);
                socket.removeEventListener('error', onFail);
                socket.removeEventListener('close', onFail);
            };

            socket.addEventListener('open', onOpen);
            socket.addEventListener('error', onFail);
            socket.addEventListener('close', onFail);
        });
    }

    private sendControl(msg: Record<string, unknown>) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            this.error('Cannot send control message: socket not open', msg);
            return;
        }
        this.socket.send(JSON.stringify(msg));
    }

    private handleMessage(event: MessageEvent) {
        // Binary: one inbound notification, verbatim.
        if (event.data instanceof ArrayBuffer) {
            this.callbacks.onNotify(new Uint8Array(event.data));
            return;
        }

        if (typeof event.data !== 'string') return;

        let msg: Record<string, unknown>;
        try {
            msg = JSON.parse(event.data);
        } catch {
            this.error('Malformed control message', event.data);
            return;
        }

        switch (msg.t) {
            case 'hello': {
                const bound = msg.bound as { name?: string; address?: string } | null | undefined;
                this.boundDeviceName = bound?.name;
                this.boundAddress = bound?.address;
                this.log(`Bridge v${msg.version}, bound device: ${this.boundDeviceName ?? 'none'}`);
                break;
            }
            case 'status': {
                // The device name rides on every status update, not just the first - it selects the
                // dashboard and feeds the OTA model-mismatch guard, so it must not depend on having
                // caught one particular message.
                if (typeof msg.deviceName === 'string') this.boundDeviceName = msg.deviceName;
                if (typeof msg.address === 'string') this.boundAddress = msg.address;
                if (typeof msg.rssi === 'number') this.callbacks.onRssi(msg.rssi);

                // 23 is the Bluetooth default and means no MTU exchange happened, which caps every
                // notification at 20 bytes. Worth seeing when a storage that answers over Web
                // Bluetooth stays silent through the bridge.
                if (typeof msg.mtu === 'number' && msg.mtu !== this.mtu) {
                    this.mtu = msg.mtu;
                    this.log(`Negotiated MTU: ${msg.mtu} bytes${msg.mtu <= 23 ? ' (no exchange happened)' : ''}`);
                }

                const wifi = typeof msg.wifiRssi === 'number' ? msg.wifiRssi : null;
                if (wifi !== this.wifiRssi) {
                    this.wifiRssi = wifi;
                    this.wifiListeners.forEach(listener => listener(wifi));
                }

                const next = STATE_MAP[msg.state as BridgeState];
                if (next) {
                    const previous = this.state;
                    this.state = msg.state as BridgeState;
                    this.callbacks.onStateChange(next, typeof msg.msg === 'string' ? msg.msg : undefined);

                    if (this.state === 'disconnected' && previous === 'connected') {
                        this.callbacks.onDisconnected();
                    }
                }
                break;
            }
            case 'scanResult': {
                const found = (msg.devices as BridgeDevice[]) ?? [];
                this.scanListeners.forEach(listener => listener(found));
                break;
            }
            case 'error':
                this.error(`Bridge reported ${msg.code}: ${msg.msg}`);
                this.callbacks.onStateChange(ConnectionState.ERROR, String(msg.msg ?? 'Bridge error'));
                break;
            default:
                this.log('Ignoring unknown control message', msg);
        }
    }

    private handleSocketGone() {
        const wasConnected = this.state === 'connected';
        this.socket = null;
        this.state = 'disconnected';

        if (wasConnected) {
            this.callbacks.onDisconnected();
        } else {
            this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
        }
    }
}
