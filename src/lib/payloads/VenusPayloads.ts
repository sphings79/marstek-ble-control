import { DeviceInfoPayload } from './DeviceInfoPayload';
import {StatePayload} from "./StatePayload.ts";
import {LedControlPayload} from "./LedControlPayload.ts";
import {BackupPowerControlPayload} from "./BackupPowerControlPayload.ts";
import {SurplusFeedInControlPayload} from "./SurplusFeedInControlPayload.ts";
import {DepthOfDischargeControlPayload} from "./DepthOfDischargeControlPayload.ts";
import {DischargePowerLimitControlPayload} from "./DischargePowerLimitControlPayload.ts";
import {ChargePowerLimitControlPayload} from "./ChargePowerLimitControlPayload.ts";
import {DevicePowerClassControlPayload} from "./DevicePowerClassControlPayload.ts";
import {PeakShavingControlPayload} from "./PeakShavingControlPayload.ts";
import {LocalApiControlPayload} from "./LocalApiControlPayload.ts";
import {SetTimePayload} from "./SetTimePayload.ts";
import {SelfControlPowerOffsetPayload} from "./SelfControlPowerOffsetPayload.ts";
import {BatteryModulesStatePayload} from "./BatteryModulesStatePayload.ts";
import {COMMAND_ID} from "../VenusConst.ts";
import {CTReadingsPayload} from "./CTReadingsPayload.ts";
import {CTTypeControlPayload} from "./CTTypeControlPayload.ts";
import {CTModeControlPayload} from "./CTModeControlPayload.ts";
import {SetWorkModePayload} from "./SetWorkModePayload.ts";
import {GetWorkModeSettingsPayload} from "./GetWorkModeSettingsPayload.ts";
import {BluetoothControlPayload} from "./BluetoothControlPayload.ts";

export interface VenusPayloadStatic<T> {
    new (...args: any[]): any;
    FROM_BYTES(bytes: Uint8Array): T;
}

export const VenusRegistry = {
    [COMMAND_ID.STATE]: StatePayload,
    [COMMAND_ID.DEVICE_INFO]: DeviceInfoPayload,

    [COMMAND_ID.SET_WORK_MODE]: SetWorkModePayload,
    [COMMAND_ID.GET_WORK_MODE_SETTINGS]: GetWorkModeSettingsPayload,
    [COMMAND_ID.SET_TIME]: SetTimePayload,

    [COMMAND_ID.BACKUP_POWER_CONTROL]: BackupPowerControlPayload,
    [COMMAND_ID.DEVICE_POWER_CLASS_CONTROL]: DevicePowerClassControlPayload,
    [COMMAND_ID.DISCHARGE_POWER_LIMIT_CONTROL]: DischargePowerLimitControlPayload,
    [COMMAND_ID.CHARGE_POWER_LIMIT_CONTROL]: ChargePowerLimitControlPayload,

    [COMMAND_ID.LOCAL_API_CONTROL]: LocalApiControlPayload,
    [COMMAND_ID.PEAK_SHAVING_CONTROL]: PeakShavingControlPayload,
    [COMMAND_ID.SELF_CONTROL_POWER_OFFSET]: SelfControlPowerOffsetPayload,

    [COMMAND_ID.CT_TYPE_CONTROL]: CTTypeControlPayload,
    [COMMAND_ID.CT_MODE_CONTROL]: CTModeControlPayload,

    [COMMAND_ID.CT_READINGS]: CTReadingsPayload,

    [COMMAND_ID.SURPLUS_FEED_IN_CONTROL]: SurplusFeedInControlPayload,
    [COMMAND_ID.BATTERY_MODULES_STATE]: BatteryModulesStatePayload,

    [COMMAND_ID.BLUETOOTH_CONTROL]: BluetoothControlPayload,
    [COMMAND_ID.DEPTH_OF_DISCHARGE_CONTROL]: DepthOfDischargeControlPayload,
    [COMMAND_ID.LED_CONTROL]: LedControlPayload,
} as const;

export type VenusData<ID extends keyof typeof VenusRegistry> =
    ReturnType<typeof VenusRegistry[ID]['FROM_BYTES']>;
