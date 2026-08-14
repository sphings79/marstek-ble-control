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

// Venus D support is confirmed working on real hardware (VNS and BMS OTA updates verified by
// users). It reuses the exact same
// widgets/commands as VenusAView because the shared BLE command IDs (STATE, DEVICE_INFO,
// GET_WORK_MODE_SETTINGS, DEPTH_OF_DISCHARGE_CONTROL, CHARGE/DISCHARGE_POWER_LIMIT_CONTROL, ...)
// and the STATE (cmd 0x03) payload byte layout have been cross-checked against Venus D-specific
// Ghidra reverse-engineering (decompiled straight from the Venus D Control FW's own BLE
// RuntimeInfo builder) and line up with StatePayload.FROM_BYTES at every offset that's been
// confirmed on both sides (grid/battery power @0x00/0x02, inverter state @0x04, daily/monthly/
// total energy counters @0x0E-0x2D, etc.) - see the sibling "Marstek Venus Monitor" project's
// VENUS_D_OTA_ADAPTATION.md and the "Marstek Venus D FW Debug" project's
// BLE/BLE_Command_Map_v150.md + BLE/BLE_Modbus_CrossReference.md for the underlying evidence.
//
// Peak Shaving (cmd 0x29), Device Power Class (cmd 0x15), Local API (cmd 0x28), Set Time
// (cmd 0x0B) and Self-Consumption Offset (cmd 0x55) were decompiled from the Venus D Control FW
// v150 BLE command dispatcher (BLE_Cmd_Dispatch @0x08007F20) and confirmed to have real
// consumers. Note: the free max-discharge-power limit is cmd 0x17 - 0x15 only accepts the
// 800/2200/2500 W class. (Meter-IP/Generator/Auto-mode-change commands exist in the FW but are
// set-and-report-only in v150, so they are intentionally not exposed here.)
//
// What is NOT yet confirmed for Venus D specifically:
// - Every other command's payload layout (WorkMode settings, CT readings, Battery Modules
//   State, Toggles, ...) - only STATE/DeviceInfo have been cross-referenced against decompiled
//   Venus D firmware so far.
// - The numeric tuning parameters below (power limit options, schedule power range). The 2500W
//   ceiling comes from Venus D's own Modbus write registers (42020 set_charge_power / 42021
//   set_discharge_power, documented range 0-2500W, and the Micro/inverter FW's "Max-Power-Cap
//   2500W (0x9C4)" finding) - so 2500W as an upper bound is FW-confirmed. The specific preset
//   steps offered here (800/1200/1500/2000/2500) are a guess at reasonable round numbers, not
//   a confirmed list of what the vendor app itself offers.
// - Depth-of-discharge min/max: left at the widget's Venus-A-derived defaults (30-88%) because
//   no Venus D-specific DoD range has been confirmed yet. Needs live verification.
// Grouping drives the mobile hamburger menu. On desktop every widget is still shown in the grid,
// flattened in this order. The first group ("Overview") is the mobile landing view.
const groups: WidgetGroup[] = [
    {
        key: 'overview',
        label: 'Overview',
        icon: <DashboardIcon />,
        widgets: [<StateWidget />, <DeviceInfoWidget />],
    },
    {
        key: 'power',
        label: 'Power & Modes',
        icon: <BoltIcon />,
        widgets: [
            <TogglesWidget />,
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
        label: 'Battery',
        icon: <BatteryChargingFullIcon />,
        widgets: [<BatteryModulesStateWidget />, <DepthOfDischargeWidget />],
    },
    {
        key: 'meter',
        label: 'Meter (CT)',
        icon: <ElectricMeterIcon />,
        widgets: [<CTWidget />],
    },
    {
        key: 'system',
        label: 'System & Firmware',
        icon: <SettingsIcon />,
        widgets: [<LocalApiWidget />, <SetTimeWidget />, <FactoryResetWidget />, <OtaWidget />],
    },
];

export const VenusDView = () => {
    return <ResponsiveDashboard groups={groups} />;
};
