import DashboardIcon from '@mui/icons-material/Dashboard';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import BoltIcon from '@mui/icons-material/Bolt';
import ElectricMeterIcon from '@mui/icons-material/ElectricMeter';
import SettingsIcon from '@mui/icons-material/Settings';
import { ResponsiveDashboard, type WidgetGroup } from '../ResponsiveDashboard';
import { DeviceInfoWidget } from '../widgets/DeviceInfoWidget';
import { FactoryResetWidget } from '../widgets/FactoryResetWidget';
import { StateWidget } from '../widgets/StateWidget';
import { TogglesWidget } from "../widgets/TogglesWidget.tsx";
import { DepthOfDischargeWidget } from "../widgets/DepthOfDischargeWidget.tsx";
import { PowerLimitsWidget } from "../widgets/PowerLimitsWidget.tsx";
import { CTWidget } from "../widgets/CTWidget.tsx";
import { WorkModeWidget } from "../widgets/WorkModeWidget.tsx";
import { OtaWidget } from "../widgets/OtaWidget.tsx";
import { PeakShavingWidget } from "../widgets/PeakShavingWidget.tsx";
import { LocalApiWidget } from "../widgets/LocalApiWidget.tsx";
import { SetTimeWidget } from "../widgets/SetTimeWidget.tsx";
import { SelfControlPowerOffsetWidget } from "../widgets/SelfControlPowerOffsetWidget.tsx";

// Venus E 3.0 (dev type VNSE3-0, BLE name MST_VNSE3_xxxx). The Control firmware is the same
// codebase as the Venus A and Venus D builds - Control 149 shares 96% of its string table with
// both, has the identical reset handler at 0x08004a70, and the same BLE command handlers. What
// differs is hardware scope, and that is what this view accounts for.
//
// OTA: decompiled from Control 150 VNSE3-0, the cmd 0x52 validator (0x0802c7a4) carries the same
// 4-way target table as the Venus D one that has been verified on real hardware - type==0 + model
// check + magic 0x0000/0xFFFF (EMS), type==2/0x2222 (MPPT), type==3/0x3333 (BMS), type==4/0x4444
// (VNS/Micro). The device-side model check (0x08004624) is `strstr("VNSEE3-0", <RAM string>)`, so
// it does NOT inspect the uploaded image's own model tag - the client-side check in
// FirmwareAnalysis.ts remains the only real guard.
//
// No MPPT/PV stage. Confirmed against VNSD-0 by five independent markers, all present on Venus D
// and absent here: the device-info format string ends at `inv_ver=%d` with no `mppt_v` key, there
// are no `pv1_voltage`/`pv1_state`/... JSON keys, no `...,mppt=%d,pv1=%d|%d,...` runtime line, no
// `&mpptv=%d` in the cloud upload URL, and no `[MQTT] Get mppt data...` handler. The remaining
// generic `mppt` strings (OTA MPPT, ctl_mppt_power) are shared-codebase leftovers with no data
// path. StateWidget hides its PV tile on its own once every MPPT channel reports disabled/0 W.
//
// No multi-module BMS: the per-module report (`...BMS: num=%d,mask=%d,idx=%d,...soc1..soc6...`)
// exists in the Venus A and Venus D builds but not here, so BatteryModulesStateWidget is left out.
// Venus E 3.0 scales via parallel units (`[BLE] Set parallel machine, enable = %d.`), not internal
// packs.
//
// No surplus feed-in - see TogglesWidget's showSurplusFeedIn.
//
// Confirmed present in the VNSE3-0 Control 150 BLE handlers, hence the widgets below: peak shaving
// (`Set Peak shaving, power = %d, peak_state = %d.`), local API (`Set local api enable` / `port`),
// time (`Sys time set, ...`), self-consumption offset (`, Set Selfcontrol Power = (%d) W`), charge
// and discharge power limits (`Set max charge power` / `Set max discharge power`), work-mode
// schedule slots (`Set time period, ...`), CT/meter (`Recv ip_len = %d, meter_ip: %s.`), LED,
// backup power and factory reset.
//
// Tuning parameters, both firmware-confirmed rather than guessed:
// - 2500 W ceiling: the config parser (0x080135ac) defaults both max charge and max discharge to
//   0x9c4 = 2500, matching the vendor spec (5.12 kWh / 2.5 kW, backup output 2.5 kW).
// - DoD 30-88%: the setter (0x0800673c) accepts 0 or 30..88 and rejects everything else; the same
//   bounds appear again in the local-API handler and the MQTT handler.
//
// Grouping drives the mobile hamburger menu. On desktop every widget is still shown in the grid,
// flattened in this order. The first group ("Overview") is the mobile landing view.
const groups: WidgetGroup[] = [
    {
        key: 'overview',
        labelKey: 'group.overview',
        icon: <DashboardIcon />,
        widgets: [<StateWidget />, <DeviceInfoWidget showMppt={false} />],
    },
    {
        key: 'power',
        labelKey: 'group.power',
        icon: <BoltIcon />,
        widgets: [
            <TogglesWidget showSurplusFeedIn={false} />,
            <WorkModeWidget scheduleItemMaxPower={2500} scheduleItemUPSSupported={true} />,
            <PowerLimitsWidget
                dischargeOptions={[800, 1200, 1500, 2000, 2500]}
                chargeOptions={[800, 1200, 1500, 2000, 2500]}
            />,
            <PeakShavingWidget />,
            <SelfControlPowerOffsetWidget />,
        ],
    },
    {
        key: 'battery',
        labelKey: 'group.battery',
        icon: <BatteryChargingFullIcon />,
        widgets: [<DepthOfDischargeWidget min={30} max={88} />],
    },
    {
        key: 'meter',
        labelKey: 'group.meter',
        icon: <ElectricMeterIcon />,
        widgets: [<CTWidget />],
    },
    {
        key: 'system',
        labelKey: 'group.system',
        icon: <SettingsIcon />,
        widgets: [<LocalApiWidget />, <SetTimeWidget />, <FactoryResetWidget />, <OtaWidget />],
    },
];

export const VenusEView = () => {
    return <ResponsiveDashboard groups={groups} />;
};
