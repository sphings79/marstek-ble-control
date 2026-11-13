import DashboardIcon from '@mui/icons-material/Dashboard';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import BoltIcon from '@mui/icons-material/Bolt';
import ElectricMeterIcon from '@mui/icons-material/ElectricMeter';
import SettingsIcon from '@mui/icons-material/Settings';
import { ResponsiveDashboard, type WidgetGroup } from '../ResponsiveDashboard';
import { DeviceInfoWidget } from '../widgets/DeviceInfoWidget';
import { StateWidget } from '../widgets/StateWidget';
import { TogglesWidget } from "../widgets/TogglesWidget.tsx";
import { DepthOfDischargeWidget } from "../widgets/DepthOfDischargeWidget.tsx";
import { PowerLimitsWidget } from "../widgets/PowerLimitsWidget.tsx";
import { CTWidget } from "../widgets/CTWidget.tsx";
import { WorkModeWidget } from "../widgets/WorkModeWidget.tsx";
import { LocalApiWidget } from "../widgets/LocalApiWidget.tsx";
import { SetTimeWidget } from "../widgets/SetTimeWidget.tsx";

// Venus E v1/v2 (dev type HMG-50, BLE name MST_ACCP_xxxx). NOT TESTED ON REAL HARDWARE - everything
// here comes from static analysis of Control FW 153-158.1 (HMG-50). The firmware is an older line
// than Venus A/D/E 3.0 but speaks the same framing (73 | LEN | 23 | CMD | payload | XOR, GATT ff00).
//
// What the firmware does NOT have, hence what this view leaves out:
// - Peak shaving (0x29), self-control power offset (0x55), surplus feed-in (0x41) and the battery
//   module report (0x42): no handler in the BLE dispatcher. One pack only, no MPPT/PV.
// - BLE OTA (0x52 / 0x3A): absent. 0x10 / 0x1B only start an update of the FC41D radio module.
//
// Left out because it could not be confirmed without hardware:
// - Factory reset: modes 1 and 2 exist, the effect of each was not fully read out.
// - CT meter type: values 0..11 are accepted, which value is which meter is unknown.
// - LED switch: command 0x59 exists (FW 158+), but RuntimeInfo carries no LED state.
// - Inverter state chip: no value table for RuntimeInfo byte 4.
// - BMS version row: device-info `bms_ver` reads the SoC byte in 158 (unresolved).
//
// Version dependent, handled by the payload length (see StatePayload): Bluetooth switch and DoD
// need Control 156+ (111-byte RuntimeInfo); on 153/155 those rows say "not supported".
//
// Limits read out of the 158 command handlers:
// - Power class (0x15): only 800 and 2500 W. 800 W also clamps the schedule slots.
// - Max charge (0x16) / discharge (0x17): up to 2500 W; with the 800 W class discharge is capped at 800 W.
// - DoD (0x54): 0 or 30..90 %.
// - Global work modes (0x09): 0 self-consumption, 1 manual (10 slots), 5 economy / "AI".
const groups: WidgetGroup[] = [
    {
        key: 'overview',
        labelKey: 'group.overview',
        icon: <DashboardIcon />,
        widgets: [
            <StateWidget showInverterState={false} />,
            <DeviceInfoWidget showMppt={false} showVns={false} showBms={false} />,
        ],
    },
    {
        key: 'power',
        labelKey: 'group.power',
        icon: <BoltIcon />,
        widgets: [
            <TogglesWidget showSurplusFeedIn={false} showLed={false} />,
            <WorkModeWidget scheduleItemMaxPower={2500} economyModeSupported={true} />,
            <PowerLimitsWidget
                chargeOptions={[800, 1200, 1500, 2000, 2500]}
                dischargeOptions={[800, 1200, 1500, 2000, 2500]}
                powerClassOptions={[800, 2500]}
                deviceClassNoteKey="powerLimits.deviceClassNote.e12"
            />,
        ],
    },
    {
        key: 'battery',
        labelKey: 'group.battery',
        icon: <BatteryChargingFullIcon />,
        widgets: [<DepthOfDischargeWidget min={30} max={90} />],
    },
    {
        key: 'meter',
        labelKey: 'group.meter',
        icon: <ElectricMeterIcon />,
        widgets: [<CTWidget showTypeSelect={false} />],
    },
    {
        key: 'system',
        labelKey: 'group.system',
        icon: <SettingsIcon />,
        widgets: [<LocalApiWidget />, <SetTimeWidget />],
    },
];

export const VenusE12View = () => {
    return <ResponsiveDashboard groups={groups} />;
};
