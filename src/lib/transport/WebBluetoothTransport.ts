/// <reference types="web-bluetooth" />

import { ConnectionState } from '../ConnectionState';
import { TransportKind, type Transport, type TransportCallbacks } from './Transport';
import { translate } from '../../i18n/i18n';

export const SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
export const TX_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';
export const RX_UUID = '0000ff02-0000-1000-8000-00805f9b34fb';

const noop = () => {};

/**
 * Talks to the battery straight from the browser via Web Bluetooth. This is the original
 * transport, moved out of BLEConnectionManager unchanged.
 */
export class WebBluetoothTransport implements Transport {
    public readonly kind = TransportKind.WEB_BLUETOOTH;

    private device: BluetoothDevice | null = null;
    private txChar: BluetoothRemoteGATTCharacteristic | null = null;
    private rxChar: BluetoothRemoteGATTCharacteristic | null = null;

    private callbacks: TransportCallbacks = {
        onNotify: noop,
        onStateChange: noop,
        onRssi: noop,
        onDisconnected: noop,
    };

    public get deviceName(): string | undefined {
        return this.device?.name ?? undefined;
    }

    public get isConnected(): boolean {
        return this.device?.gatt?.connected === true;
    }

    public setCallbacks(callbacks: TransportCallbacks) {
        this.callbacks = callbacks;
    }

    private log(msg: string, data?: unknown) {
        console.log(`[WebBluetoothTransport] ${msg}`, data || '');
    }

    private error(msg: string, err?: unknown) {
        console.error(`[WebBluetoothTransport] ${msg}`, err || '');
    }

    async scanAndConnect() {
        if (!navigator.bluetooth) {
            this.error("Web Bluetooth not supported");
            return;
        }

        this.callbacks.onStateChange(ConnectionState.SCANNING);
        this.log("Starting Scan...");

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'MST_' }],
                optionalServices: [SERVICE_UUID]
            });

            this.log("Device selected:", this.device.name);

            this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);

            if (this.device.watchAdvertisements) {
                this.log("Starting RSSI watch...");
                this.device.addEventListener('advertisementreceived', (event) => {
                    this.callbacks.onRssi(event.rssi ?? -100);
                });
                await this.device.watchAdvertisements();
            }

            await this.connectGATT();
        } catch (err) {
            if ((err as Error).name === 'NotFoundError') {
                this.log("User cancelled scan");
                this.callbacks.onStateChange(ConnectionState.IDLE);
            } else {
                this.error("Scan Error", err);
                this.callbacks.onStateChange(ConnectionState.ERROR, (err as Error).message);
            }
        }
    }

    async reconnect() {
        if (!this.device) {
            this.error("Cannot reconnect: No device instance.");
            return;
        }
        this.log("Attempting Reconnect...");
        try {
            await this.connectGATT();
        } catch (err) {
            this.error("Reconnect Failed", err);
            this.callbacks.onStateChange(ConnectionState.ERROR, translate('err.reconnectFailed', { detail: (err as Error).message }));
        }
    }

    disconnect() {
        this.log("Disconnecting...");

        if (this.device && this.device.gatt?.connected) {
            this.device.gatt.disconnect();
        } else {
            this.handleDisconnect();
        }
    }

    private async connectGATT() {
        if (!this.device) return;

        this.callbacks.onStateChange(ConnectionState.CONNECTING);
        this.log("Connecting to GATT Server...");

        try {
            const server = await this.device.gatt?.connect();
            if (!server || !server.connected) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error(translate('err.gattFailed'));
            }
            this.log("GATT Connected");

            this.log(`Getting Service ${SERVICE_UUID}...`);
            const service = await server.getPrimaryService(SERVICE_UUID);

            this.log(`Getting TX Characteristic ${TX_UUID}...`);
            this.txChar = await service.getCharacteristic(TX_UUID);

            this.log(`Getting RX Characteristic ${RX_UUID}...`);
            this.rxChar = await service.getCharacteristic(RX_UUID);

            this.log("Starting Notifications on RX...");
            await this.rxChar.startNotifications();
            this.rxChar.addEventListener('characteristicvaluechanged', (e) => {
                const value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
                this.callbacks.onNotify(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
            });

            this.log("Connection Fully Established.");
            this.callbacks.onStateChange(ConnectionState.CONNECTED);

        } catch (err) {
            this.error("Connection Sequence Failed", err);
            if (this.device?.gatt?.connected) {
                this.device.gatt.disconnect();
            }
            throw err;
        }
    }

    async send(bytes: Uint8Array, withResponse: boolean) {
        if (!this.txChar || !this.isConnected) {
            throw new Error(translate('err.notConnected'));
        }

        if (withResponse) {
            await this.txChar.writeValue(bytes as BufferSource);
        } else {
            await this.txChar.writeValueWithoutResponse(bytes as BufferSource);
        }
    }

    private handleDisconnect = () => {
        this.log("Device Disconnected Event fired");

        this.txChar = null;
        this.rxChar = null;
        this.callbacks.onDisconnected();
    };
}
