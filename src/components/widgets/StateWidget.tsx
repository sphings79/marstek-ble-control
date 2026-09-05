import {
    Paper, Typography, Box, CircularProgress, Chip, Stack, Divider
} from '@mui/material';
import SpeedIcon from '@mui/icons-material/Speed';
import BatteryStdIcon from '@mui/icons-material/BatteryStd';
import ElectricMeterIcon from '@mui/icons-material/ElectricMeter';
import TimelineIcon from '@mui/icons-material/Timeline';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import PowerIcon from '@mui/icons-material/Power';
import OutletIcon from '@mui/icons-material/Outlet';
import SolarPowerIcon from '@mui/icons-material/SolarPower';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID, INVERTER_STATE } from "../../lib/VenusConst.ts";
import type { StateAttributes } from '../../lib/payloads/StatePayload';
import { useT, type Translate } from '../../i18n/I18nContext';

const getInverterStateLabel = (t: Translate, state?: number) => {
    switch (state) {
        case INVERTER_STATE.SLEEP: return t('inverter.sleep');
        case INVERTER_STATE.STANDBY: return t('inverter.standby');
        case INVERTER_STATE.CHARGE: return t('inverter.charge');
        case INVERTER_STATE.DISCHARGE: return t('inverter.discharge');
        case INVERTER_STATE.BACKUP: return t('inverter.backup');
        case INVERTER_STATE.OTA: return t('inverter.ota');
        case INVERTER_STATE.BYPASS: return t('inverter.bypass');
        default: return state !== undefined
            ? t('inverter.unknownCode', { code: state.toString(16) })
            : t('inverter.unknown');
    }
};

const getInverterStateColor = (state?: number) => {
    switch (state) {
        case INVERTER_STATE.CHARGE: return 'success.main';
        case INVERTER_STATE.DISCHARGE: return 'warning.main';
        case INVERTER_STATE.BACKUP: return 'error.main';
        case INVERTER_STATE.STANDBY:
        case INVERTER_STATE.SLEEP: return 'text.secondary';
        default: return 'primary.main';
    }
};

const formatKWh = (val: number | undefined) =>
    val !== undefined ? `${(val / 1000).toFixed(2)} kWh` : '--';

const formatW = (val: number | undefined) =>
    val !== undefined ? `${val} W` : '--';

const formatPct = (val: number | undefined) =>
    val !== undefined ? `${val}%` : '--';

// The device always reports four MPPT slots, even on units without PV inputs. Only surface the ones
// that are flagged enabled or actually deliver power, so a Venus without solar doesn't get four 0 W rows.
const getActiveMppts = (attrs: StateAttributes) => [
    { label: 'PV 1', power: attrs.MPPT1Power, enabled: attrs.MPPT1Enabled },
    { label: 'PV 2', power: attrs.MPPT2Power, enabled: attrs.MPPT2Enabled },
    { label: 'PV 3', power: attrs.MPPT3Power, enabled: attrs.MPPT3Enabled },
    { label: 'PV 4', power: attrs.MPPT4Power, enabled: attrs.MPPT4Enabled },
].filter(mppt => mppt.enabled === true || (mppt.power !== undefined && mppt.power > 0));

const ReadingRow = ({ label, value, icon, isLast = false }: { label: string, value: string, icon?: React.ReactNode, isLast?: boolean }) => (
    <Box display="flex" justifyContent="space-between" alignItems="center" py={1.5} sx={{ borderBottom: isLast ? 'none' : '1px solid', borderColor: 'rgba(0,0,0,0.05)' }}>
        <Box display="flex" alignItems="center" gap={1.5}>
            {icon && <Box color="text.secondary" display="flex" sx={{ opacity: 0.7 }}>{icon}</Box>}
            <Typography variant="body2" color="text.secondary" fontWeight={500}>{label}</Typography>
        </Box>
        <Typography variant="body1" fontFamily="monospace" fontWeight="bold" color="text.primary">
            {value}
        </Typography>
    </Box>
);

const HistoryBlock = ({ label, energyIn, energyOut }: { label: string, energyIn?: number, energyOut?: number }) => {
    const t = useT();

    return (
    <Box flex={1} textAlign="center">
        <Typography variant="caption" color="text.secondary" fontWeight="bold" display="block" mb={1}>
            {label}
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'rgba(0,0,0,0.01)', border: 'none', borderRadius: 2 }}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">{t('state.in')}</Typography>
                <Typography variant="caption" fontFamily="monospace" fontWeight="bold" color="success.main">
                    {formatKWh(energyIn)}
                </Typography>
            </Box>
            <Box display="flex" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{t('state.out')}</Typography>
                <Typography variant="caption" fontFamily="monospace" fontWeight="bold" color="warning.main">
                    {formatKWh(energyOut)}
                </Typography>
            </Box>
        </Paper>
    </Box>
    );
};

export const StateWidget = () => {
    const t = useT();
    const { connectionState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const data = useVenusData(COMMAND_ID.STATE);
    const attrs = data?.attributes;

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.main', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <SpeedIcon />
                    <Typography variant="h6" fontWeight="bold">{t('state.title')}</Typography>
                </Box>
                {attrs && attrs.InverterState !== undefined && (
                    <Chip
                        label={getInverterStateLabel(t, attrs.InverterState)}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(255,255,255,0.9)',
                            color: getInverterStateColor(attrs.InverterState),
                            fontWeight: 'bold'
                        }}
                    />
                )}
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                        <Typography variant="body2" color="text.secondary">{t('state.waitingConnection')}</Typography>
                    </Box>
                ) : !attrs ? (
                    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%">
                        <CircularProgress size={24} sx={{ mb: 1 }} />
                        <Typography variant="caption" display="block" color="text.secondary">
                            {t('state.waitingPoll')}
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={3}>
                        <Box>
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                <SyncAltIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                    {t('state.liveReadings')}
                                </Typography>
                            </Box>
                            <Box sx={{ px: 1 }}>
                                <ReadingRow label={t('state.soc')} value={formatPct(attrs.SoC)} icon={<BatteryStdIcon fontSize="small" />} />
                                <ReadingRow label={t('state.remainingEnergy')} value={formatKWh(attrs.RemainingEnergy)} icon={<BatteryStdIcon fontSize="small" />} />
                                <ReadingRow label={t('state.batteryPower')} value={formatW(attrs.BatteryPower)} icon={<BatteryStdIcon fontSize="small" />} />
                                <ReadingRow label={t('state.gridPower')} value={formatW(attrs.GridPower)} icon={<ElectricMeterIcon fontSize="small" />} />
                                <ReadingRow label={t('state.acPower')} value={formatW(attrs.AcOutputPower)} icon={<PowerIcon fontSize="small" />} />
                                <ReadingRow label={t('state.backupLoad')} value={formatW(attrs.BackupLoadPower)} icon={<OutletIcon fontSize="small" />} isLast />
                            </Box>
                        </Box>

                        {(() => {
                            const mppts = getActiveMppts(attrs);

                            if (mppts.length === 0) {
                                return null;
                            }

                            const total = mppts.reduce((sum, mppt) => sum + (mppt.power ?? 0), 0);

                            return (
                                <>
                                    <Divider />

                                    <Box>
                                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                                            <SolarPowerIcon fontSize="small" color="primary" />
                                            <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                                {t('state.solarInput')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ px: 1 }}>
                                            {mppts.map((mppt, idx) => (
                                                <ReadingRow
                                                    key={mppt.label}
                                                    label={mppt.label}
                                                    value={formatW(mppt.power)}
                                                    icon={<SolarPowerIcon fontSize="small" />}
                                                    isLast={mppts.length === 1 && idx === 0}
                                                />
                                            ))}
                                            {mppts.length > 1 && (
                                                <ReadingRow
                                                    label={t('state.pvTotal')}
                                                    value={formatW(Math.round(total * 10) / 10)}
                                                    icon={<SolarPowerIcon fontSize="small" />}
                                                    isLast
                                                />
                                            )}
                                        </Box>
                                    </Box>
                                </>
                            );
                        })()}

                        <Divider />

                        <Box>
                            <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <TimelineIcon fontSize="small" color="primary" />
                                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                    {t('state.energyStatistics')}
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={2}>
                                <HistoryBlock label={t('state.today')} energyIn={attrs.DailyEnergyIn} energyOut={attrs.DailyEnergyOut} />
                                <HistoryBlock label={t('state.thisMonth')} energyIn={attrs.MonthlyEnergyIn} energyOut={attrs.MonthlyEnergyOut} />
                                <HistoryBlock label={t('state.lifetime')} energyIn={attrs.TotalEnergyIn} energyOut={attrs.TotalEnergyOut} />
                            </Stack>
                        </Box>

                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
