import { useEffect, useRef, useState } from 'react';
import {
    Paper, Typography, Box, Switch, FormControlLabel, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import LanIcon from '@mui/icons-material/Lan';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { LocalApiControlPayload } from '../../lib/payloads/LocalApiControlPayload';

/**
 * Local API control (BLE command 0x28).
 *
 * Enables/disables the device's local UDP JSON-RPC API and sets its port.
 * This is the local API - NOT Modbus TCP (Modbus cannot be toggled).
 *
 * The current enable flag and port are read from the STATE payload (byte[101] / byte[105]), so the
 * controls reflect what the device actually reports instead of a hard-coded default. The local
 * enabled/port state is only re-synced from the device while the user is not editing (tracked by
 * `dirty`); editing sets it, a successful apply clears it so the next poll syncs again.
 */
export const LocalApiWidget = () => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);
    const serverEnabled = stateData?.attributes.LocalApiEnabled;
    const serverPort = stateData?.attributes.ApiPort;

    const isSyncing = !stateData && isConnected;

    const [enabled, setEnabled] = useState(false);
    const [port, setPort] = useState(30000);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);

    const busyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Adopt the device's reported values unless the user is editing or an apply is in flight.
    useEffect(() => {
        if (serverEnabled !== undefined && serverPort !== undefined && !dirty && !busy) {
            setEnabled(serverEnabled);
            setPort(serverPort);
        }
    }, [serverEnabled, serverPort, dirty, busy]);

    useEffect(() => () => { if (busyTimeout.current) clearTimeout(busyTimeout.current); }, []);

    const apply = async () => {
        if (!isConnected || busy) return;
        setBusy(true);
        try {
            const payload = new LocalApiControlPayload(enabled, port);
            await sendPacket(COMMAND_ID.LOCAL_API_CONTROL, payload.toBytes());
            pollState();
        } catch (err) {
            console.error('Failed to set local API', err);
            setBusy(false);
            return;
        }
        // Hold the applied values until the next poll lands, so the controls don't flash the stale
        // device state for the moment before it returns; the sync then adopts what the device reports.
        if (busyTimeout.current) clearTimeout(busyTimeout.current);
        busyTimeout.current = setTimeout(() => { setDirty(false); setBusy(false); }, 2_000);
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <LanIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    {t('localApi.title')}
                </Typography>
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" flexGrow={1} alignItems="center" justifyContent="center">
                        <Typography variant="body2" color="text.secondary">{t('state.waitingConnection')}</Typography>
                    </Box>
                ) : isSyncing ? (
                    <Box display="flex" flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
                        <CircularProgress size={24} sx={{ mb: 1 }} />
                        <Typography variant="caption" color="text.secondary">{t('common.syncing')}</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        <FormControlLabel
                            control={<Switch checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} />}
                            label={t(enabled ? 'common.enabled' : 'common.disabled')}
                        />
                        <TextField
                            label={t('localApi.port')}
                            type="number"
                            value={port}
                            onChange={(e) => { setPort(Number(e.target.value)); setDirty(true); }}
                            slotProps={{ htmlInput: { min: 1, max: 65535, step: 1 } }}
                            fullWidth
                            size="small"
                        />
                        <Button
                            variant="contained"
                            onClick={apply}
                            disabled={busy || !dirty}
                            fullWidth
                            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                        >
                            {t(busy ? 'common.applying' : 'common.apply')}
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                            {t('localApi.note')}
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
