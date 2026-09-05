import React, { useEffect, useState, useRef } from 'react';
import {
    Paper, Typography, Box, CircularProgress,
    ToggleButton, ToggleButtonGroup, Button, Chip,
    FormControl, InputLabel, Select, MenuItem,
    Fade, Divider, Stack, Grid, type SelectChangeEvent
} from '@mui/material';
import SensorsIcon from '@mui/icons-material/Sensors';
import AutorenewIcon from '@mui/icons-material/Autorenew';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID, CT_TYPE, CT_MODE, PHASE } from '../../lib/VenusConst';
import { useT } from '../../i18n/i18n';
import { CTTypeControlPayload } from '../../lib/payloads/CTTypeControlPayload';
import { CTModeControlPayload } from '../../lib/payloads/CTModeControlPayload';

const READINGS_REQUEST_PAYLOAD = new Uint8Array([0x0a, 0x0b, 0x0c]);
const PHASE_DETECT_PAYLOAD = new Uint8Array([0x0a, 0x0b, 0x0c]);

export const CTWidget = () => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);
    const ctConnected = stateData?.attributes.CTConnected;
    const serverCtType = stateData?.attributes.CTType;
    const serverCtMode = stateData?.attributes.CTMode;
    const serverPhase = stateData?.attributes.Phase;

    const readingsData = useVenusData(COMMAND_ID.CT_READINGS);

    const [selectedType, setSelectedType] = useState<number | ''>('');
    const [selectedMode, setSelectedMode] = useState<number | null>(null);

    const [isConfigBusy, setIsConfigBusy] = useState(false);
    const [isFetchingReadings, setIsFetchingReadings] = useState(false);
    const [isDetectingPhase, setIsDetectingPhase] = useState(false);

    const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const busyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const detectPhaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!isConfigBusy) {
            if (serverCtType !== undefined) setSelectedType(serverCtType);
            if (serverCtMode !== undefined) setSelectedMode(serverCtMode);
        }
    }, [serverCtType, serverCtMode, isConfigBusy]);

    useEffect(() => {
        if (isFetchingReadings) {
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
            setIsFetchingReadings(false);
        }
    }, [readingsData]);

    const handleTypeChange = async (event: SelectChangeEvent<number>) => {
        const newVal = event.target.value as number;
        if (!isConnected || isConfigBusy) return;

        setSelectedType(newVal);
        setIsConfigBusy(true);

        if (busyTimeoutRef.current) {
            clearTimeout(busyTimeoutRef.current);
        }
        busyTimeoutRef.current = setTimeout(() => setIsConfigBusy(false), 7_500);

        try {
            const payload = new CTTypeControlPayload(newVal as CT_TYPE);
            await sendPacket(COMMAND_ID.CT_TYPE_CONTROL, payload.toBytes());
            pollState();
        } catch (err) {
            console.error("Failed to set CT Type", err);
            setIsConfigBusy(false);
            if (serverCtType !== undefined) {
                setSelectedType(serverCtType);
            }
        }
    };

    const handleModeChange = async (_: React.MouseEvent<HTMLElement>, newVal: number | null) => {
        if (newVal === null || !isConnected || isConfigBusy) {
            return;
        }

        setSelectedMode(newVal);
        setIsConfigBusy(true);

        if (configTimeoutRef.current) {
            clearTimeout(configTimeoutRef.current);
        }
        configTimeoutRef.current = setTimeout(() => setIsConfigBusy(false), 7_500);

        try {
            const payload = new CTModeControlPayload(newVal as CT_MODE);
            await sendPacket(COMMAND_ID.CT_MODE_CONTROL, payload.toBytes());
            pollState();
        } catch (err) {
            console.error("Failed to set CT Mode", err);
            setIsConfigBusy(false);
            if (serverCtMode !== undefined) {
                setSelectedMode(serverCtMode);
            }
        }
    };

    const handleDetectPhase = async () => {
        if (!isConnected || isDetectingPhase) {
            return;
        }

        setIsDetectingPhase(true);

        if (detectPhaseTimeoutRef.current) {
            clearTimeout(detectPhaseTimeoutRef.current);
        }
        
        detectPhaseTimeoutRef.current = setTimeout(() => {
            setIsDetectingPhase(false);
        }, 8_000); // A lie!

        try {
            await sendPacket(COMMAND_ID.PHASE_AUTODETECTION, PHASE_DETECT_PAYLOAD);
            
            setTimeout(() => pollState(), 2_000);
        } catch (err) {
            console.error("Failed to start phase detection", err);
            if (detectPhaseTimeoutRef.current) {
                clearTimeout(detectPhaseTimeoutRef.current);
            }
            setIsDetectingPhase(false);
        }
    };

    const fetchReadings = async () => {
        if (!isConnected || isFetchingReadings) {
            return;
        }

        setIsFetchingReadings(true);

        if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
        }
        fetchTimeoutRef.current = setTimeout(() => {
            setIsFetchingReadings(false);
        }, 7_500);

        try {
            await sendPacket(COMMAND_ID.CT_READINGS, READINGS_REQUEST_PAYLOAD);
        } catch (err) {
            console.error("Failed to fetch CT Readings", err);
            if (fetchTimeoutRef.current) {
                clearTimeout(fetchTimeoutRef.current);
            }
            setIsFetchingReadings(false);
        }
    };

    const hasState = !!stateData;

    const getPhaseLabel = (phase: number | undefined) => {
        switch (phase) {
            case PHASE.L1:
                return t('ct.onL1');
            case PHASE.L2:
                return t('ct.onL2');
            case PHASE.L3:
                return t('ct.onL3');
            case PHASE.ERROR:
                return t('ct.detectFailed');
            default:
                return t('ct.unknownPhase', { code: phase?.toString(16) || '?' });
        }
    };

    const getPhaseColor = (phase: number | undefined) => {
        switch (phase) {
            case PHASE.L1:
            case PHASE.L2:
            case PHASE.L3: 
                return 'primary.main';
            case PHASE.ERROR: 
                return 'error.main';
            default: 
                return 'text.secondary';
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'success.dark', color: 'success.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <SensorsIcon />
                    <Typography variant="h6" fontWeight="bold">{t('ct.title')}</Typography>
                </Box>
                {hasState && (
                    <Chip
                        label={t(ctConnected ? 'ct.connected' : 'ct.disconnected')}
                        size="small"
                        color={ctConnected ? "success" : "default"}
                        sx={{
                            bgcolor: ctConnected ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                            color: 'white',
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
                ) : !hasState ? (
                    <Box textAlign="center" py={4}>
                        <CircularProgress size={24} />
                        <Typography variant="caption" display="block" mt={1}>{t('ct.syncing')}</Typography>
                    </Box>
                ) : (
                    <Stack spacing={3}>
                        <Box>
                            <FormControl fullWidth size="small" disabled={isConfigBusy} sx={{ mb: 2 }}>
                                <InputLabel>{t('ct.meterType')}</InputLabel>
                                <Select
                                    value={selectedType}
                                    label={t('ct.meterType')}
                                    onChange={handleTypeChange}
                                >
                                    <MenuItem value={CT_TYPE.SHELLY_PRO_3EM}>Shelly Pro 3EM</MenuItem>
                                    <MenuItem value={CT_TYPE.MARSTEK_CT003}>Marstek CT003</MenuItem>
                                    <MenuItem value={CT_TYPE.SHELLY_3EM}>Shelly 3EM</MenuItem>
                                    <MenuItem value={CT_TYPE.SHELLY_PRO_EM_50}>Shelly Pro EM 50</MenuItem>
                                </Select>
                            </FormControl>

                            <ToggleButtonGroup
                                value={selectedMode}
                                exclusive
                                onChange={handleModeChange}
                                disabled={isConfigBusy}
                                fullWidth
                                color="primary"
                                size="small"
                            >
                                <ToggleButton value={CT_MODE.SINGLE_PHASE} sx={{ fontWeight: 'bold' }}>
                                    {t('ct.singlePhase')}
                                </ToggleButton>
                                <ToggleButton value={CT_MODE.THREE_PHASE} sx={{ fontWeight: 'bold' }}>
                                    {t('ct.threePhase')}
                                </ToggleButton>
                            </ToggleButtonGroup>
                        </Box>

                        <Box>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                    {t('ct.phaseConnection')}
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AutorenewIcon sx={{ animation: (serverPhase === PHASE.SCANNING || isDetectingPhase) ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />}
                                    onClick={handleDetectPhase}
                                    disabled={isDetectingPhase || serverPhase === PHASE.SCANNING || isConfigBusy}
                                >
                                    {t('ct.autoDetect')}
                                </Button>
                            </Box>

                            <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                                {serverPhase === PHASE.SCANNING || isDetectingPhase ? (
                                    <Box display="flex" alignItems="center" gap={1} color="warning.main">
                                        <CircularProgress size={16} color="inherit" />
                                        <Typography variant="body2" fontWeight="bold">{t('ct.detecting')}</Typography>
                                    </Box>
                                ) : (
                                    <Typography
                                        variant="body1"
                                        fontWeight="bold"
                                        color={getPhaseColor(serverPhase)}
                                    >
                                        {getPhaseLabel(serverPhase)}
                                    </Typography>
                                )}
                            </Paper>
                        </Box>

                        <Divider />

                        <Box>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                    {t('state.liveReadings')}
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AutorenewIcon sx={{ animation: isFetchingReadings ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />}
                                    onClick={fetchReadings}
                                    disabled={isFetchingReadings}
                                >
                                    {t('ct.fetch')}
                                </Button>
                            </Box>

                            {!readingsData ? (
                                <Typography variant="body2" color="text.secondary" textAlign="center" py={2} sx={{ fontStyle: 'italic' }}>
                                    {t('ct.noReadings')}
                                </Typography>
                            ) : (
                                <Fade in={true}>
                                    <Grid container spacing={1.5}>
                                        <Grid size={{ xs: 6 }}>
                                            <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">{t('ct.l1')}</Typography>
                                                <Typography variant="body1" fontWeight="bold" fontFamily="monospace">{readingsData.l1} W</Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">{t('ct.l2')}</Typography>
                                                <Typography variant="body1" fontWeight="bold" fontFamily="monospace">{readingsData.l2} W</Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                                                <Typography variant="caption" color="text.secondary" display="block">{t('ct.l3')}</Typography>
                                                <Typography variant="body1" fontWeight="bold" fontFamily="monospace">{readingsData.l3} W</Typography>
                                            </Paper>
                                        </Grid>
                                        <Grid size={{ xs: 6 }}>
                                            <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'success.light', color: 'success.contrastText', border: 'none' }}>
                                                <Typography variant="caption" display="block" sx={{ opacity: 0.8 }}>{t('ct.total')}</Typography>
                                                <Typography variant="body1" fontWeight="bold" fontFamily="monospace">{readingsData.total} W</Typography>
                                            </Paper>
                                        </Grid>
                                    </Grid>
                                </Fade>
                            )}
                        </Box>

                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
