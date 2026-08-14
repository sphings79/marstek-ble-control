import { VenusPayload } from "./VenusPayload";

/**
 * Self-consumption power offset (BLE command 0x55, Venus D Control FW).
 *
 * Signed bias (Watts) for the self-consumption controller: instead of targeting
 * 0 W at the grid, the device regulates to this offset (e.g. +50 W = keep a small
 * continuous import as a buffer). Uses the same Config_Write_PowerOffset path as
 * the (confirmed-working) Peak Shaving command.
 *
 * Wire payload (starting at packet byte[4]): [0..1] offset i16 LE (Watts, signed).
 */
export class SelfControlPowerOffsetPayload extends VenusPayload {
    public offset: number; // Watts, signed

    constructor(offset: number) {
        super();
        this.offset = offset;
    }

    static FROM_BYTES(bytes: Uint8Array): SelfControlPowerOffsetPayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new SelfControlPowerOffsetPayload(view.getInt16(0, true));
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);

        view.setInt16(0, this.offset, true);

        return new Uint8Array(buffer);
    }
}
