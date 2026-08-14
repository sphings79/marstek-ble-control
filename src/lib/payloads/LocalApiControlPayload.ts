import { VenusPayload } from "./VenusPayload";

/**
 * Local API control (BLE command 0x28, Venus D Control FW).
 *
 * Enables/disables the device's local UDP JSON-RPC API and sets its port. The
 * enable flag (EEPROM 0x371) is read live by the UDP server task, JSON frame
 * parser and UDP comm state machine, so the toggle takes effect immediately.
 * NOTE: this is the *local API*, NOT Modbus TCP - Modbus cannot be toggled here.
 *
 * Wire payload (starting at packet byte[4]): [0] enable u8, [1..2] port u16 LE.
 * The firmware always writes the port, so send the desired port every time.
 */
export class LocalApiControlPayload extends VenusPayload {
    public enabled: boolean;
    public port: number;

    constructor(enabled: boolean, port: number) {
        super();
        this.enabled = enabled;
        this.port = port;
    }

    static FROM_BYTES(bytes: Uint8Array): LocalApiControlPayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new LocalApiControlPayload(bytes[0] === 1, view.getUint16(1, true));
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);

        view.setUint8(0, this.enabled ? 1 : 0);
        view.setUint16(1, this.port, true);

        return new Uint8Array(buffer);
    }
}
