import { VenusPayload } from "./VenusPayload";

/**
 * Device power class selector (BLE command 0x15, Venus D Control FW).
 *
 * The firmware only accepts three values: 800 / 2200 / 2500 (Watts). Selecting a
 * class persists it to EEPROM and, for 800 W, additionally clamps all schedule slot
 * powers to 800 W. Wire payload is a little-endian u16 starting at packet byte[4].
 */
export const DEVICE_POWER_CLASS_OPTIONS = [800, 2200, 2500] as const;

export class DevicePowerClassControlPayload extends VenusPayload {
    public powerClass: number;

    constructor(powerClass: number) {
        super();
        this.powerClass = powerClass;
    }

    static FROM_BYTES(bytes: Uint8Array): DevicePowerClassControlPayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new DevicePowerClassControlPayload(view.getUint16(0, true));
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);

        view.setUint16(0, this.powerClass, true);

        return new Uint8Array(buffer);
    }
}
