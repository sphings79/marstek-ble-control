import { VenusPayload } from "./VenusPayload.ts";
import { MANUAL_MODE_SCHEDULE_ITEM_ACTION } from "../VenusConst.ts";

export class ManualWorkModeSlotControlPayload extends VenusPayload {
    public slotIndex: number;
    public action: MANUAL_MODE_SCHEDULE_ITEM_ACTION;
    public startHour: number;
    public startMinute: number;
    public endHour: number;
    public endMinute: number;
    public days: number;
    public absolutePowerLimit: number;
    public enabled: boolean;

    constructor(
        slotIndex: number,
        action: MANUAL_MODE_SCHEDULE_ITEM_ACTION,
        startHour: number,
        startMinute: number,
        endHour: number,
        endMinute: number,
        days: number,
        absolutePowerLimit: number,
        enabled: boolean
    ) {
        super();

        this.slotIndex = slotIndex;
        this.action = action;
        this.startHour = startHour;
        this.startMinute = startMinute;
        this.endHour = endHour;
        this.endMinute = endMinute;
        this.days = days;
        this.absolutePowerLimit = absolutePowerLimit;
        this.enabled = enabled;
    }

    static FROM_BYTES(): ManualWorkModeSlotControlPayload {
        return new ManualWorkModeSlotControlPayload(0,
            MANUAL_MODE_SCHEDULE_ITEM_ACTION.CHARGE, 
            0, 
            0, 
            0, 
            0, 
            0, 
            0, 
            false
        );
    }

    toBytes(): Uint8Array {
        const buffer = new ArrayBuffer(10);
        const view = new DataView(buffer);

        view.setUint8(0, 0x01);
        view.setUint8(1, this.slotIndex);
        view.setUint8(2, this.startHour);
        view.setUint8(3, this.startMinute);
        view.setUint8(4, this.endHour);
        view.setUint8(5, this.endMinute);
        view.setUint8(6, this.days);

        let rawPower = 0;
        if (this.action === MANUAL_MODE_SCHEDULE_ITEM_ACTION.SELF_CONSUMPTION) {
            rawPower = -1; // 0xFFFF
        } else if (this.action === MANUAL_MODE_SCHEDULE_ITEM_ACTION.CHARGE || this.action === MANUAL_MODE_SCHEDULE_ITEM_ACTION.UPS) {
            rawPower = -(this.absolutePowerLimit || 0);
        } else if (this.action === MANUAL_MODE_SCHEDULE_ITEM_ACTION.DISCHARGE) {
            rawPower = this.absolutePowerLimit || 0;
        }

        view.setInt16(7, rawPower, true);
        view.setUint8(9, this.enabled ? 0x01 : 0x00);

        return new Uint8Array(buffer);
    }
}
