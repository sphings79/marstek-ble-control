import { VenusPayload } from "./VenusPayload";

/**
 * Set device RTC (BLE command 0x0B, Venus D Control FW).
 *
 * Calls RTC_SetDateTime() on the hardware clock (used by the schedule/TOU logic),
 * so this genuinely takes effect. Send the full year (e.g. 2026) - the firmware
 * subtracts 2000 internally. Values are the device's local wall-clock time.
 *
 * Wire payload (starting at packet byte[4]):
 *   [0..1] year u16 LE · [2] month · [3] day · [4] hour · [5] minute · [6] second
 */
export class SetTimePayload extends VenusPayload {
    public year: number;
    public month: number;
    public day: number;
    public hour: number;
    public minute: number;
    public second: number;

    constructor(year: number, month: number, day: number, hour: number, minute: number, second: number) {
        super();
        this.year = year;
        this.month = month;
        this.day = day;
        this.hour = hour;
        this.minute = minute;
        this.second = second;
    }

    static now(): SetTimePayload {
        const d = new Date();
        return new SetTimePayload(
            d.getFullYear(), d.getMonth() + 1, d.getDate(),
            d.getHours(), d.getMinutes(), d.getSeconds()
        );
    }

    static fromDate(d: Date): SetTimePayload {
        return new SetTimePayload(
            d.getFullYear(), d.getMonth() + 1, d.getDate(),
            d.getHours(), d.getMinutes(), d.getSeconds()
        );
    }

    static FROM_BYTES(bytes: Uint8Array): SetTimePayload {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        return new SetTimePayload(
            view.getUint16(0, true), bytes[2], bytes[3], bytes[4], bytes[5], bytes[6]
        );
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(7);
        const view = new DataView(buffer);

        view.setUint16(0, this.year, true);
        view.setUint8(2, this.month);
        view.setUint8(3, this.day);
        view.setUint8(4, this.hour);
        view.setUint8(5, this.minute);
        view.setUint8(6, this.second);

        return new Uint8Array(buffer);
    }
}
