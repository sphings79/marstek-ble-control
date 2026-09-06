import { useEffect } from 'react';
import {
    Paper, Typography, Box, CircularProgress, Grid, LinearProgress, Chip, Stack, Alert
} from '@mui/material';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import BoltIcon from '@mui/icons-material/Bolt';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import {COMMAND_ID} from "../../lib/VenusConst.ts";
import {EvStation} from "@mui/icons-material";

const REQUEST_PAYLOAD = new Uint8Array([0x01]);

export const BatteryModulesStateWidget = () => {
    const t = useT();
    const { sendPacket, connectionState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const data = useVenusData(COMMAND_ID.BATTERY_MODULES_STATE);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        if (isConnected) {
            sendPacket(COMMAND_ID.BATTERY_MODULES_STATE, REQUEST_PAYLOAD).catch(() => {});

            interval = setInterval(() => {
                sendPacket(COMMAND_ID.BATTERY_MODULES_STATE, REQUEST_PAYLOAD)
                    .catch(e => console.error("Poll modules failed", e));
            }, 5000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isConnected]);

    const getStatusInfo = (status: number) => {
        switch (status) {
            case 2:
                return {
                    label: t('modules.discharging'),
                    icon: <EvStation fontSize="inherit" />,
                    color: "warning.main"
                };
            case 1:
                return {
                    label: t('modules.charging'),
                    icon: <BoltIcon fontSize="inherit" />,
                    color: "success.main"
                };
            case 0:
                return {
                    label: t('modules.running'),
                    icon: null,
                    color: "text.main"
                };
            default:
                return {
                    label: t('modules.unknown', { code: status.toString(16) }),
                    icon: null,
                    color: "text.secondary"
                };
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'primary.dark', color: 'primary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <ViewModuleIcon />
                <Typography variant="h6" fontWeight="bold">{t('modules.title')}</Typography>
                {data && (
                    <Chip
                        label={t('modules.count', { count: data.moduleCount })}
                        size="small"
                        color="primary"
                        sx={{ ml: 'auto', bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                    />
                )}
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto' }}>
                {!isConnected ? (
                    <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                        <Typography variant="body2" color="text.secondary">{t('state.waitingConnection')}</Typography>
                    </Box>
                ) : !data ? (
                    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="100%">
                        <CircularProgress size={24} />
                        <Typography variant="caption" display="block" mt={1}>{t('modules.reading')}</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2}>
                        {/* Saying so rather than quietly listing fewer cards than the chip above
                            promises. The storage counts every pack but its answer only carries
                            six sets of readings. */}
                        {data.isTruncated && (
                            <Grid size={12}>
                                <Alert severity="info">
                                    {t('modules.truncated', {
                                        reported: data.moduleCount,
                                        shown: data.moduleStates.length,
                                    })}
                                </Alert>
                            </Grid>
                        )}
                        {data.moduleStates.map((mod) => {
                            const statusInfo = getStatusInfo(mod.status);

                            return (
                                <Grid size={12} key={mod.index}>
                                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                                        {mod.status === 1 && (
                                            <Box sx={{
                                                position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px',
                                                bgcolor: 'success.main'
                                            }} />
                                        )}

                                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                            <Box display="flex" alignItems="center" gap={1} pl={mod.status === 1 ? 1 : 0}>
                                                <BatteryChargingFullIcon color={mod.soc > 20 ? "success" : "warning"} fontSize="small" />
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {t('modules.module', { index: mod.index })}
                                                </Typography>
                                            </Box>
                                            <Typography variant="body2" fontWeight="bold" fontFamily="monospace">
                                                {mod.soc.toFixed(1)}%
                                            </Typography>
                                        </Box>

                                        <LinearProgress
                                            variant="determinate"
                                            value={mod.soc}
                                            sx={{ height: 6, borderRadius: 3, mb: 1.5, ml: mod.status === 1 ? 1 : 0 }}
                                            color={mod.soc > 20 ? "success" : "warning"}
                                        />

                                        <Box display="flex" justifyContent="space-between" alignItems="center" pl={mod.status === 1 ? 1 : 0}>
                                            <Stack direction="row" spacing={1} alignItems="center" title={t('modules.temperature')}>
                                                <ThermostatIcon fontSize="small" color="action" />
                                                <Typography variant="caption" color="text.secondary">
                                                    {mod.temperature.toFixed(1)}°C
                                                </Typography>
                                            </Stack>

                                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: statusInfo.color }}>
                                                <Box display="flex" fontSize="1rem">{statusInfo.icon}</Box>
                                                <Typography variant="caption" fontWeight="bold" color="inherit">
                                                    {statusInfo.label}
                                                </Typography>
                                            </Stack>
                                        </Box>
                                    </Paper>
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Box>
        </Paper>
    );
};
