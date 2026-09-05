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
import { BatteryModulesStateWidget } from "../widgets/BatteryModulesStateWidget.tsx";
import { CTWidget } from "../widgets/CTWidget.tsx";
import { WorkModeWidget } from "../widgets/WorkModeWidget.tsx";
import { OtaWidget } from "../widgets/OtaWidget.tsx";
import { PeakShavingWidget } from "../widgets/PeakShavingWidget.tsx";
import { LocalApiWidget } from "../widgets/LocalApiWidget.tsx";
import { SetTimeWidget } from "../widgets/SetTimeWidget.tsx";
import { SelfControlPowerOffsetWidget } from "../widgets/SelfControlPowerOffsetWidget.tsx";

// OTA is enabled here because the Venus A Control FW implements the exact same BLE OTA protocol
// as the Venus D it was originally verified on. Decompiled from Control 149 VNSA-0: the OTA frame
// dispatcher (0x0802534a) handles cmds 0x23/0x3A/0x50/0x51/0x52, and the cmd 0x52 validator
// (0x0802e120) carries the identical 4-way target table - type==0 + model check + magic 0x0000/
// 0xFFFF (EMS), type==2/0x2222 (MPPT), type==3/0x3333 (BMS), type==4/0x4444 (VNS/Micro) - matching
// the Venus D findings in VENUS_D_OTA_ADAPTATION.md instruction for instruction.
//
// The device-side model check (0x08004498) is `strstr("VNSA-0", <RAM string>)`, i.e. it does NOT
// look at the uploaded image's own model tag. The client-side check in FirmwareAnalysis.ts is
// therefore the only real guard against flashing another model's EMS firmware.
//
// The DoD range below is firmware-confirmed for Venus A: the setter (0x08006884) accepts 0 or
// 30..88 and rejects everything else.
//
// Local API, Set Time and the self-consumption offset are present in every sampled Venus A
// Control build (149 and 150): `[BLE] Set local api enable` / `Set local api port: %d,
// read_port: %d.`, `[BLE] Sys time set, year = %d, ...` and `, Set Selfcontrol Power = (%d) W`.
// Peak shaving only appears from Control 150 on (`[BLE] Set Peak shaving, power = %d,
// peak_state = %d.` is absent in 149) - same firmware-version gate as on the Venus D, so the
// widget is included unconditionally and reports back what the connected device supports.
//
// Grouping drives the mobile hamburger menu. On desktop every widget is still shown in the grid,
// flattened in this order. The first group ("Overview") is the mobile landing view.
const groups: WidgetGroup[] = [
    {
        key: 'overview',
        labelKey: 'group.overview',
        icon: <DashboardIcon />,
        widgets: [<StateWidget />, <DeviceInfoWidget />],
    },
    {
        key: 'power',
        labelKey: 'group.power',
        icon: <BoltIcon />,
        widgets: [
            <TogglesWidget />,
            <WorkModeWidget scheduleItemMaxPower={1500} scheduleItemUPSSupported={true} />,
            <PowerLimitsWidget
                dischargeOptions={[800, 1200, 1500]}
                chargeOptions={[800, 1200, 1500]}
            />,
            <PeakShavingWidget />,
            <SelfControlPowerOffsetWidget />,
        ],
    },
    {
        key: 'battery',
        labelKey: 'group.battery',
        icon: <BatteryChargingFullIcon />,
        widgets: [<BatteryModulesStateWidget />, <DepthOfDischargeWidget min={30} max={88} />],
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

export const VenusAView = () => {
    return <ResponsiveDashboard groups={groups} />;
};
