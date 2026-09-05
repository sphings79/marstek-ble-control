import React, { useEffect, useState, useRef } from 'react';
import {
    Paper, Typography, Box, CircularProgress,
    ToggleButton, ToggleButtonGroup, Fade, Alert, Divider
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull';
import BatterySaverIcon from '@mui/icons-material/BatterySaver';
import SpeedIcon from '@mui/icons-material/Speed';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from "../../lib/VenusConst.ts";
import { useT } from '../../i18n/i18n';
import { DischargePowerLimitControlPayload } from '../../lib/payloads/DischargePowerLimitControlPayload';
import { ChargePowerLimitControlPayload } from '../../lib/payloads/ChargePowerLimitControlPayload';
import { DevicePowerClassControlPayload, DEVICE_POWER_CLASS_OPTIONS } from '../../lib/payloads/DevicePowerClassControlPayload';

interface PowerLimitControlProps {
    title: string;
    icon: React.ReactNode;
    serverValue?: number;
    isConnected: boolean;
    options: number[];
    onSendCommand: (value: number) => Promise<void>;
}

const PowerLimitControl = ({ title, icon, serverValue, isConnected, options, onSendCommand }: PowerLimitControlProps) => {
    const t = useT();
    const [pendingValue, setPendingValue] = useState<number | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const isPending = pendingValue !== null && pendingValue !== serverValue;
    const displayValue = isPending ? pendingValue : (serverValue ?? null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const handleChange = async (_: React.MouseEvent<HTMLElement>, newVal: number | null) => {
        if (newVal === null || !isConnected || isPending) return;

        setPendingValue(newVal);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            setPendingValue(null);
        }, 7500);

        try {
            await onSendCommand(newVal);
        } catch (err) {
            console.error(`Failed to set ${title} limit`, err);
            setPendingValue(null);
        }
    };

    const isCustomValue = displayValue !== null && !options.includes(displayValue);

    return (
        <Box width="100%" textAlign="center" sx={{ py: 2 }}>
            <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={2}>
                {icon}
                <Typography variant="subtitle1" fontWeight="bold">{title}</Typography>
            </Box>

            {serverValue === undefined ? (
                <Box textAlign="center" height="60px" display="flex" flexDirection="column" justifyContent="center" alignItems="center">
                    <CircularProgress size={24} />
                    <Typography variant="caption" display="block" mt={1}>{t('common.syncing')}</Typography>
                </Box>
            ) : (
                <>
                    <ToggleButtonGroup
                        value={displayValue}
                        exclusive
                        onChange={handleChange}
                        disabled={!isConnected || isPending}
                        fullWidth
                        color="primary"
                        sx={{ mb: 1 }}
                    >
                        {options.map(opt => (
                            <ToggleButton key={opt} value={opt} sx={{ py: 1.5, fontWeight: 'bold' }}>
                                {opt} W
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>

                    <Box height={24} display="flex" justifyContent="center" alignItems="center">
                        {isPending && (
                            <Fade in={true}>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <CircularProgress size={16} color="inherit" />
                                    <Typography variant="caption">{t('common.updating')}</Typography>
                                </Box>
                            </Fade>
                        )}
                    </Box>

                    {isCustomValue && !isPending && (
                        <Alert severity="info" icon={false} sx={{ mt: 1, py: 0, justifyContent: 'center' }}>
                            {t('powerLimits.customValue', { value: displayValue })}
                        </Alert>
                    )}
                </>
            )}
        </Box>
    );
};

interface DevicePowerClassControlProps {
    isConnected: boolean;
    onSendCommand: (value: number) => Promise<void>;
}

// The device power class (BLE cmd 0x15) is not reported back in the STATE response, so this
// control keeps a local selection instead of syncing a server value.
const DevicePowerClassControl = ({ isConnected, onSendCommand }: DevicePowerClassControlProps) => {
    const t = useT();
    const [selected, setSelected] = useState<number | null>(null);
    const [isPending, setIsPending] = useState(false);

    const handleChange = async (_: React.MouseEvent<HTMLElement>, newVal: number | null) => {
        if (newVal === null || !isConnected || isPending) return;
        setSelected(newVal);
        setIsPending(true);
        try {
            await onSendCommand(newVal);
        } catch (err) {
            console.error('Failed to set device power class', err);
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Box width="100%" textAlign="center" sx={{ py: 2 }}>
            <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={2}>
                <SpeedIcon color="action" />
                <Typography variant="subtitle1" fontWeight="bold">{t('powerLimits.deviceClass')}</Typography>
            </Box>

            <ToggleButtonGroup
                value={selected}
                exclusive
                onChange={handleChange}
                disabled={!isConnected || isPending}
                fullWidth
                color="primary"
                sx={{ mb: 1 }}
            >
                {DEVICE_POWER_CLASS_OPTIONS.map(opt => (
                    <ToggleButton key={opt} value={opt} sx={{ py: 1.5, fontWeight: 'bold' }}>
                        {opt} W
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                {t('powerLimits.deviceClassNote')}
            </Typography>
        </Box>
    );
};

interface Props {
    dischargeOptions?: number[];
    chargeOptions?: number[];
}

export const PowerLimitsWidget = ({
  dischargeOptions = [800, 1200],
  chargeOptions = [600, 1200]
}: Props) => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);

    const serverDischarge = stateData?.attributes.DischargePowerLimit;
    const serverCharge = stateData?.attributes.ChargePowerLimit;

    const setDischargeLimit = async (value: number) => {
        const payload = new DischargePowerLimitControlPayload(value);
        await sendPacket(COMMAND_ID.DISCHARGE_POWER_LIMIT_CONTROL, payload.toBytes());
        pollState();
    };

    const setChargeLimit = async (value: number) => {
        const payload = new ChargePowerLimitControlPayload(value);
        await sendPacket(COMMAND_ID.CHARGE_POWER_LIMIT_CONTROL, payload.toBytes());
        pollState();
    };

    const setDevicePowerClass = async (value: number) => {
        const payload = new DevicePowerClassControlPayload(value);
        await sendPacket(COMMAND_ID.DEVICE_POWER_CLASS_CONTROL, payload.toBytes());
        pollState();
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <BoltIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    {t('powerLimits.title')}
                </Typography>
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" flexGrow={1} alignItems="center" justifyContent="center">
                        <Typography variant="body2" color="text.secondary">{t('state.waitingConnection')}</Typography>
                    </Box>
                ) : (
                    <>
                        <PowerLimitControl
                            title={t('powerLimits.discharge')}
                            icon={<BatterySaverIcon color="action" />}
                            serverValue={serverDischarge}
                            isConnected={isConnected}
                            options={dischargeOptions}
                            onSendCommand={setDischargeLimit}
                        />

                        <Divider sx={{ my: 1 }} />

                        <PowerLimitControl
                            title={t('powerLimits.charge')}
                            icon={<BatteryChargingFullIcon color="action" />}
                            serverValue={serverCharge}
                            isConnected={isConnected}
                            options={chargeOptions}
                            onSendCommand={setChargeLimit}
                        />

                        <Divider sx={{ my: 1 }} />

                        <DevicePowerClassControl
                            isConnected={isConnected}
                            onSendCommand={setDevicePowerClass}
                        />

                        <Box mt="auto" pt={2} textAlign="center">
                            <Typography variant="caption" color="text.secondary">
                                {t('powerLimits.regulations1')}<br/>
                                {t('powerLimits.regulations2')}
                            </Typography>
                        </Box>
                    </>
                )}
            </Box>
        </Paper>
    );
};
