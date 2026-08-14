export const COMMAND_ID = Object.freeze({
    STATE: 0x03,
    DEVICE_INFO: 0x04,
    FACTORY_RESET: 0x06,

    SET_WORK_MODE: 0x09,
    GET_WORK_MODE_SETTINGS: 0x0A,
    SET_TIME: 0x0B,

    BACKUP_POWER_CONTROL: 0x0F,

    // 0x15 selects the device power class (800 / 2200 / 2500 W) and, for 800 W, clamps all
    // schedule slots to 800 W. It is NOT a free discharge limit - the firmware only accepts
    // those three values. (Verified in Venus D Control FW v150, BLE_Cmd_Dispatch case 0x15.)
    DEVICE_POWER_CLASS_CONTROL: 0x15,
    CHARGE_POWER_LIMIT_CONTROL: 0x16,
    // Free max discharge power (0-2500 W) is command 0x17, not 0x15 (bug fix).
    DISCHARGE_POWER_LIMIT_CONTROL: 0x17,

    CT_TYPE_CONTROL: 0x18,
    CT_MODE_CONTROL: 0x19,

    CT_READINGS: 0x1A,

    PHASE_AUTODETECTION: 0x1D,

    // Enables/disables the local UDP JSON-RPC API and sets its port (NOT Modbus TCP).
    LOCAL_API_CONTROL: 0x28,

    // Peak Shaving (firmware v150+): caps grid power at a configurable threshold.
    PEAK_SHAVING_CONTROL: 0x29,

    SURPLUS_FEED_IN_CONTROL: 0x41,
    BATTERY_MODULES_STATE: 0x42,

    BLUETOOTH_CONTROL: 0x53,
    DEPTH_OF_DISCHARGE_CONTROL: 0x54,
    // Signed watt bias for the self-consumption controller (target grid power instead of 0 W).
    SELF_CONTROL_POWER_OFFSET: 0x55,

    LED_CONTROL: 0x59
});
export type COMMAND_ID = (typeof COMMAND_ID)[keyof typeof COMMAND_ID];

export const WORK_MODE = Object.freeze({
    SELF_CONSUMPTION: 0x00,
    MANUAL: 0x01
});
export type WORK_MODE = (typeof WORK_MODE)[keyof typeof WORK_MODE];

export const MANUAL_MODE_SCHEDULE_ITEM_ACTION = Object.freeze({
    CHARGE: 0x00,
    DISCHARGE: 0x01,
    SELF_CONSUMPTION: 0x02,
    UPS: 0x03
});
export type MANUAL_MODE_SCHEDULE_ITEM_ACTION = (typeof MANUAL_MODE_SCHEDULE_ITEM_ACTION)[keyof typeof MANUAL_MODE_SCHEDULE_ITEM_ACTION];

export const MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT = Object.freeze({
    NONE:      0b00000000,
    MONDAY:    0b00000001,
    TUESDAY:   0b00000010,
    WEDNESDAY: 0b00000100,
    THURSDAY:  0b00001000,
    FRIDAY:    0b00010000,
    SATURDAY:  0b00100000,
    SUNDAY:    0b01000000,
    EVERYDAY:  0b01111111
});
export type MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT = (typeof MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT)[keyof typeof MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT];


export const CT_TYPE = Object.freeze({
    SHELLY_PRO_3EM: 0x01,

    MARSTEK_CT003: 0x04,
    SHELLY_3EM: 0x05,
    SHELLY_PRO_EM_50: 0x06,
});
export type CT_TYPE = (typeof CT_TYPE)[keyof typeof CT_TYPE];

export const CT_MODE = Object.freeze({
    SINGLE_PHASE: 0x00,
    THREE_PHASE: 0x01
});
export type CT_MODE = (typeof CT_MODE)[keyof typeof CT_MODE];

export const PHASE = Object.freeze({
    SCANNING: 0x00,

    L1: 0x01,
    L2: 0x02,
    L3: 0x03,

    // FIXME What is 0x04?
    ERROR: 0x05,
});
export type PHASE = (typeof PHASE)[keyof typeof PHASE];

export const INVERTER_STATE = Object.freeze({
    SLEEP: 0x00,
    STANDBY: 0x01,
    CHARGE: 0x02,
    DISCHARGE: 0x03,
    BACKUP: 0x04,
    OTA: 0x05,
    BYPASS: 0x06,
});
export type INVERTER_STATE = (typeof INVERTER_STATE)[keyof typeof INVERTER_STATE];
