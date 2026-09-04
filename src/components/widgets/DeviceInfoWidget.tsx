import { useEffect, useState } from 'react';
import {
    Paper, Typography, Box, IconButton, Stack,
    CircularProgress, Tooltip, Fade, Chip, Grid
} from '@mui/material';

import RefreshIcon from '@mui/icons-material/Refresh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import PowerIcon from '@mui/icons-material/Power';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import {COMMAND_ID} from "../../lib/VenusConst.ts";

interface Props {
    /**
     * Whether the device has an MPPT/PV stage at all. Venus E 3.0 has none: its Control FW's
     * device-info string ends at `inv_ver=%d` and carries no `mppt_v` key, so the row would
     * always read "--".
     */
    showMppt?: boolean;
}

export const DeviceInfoWidget = ({ showMppt = true }: Props) => {
    const { sendPacket, connectionState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const data = useVenusData(COMMAND_ID.DEVICE_INFO);

    const [isRefreshing, setIsRefreshing] = useState(false);

    const refresh = () => {
        if (isConnected) {
            setIsRefreshing(true);
            sendPacket(COMMAND_ID.DEVICE_INFO);

            setTimeout(() => setIsRefreshing(false), 5000);
        }
    };

    // The device tends to ignore commands for the first ~1-2s after connecting, so a single
    // request fired the instant we connect is usually lost (whereas a later manual refresh works).
    // Retry the initial fetch a few times, spaced out, until data actually arrives. Once `data`
    // is set this effect re-runs, returns early, and the previous run's cleanup cancels the loop.
    useEffect(() => {
        if (!isConnected || data) return;

        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout>;

        const attempt = () => {
            if (cancelled || attempts >= 6) return;
            attempts++;
            refresh();
            timer = setTimeout(attempt, 3000);
        };
        timer = setTimeout(attempt, 800);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [isConnected, data]);

    useEffect(() => {
        if (data) {
            setIsRefreshing(false);
        }
    }, [data]);

    const InfoRow = ({ label, value, icon, isLast = false }: { label: string, value?: string, icon?: React.ReactNode, isLast?: boolean }) => (
        <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            py={1}
            sx={{
                borderBottom: isLast ? 'none' : '1px solid',
                borderColor: 'rgba(0,0,0,0.05)'
            }}
        >
            <Box display="flex" alignItems="center" gap={1.5}>
                {icon && <Box color="text.secondary" sx={{ opacity: 0.7 }}>{icon}</Box>}
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {label}
                </Typography>
            </Box>
            <Typography variant="body2" fontFamily="monospace" fontWeight="bold" color="text.primary">
                {value || '--'}
            </Typography>
        </Box>
    );

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <InfoOutlinedIcon />
                    <Typography variant="h6" fontWeight="bold">Device Info</Typography>
                </Box>
                <Tooltip title="Refresh Data">
                    <span>
                        <IconButton
                            onClick={refresh}
                            disabled={!isConnected}
                            sx={{ color: 'inherit' }}
                        >
                            <RefreshIcon
                                sx={{
                                    animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                                    '@keyframes spin': {
                                        '0%': { transform: 'rotate(0deg)' },
                                        '100%': { transform: 'rotate(360deg)' },
                                    }
                                }}
                            />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: !data ? 'center' : 'flex-start' }}>

                {!data ? (
                    <Box textAlign="center" color="text.secondary">
                        {isConnected ? (
                            <>
                                <CircularProgress size={30} sx={{ mb: 1 }} />
                                <Typography variant="caption" display="block">Fetching Data...</Typography>
                            </>
                        ) : (
                            <Typography variant="body2">Waiting for connection...</Typography>
                        )}
                    </Box>
                ) : (
                    <Fade in={true}>
                        <Stack spacing={3}>

                            <Box>
                                <Chip label="Identity" size="small" color="primary" variant="outlined" sx={{ mb: 1, fontWeight: 'bold' }} />
                                <InfoRow
                                    label="Model Type"
                                    value={data.deviceType}
                                    icon={<SettingsInputComponentIcon fontSize="small" />}
                                />
                                <InfoRow
                                    label="Device ID"
                                    value={data.deviceId}
                                    icon={<FingerprintIcon fontSize="small" />}
                                />
                                <InfoRow
                                    label="MAC Address"
                                    value={data.macAddress}
                                    icon={<FingerprintIcon fontSize="small" />}
                                    isLast
                                />
                            </Box>

                            <Box>
                                <Chip label="Versions" size="small" color="secondary" variant="outlined" sx={{ mb: 1, fontWeight: 'bold' }} />
                                <Grid container columnSpacing={4}>
                                    <Grid size={{ xs: 12, sm: 6 }}>
                                        <InfoRow label="EMS FW (Control)" value={data.data.get('dev_ver')} icon={<MemoryIcon fontSize="small"/>} />
                                        <InfoRow label="BMS FW" value={data.data.get('bms_ver')} icon={<PowerIcon fontSize="small"/>} />
                                    </Grid>
                                    <Grid size={{ xs: 12, sm: 6 }}>
                                        <InfoRow label="VNS FW (Microinverter)" value={data.data.get('inv_ver')} icon={<PowerIcon fontSize="small"/>} />
                                        {showMppt && (
                                            <InfoRow label="MPPT FW" value={data.data.get('mppt_v')} icon={<PowerIcon fontSize="small"/>} />
                                        )}
                                        <InfoRow label="Communication Module" value={data.data.get('fc_ver')} icon={<MemoryIcon fontSize="small"/>} />
                                    </Grid>
                                </Grid>
                            </Box>

                        </Stack>
                    </Fade>
                )}
            </Box>
        </Paper>
    );
};
