import { useEffect, useState, useRef } from 'react';
import {
    Paper, Typography, Box, Slider, CircularProgress, Stack, Fade
} from '@mui/material';
import BatterySaverIcon from '@mui/icons-material/BatterySaver';
import BlockIcon from '@mui/icons-material/Block';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { useT } from '../../i18n/I18nContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { DepthOfDischargeControlPayload } from '../../lib/payloads/DepthOfDischargeControlPayload';
import {COMMAND_ID} from "../../lib/VenusConst.ts";

interface Props {
    min?: number;
    max?: number;
}

export const DepthOfDischargeWidget = ({ min = 30, max = 88 }: Props) => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);
    const serverValue = stateData?.attributes.DepthOfDischarge;

    const isSyncing = !stateData && isConnected;
    const isSupported = serverValue !== undefined;

    const [sliderValue, setSliderValue] = useState<number>(min);
    const [isDragging, setIsDragging] = useState(false);

    const [isBusy, setIsBusy] = useState(false);
    const [targetValue, setTargetValue] = useState<number | null>(null);
    const busyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (serverValue !== undefined && !isDragging && !isBusy) {
            setSliderValue(serverValue);
        }
    }, [serverValue, isDragging, isBusy]);

    useEffect(() => {
        if (isBusy && targetValue !== null && serverValue !== undefined) {
            if (serverValue === targetValue) {
                if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
                setIsBusy(false);
                setTargetValue(null);
            }
        }
    }, [serverValue, isBusy, targetValue]);

    const handleSliderChange = (_: Event, newValue: number | number[]) => {
        setSliderValue(newValue as number);
        setIsDragging(true);
    };

    const handleSliderCommit = async (_: Event | React.SyntheticEvent, newValue: number | number[]) => {
        setIsDragging(false);
        if (!isConnected) return;

        const val = newValue as number;

        setIsBusy(true);
        setTargetValue(val);

        if (busyTimeoutRef.current) {
            clearTimeout(busyTimeoutRef.current);
        }

        // Timeout: If device doesn't reflect state in 7.5s, unlock UI
        busyTimeoutRef.current = setTimeout(() => {
            setIsBusy(false);
            setTargetValue(null);

            if (serverValue !== undefined) {
                setSliderValue(serverValue);
            }
        }, 7_500);

        try {
            const payload = new DepthOfDischargeControlPayload(val);
            await sendPacket(COMMAND_ID.DEPTH_OF_DISCHARGE_CONTROL, payload.toBytes());
            
            pollState();
        } catch (err) {
            console.error("Failed to set DoD", err);
            setIsBusy(false);
            setTargetValue(null);
        }
    };

    const reservePercentage = 100 - sliderValue;

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'info.main', color: 'info.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <BatterySaverIcon />
                <Typography variant="h6" fontWeight="bold">{t('dod.title')}</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {isSyncing ? (
                    <Box textAlign="center">
                        <CircularProgress size={24} />
                        <Typography variant="caption" display="block" mt={1}>{t('common.syncing')}</Typography>
                    </Box>
                ) : !isSupported && isConnected ? (
                    <Box textAlign="center" color="text.secondary" px={2}>
                        <BlockIcon sx={{ fontSize: 40, opacity: 0.5, mb: 1 }} />
                        <Typography variant="body2" fontWeight="500">
                            {t('dod.notAvailable')}
                        </Typography>
                        <Typography variant="caption" display="block">
                            {t('dod.notSupported')}
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={2} alignItems="center">
                        <Box textAlign="center" position="relative">
                            <Typography
                                variant="h3"
                                fontWeight="bold"
                                color="info.main"
                                sx={{ opacity: isBusy || !isConnected ? 0.3 : 1, transition: 'opacity 0.2s' }}
                            >
                                {sliderValue}%
                            </Typography>

                            {isBusy && (
                                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                                    <CircularProgress size={30} color="info" />
                                </Box>
                            )}

                            <Typography variant="body1" fontWeight="500">
                                {t('dod.maxDod')}
                            </Typography>

                            <Fade in={!isDragging}>
                                <Typography variant="caption" color="text.secondary">
                                    {t('dod.reserved', { percent: reservePercentage })}
                                </Typography>
                            </Fade>
                        </Box>

                        <Box width="100%" px={2} pt={1}>
                            <Slider
                                value={sliderValue}
                                min={min}
                                max={max}
                                step={1}
                                onChange={handleSliderChange}
                                onChangeCommitted={handleSliderCommit}
                                disabled={!isConnected || isBusy}
                                valueLabelDisplay="auto"
                                marks={[
                                    { value: min, label: `${min}%` },
                                    { value: max, label: `${max}%` },
                                ]}
                                sx={{
                                    color: 'info.main',
                                    height: 8,
                                    '& .MuiSlider-track': { border: 'none' },
                                    '& .MuiSlider-thumb': {
                                        height: 24,
                                        width: 24,
                                        backgroundColor: '#fff',
                                        border: '2px solid currentColor',
                                        '&:focus, &:hover, &.Mui-active, &.Mui-focusVisible': {
                                            boxShadow: 'inherit',
                                        },
                                        '&::before': { display: 'none' },
                                    },
                                    '&.Mui-disabled': {
                                        color: 'action.disabled'
                                    }
                                }}
                            />
                        </Box>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
