import { useEffect, useState } from 'react';
import {
    Paper, Typography, Box, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { SelfControlPowerOffsetPayload } from '../../lib/payloads/SelfControlPowerOffsetPayload';

/**
 * Self-consumption power offset (BLE command 0x55). Signed watt bias for the
 * self-consumption controller (target grid power instead of 0 W).
 *
 * The current value is read from the STATE payload (it sits in the RuntimeInfo just before the LED
 * flag), so the field reflects what the device holds instead of starting at 0 every reload. The
 * local value is only re-synced from the device while the user is not editing (tracked by `dirty`);
 * editing sets it, a successful apply clears it so the next poll syncs again.
 */
export const SelfControlPowerOffsetWidget = () => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);
    const serverOffset = stateData?.attributes.SelfControlPowerOffset;

    const isSyncing = !stateData && isConnected;

    const [offset, setOffset] = useState(0);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);

    // Adopt the device's reported value whenever it changes and the user isn't mid-edit/apply.
    useEffect(() => {
        if (serverOffset !== undefined && !dirty && !busy) {
            setOffset(serverOffset);
        }
    }, [serverOffset, dirty, busy]);

    const apply = async () => {
        if (!isConnected || busy) return;
        setBusy(true);
        try {
            const payload = new SelfControlPowerOffsetPayload(offset);
            await sendPacket(COMMAND_ID.SELF_CONTROL_POWER_OFFSET, payload.toBytes());
            setDirty(false);
            pollState();
        } catch (err) {
            console.error('Failed to set self-consumption offset', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TuneIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    {t('offset.title')}
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
                        <TextField
                            label={t('offset.target')}
                            type="number"
                            value={offset}
                            onChange={(e) => { setOffset(Number(e.target.value)); setDirty(true); }}
                            slotProps={{ htmlInput: { min: -2500, max: 2500, step: 10 } }}
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
                            {t('offset.note')}
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
