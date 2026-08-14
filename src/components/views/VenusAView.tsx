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
            <WorkModeWidget scheduleItemMaxPower={1500} scheduleItemUPSSupported={true} />,
            <PowerLimitsWidget
                dischargeOptions={[800, 1200, 1500]}
                chargeOptions={[800, 1200, 1500]}
            />,
        ],
    },
    {
        key: 'battery',
        label: 'Battery',
        icon: <BatteryChargingFullIcon />,
        widgets: [<BatteryModulesStateWidget />, <DepthOfDischargeWidget min={30} max={88} />],
    },
    {
        key: 'meter',
        label: 'Meter (CT)',
        icon: <ElectricMeterIcon />,
        widgets: [<CTWidget />],
    },
    {
        key: 'system',
        label: 'System',
        icon: <SettingsIcon />,
        widgets: [<FactoryResetWidget />],
    },
];

export const VenusAView = () => {
    return <ResponsiveDashboard groups={groups} />;
};
