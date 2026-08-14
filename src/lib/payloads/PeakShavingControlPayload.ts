import { VenusPayload } from "./VenusPayload";

/**
 * Peak Shaving control (BLE command 0x29, firmware v150+).
 *
 * Wire payload (little-endian), starting at packet byte[4]:
 *   [0]    peak_state : u8   (1 = on, 0 = off)
 *   [1..2] power      : i16  (peak power threshold in Watts)
 *
 * Firmware persists both values to EEPROM 0x394 and flips the inverter
 * power-setpoint deadband clamp so grid power is capped at the threshold.
 */
export class PeakShavingControlPayload extends VenusPayload {
    public isOn: boolean;
    public power: number; // Watts

    constructor(isOn: boolean, power: number) {
        super();
        this.isOn = isOn;
        this.power = power;
    }

    static FROM_BYTES(bytes: Uint8Array): PeakShavingControlPayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new PeakShavingControlPayload(bytes[0] === 1, view.getInt16(1, true));
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);

        view.setUint8(0, this.isOn ? 1 : 0);
        view.setInt16(1, this.power, true);

        return new Uint8Array(buffer);
    }
}
