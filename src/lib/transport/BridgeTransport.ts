import { ConnectionState } from '../ConnectionState';
import { BridgeSocket } from '../bridge/BridgeSocket';
import { encodeWriteFrame } from '../bridge/BridgeProtocol';
import { TransportKind, type Transport, type TransportCallbacks } from './Transport';
import { translate, type StringKey } from '../../i18n/i18n';

export type { BridgeDevice } from '../bridge/BridgeSocket';

const noop = () => {};

type BridgeState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const STATE_MAP: Record<BridgeState, ConnectionState> = {
    idle: ConnectionState.IDLE,
    connecting: ConnectionState.CONNECTING,
    connected: ConnectionState.CONNECTED,
    disconnected: ConnectionState.DISCONNECTED,
    error: ConnectionState.ERROR,
};

/**
 * Reaches one storage through an ESP32 that relays raw bytes over a WebSocket, so the browser no
 * longer has to be within Bluetooth range of it.
 *
 * The bridge holds several storages ("slots") behind one WebSocket. That socket is owned by a
 * shared BridgeSocket; there is one BridgeTransport per slot, which sees only the frames that name
 * its slot. See BridgeProtocol.ts for the wire format.
 */
export class BridgeTransport implements Transport {
    public readonly kind = TransportKind.BRIDGE;
    public readonly slot: number;
    private readonly socket: BridgeSocket;

    private state: BridgeState = 'idle';
    private mtu: number | null = null;

    private callbacks: TransportCallbacks = {
        onNotify: noop,
        onStateChange: noop,
        onRssi: noop,
        onDisconnected: noop,
    };

    constructor(slot: number, socket: BridgeSocket) {
        this.slot = slot;
        this.socket = socket;
        socket.registerSlot(slot, {
            onBinary: (bytes) => this.callbacks.onNotify(bytes),
            onStatus: (msg) => this.handleStatus(msg),
            onError: (msg) => this.callbacks.onStateChange(
                ConnectionState.ERROR,
                this.localise(typeof msg.msg === 'string' ? msg.msg : undefined) ?? translate('err.bridgeGeneric'),
            ),
            onSocketGone: () => this.handleSocketGone(),
            onUnbound: () => this.handleUnbound(),
        });
    }

    public get deviceName(): string | undefined {
        return this.socket.slots[this.slot]?.name || undefined;
    }

    public get boundDeviceAddress(): string | undefined {
        return this.socket.slots[this.slot]?.address;
    }

    public get isConnected(): boolean {
        return this.socket.isOpen && this.state === 'connected';
    }

    public setCallbacks(callbacks: TransportCallbacks) {
        this.callbacks = callbacks;
    }

    /**
     * Put a message from the bridge into the reader's language. Messages worth translating carry a
     * code in front of a pipe; anything else falls through as it arrived.
     */
    private localise(msg: string | undefined): string | undefined {
        if (!msg) return msg;

        const split = msg.indexOf('|');
        if (split < 1) return msg;

        const key = `bridgeMsg.${msg.slice(0, split)}` as StringKey;
        const fallback = msg.slice(split + 1);
        const translated = translate(key);

        return translated === key ? fallback : translated;
    }

    /** Open the socket if needed, then ask the bridge to connect this slot. */
    async scanAndConnect() {
        await this.socket.open();
        if (!this.socket.sendControl({ t: 'connect', slot: this.slot })) {
            this.callbacks.onStateChange(ConnectionState.ERROR, translate('err.bridgeLost'));
        }
    }

    async reconnect() {
        await this.scanAndConnect();
    }

    /** Hang up this slot only; the socket stays open for the others. */
    disconnect() {
        const wasConnected = this.state === 'connected';

        if (this.socket.isOpen) {
            this.socket.sendControl({ t: 'disconnect', slot: this.slot });
            this.state = 'disconnected';
            if (wasConnected) this.callbacks.onDisconnected();
            else this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
        } else {
            this.handleSocketGone();
        }
    }

    async send(bytes: Uint8Array, withResponse: boolean) {
        this.socket.sendBinary(encodeWriteFrame(this.slot, bytes, withResponse));
    }

    private handleStatus(msg: Record<string, unknown>) {
        if (typeof msg.rssi === 'number') this.callbacks.onRssi(msg.rssi);

        // 23 is the Bluetooth default and means no MTU exchange happened, which caps every
        // notification at 20 bytes.
        if (typeof msg.mtu === 'number' && msg.mtu !== this.mtu) {
            this.mtu = msg.mtu;
            console.log(`[BridgeTransport ${this.slot}] Negotiated MTU: ${msg.mtu} bytes${msg.mtu <= 23 ? ' (no exchange happened)' : ''}`);
        }

        const next = STATE_MAP[msg.state as BridgeState];
        if (!next) return;

        const previous = this.state;
        this.state = msg.state as BridgeState;
        this.callbacks.onStateChange(next, this.localise(typeof msg.msg === 'string' ? msg.msg : undefined));

        if (this.state === 'disconnected' && previous === 'connected') {
            this.callbacks.onDisconnected();
        }
    }

    private handleUnbound() {
        const wasConnected = this.state === 'connected';
        this.state = 'idle';
        if (wasConnected) this.callbacks.onDisconnected();
        this.callbacks.onStateChange(ConnectionState.IDLE);
    }

    private handleSocketGone() {
        const wasConnected = this.state === 'connected';
        this.state = 'disconnected';

        if (wasConnected) {
            this.callbacks.onDisconnected();
        } else {
            this.callbacks.onStateChange(ConnectionState.DISCONNECTED);
        }
    }
}
