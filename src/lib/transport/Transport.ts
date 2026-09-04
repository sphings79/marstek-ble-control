import type { ConnectionState } from '../ConnectionState';

/**
 * How the app reaches the battery.
 *
 * WEB_BLUETOOTH talks to the device directly from the browser. BRIDGE goes through an ESP32 that
 * relays raw bytes over a WebSocket, which trades Bluetooth range for network latency - callers
 * that care about timing (OTA above all) should scale their timeouts by this.
 */
export const TransportKind = Object.freeze({
    WEB_BLUETOOTH: 'web-bluetooth',
    BRIDGE: 'bridge',
});
export type TransportKind = (typeof TransportKind)[keyof typeof TransportKind];

export interface TransportCallbacks {
    /** One inbound notification, exactly as the device sent it. Never merged, never split. */
    onNotify: (bytes: Uint8Array) => void;
    onStateChange: (state: ConnectionState, msg?: string) => void;
    onRssi: (rssi: number) => void;
    /** The link is gone - whether we hung up or the device did. */
    onDisconnected: () => void;
}

/**
 * Everything BLEConnectionManager needs from the outside world: a way to reach one device, and
 * bytes in both directions. Frame reassembly, packet dispatch, polling and the TX mutex all sit
 * above this and are transport-agnostic.
 *
 * `deviceName` is not cosmetic: it drives model detection (which dashboard you get) and the OTA
 * model-mismatch guard. A transport that cannot report it silently degrades both, so every
 * implementation must supply the BLE advertised name.
 */
export interface Transport {
    readonly kind: TransportKind;
    /** BLE advertised name of the connected device, e.g. "MST_VNSD_1234". */
    readonly deviceName: string | undefined;
    readonly isConnected: boolean;

    setCallbacks(callbacks: TransportCallbacks): void;

    /** Pick a device (however this transport does that) and connect to it. */
    scanAndConnect(): Promise<void>;
    /** Reconnect to the device picked earlier, without asking again. */
    reconnect(): Promise<void>;
    disconnect(): void;

    /**
     * Write to the device's TX characteristic. `withResponse` picks between an acknowledged write
     * and a fire-and-forget one - regular commands use the former, OTA chunks the latter.
     */
    send(bytes: Uint8Array, withResponse: boolean): Promise<void>;
}
