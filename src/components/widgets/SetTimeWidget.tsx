import { useState } from 'react';
import {
    Paper, Typography, Box, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

import { useBLE } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { SetTimePayload } from '../../lib/payloads/SetTimePayload';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInputValue = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * Set device clock (BLE command 0x0B). Writes the hardware RTC; sends the browser's
 * local wall-clock time (which is what the schedules run on).
 */
export const SetTimeWidget = () => {
    const t = useT();
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const [value, setValue] = useState(() => toLocalInputValue(new Date()));
    const [busy, setBusy] = useState(false);

    const resetToNow = () => setValue(toLocalInputValue(new Date()));

    const apply = async () => {
        if (!isConnected || busy) return;
        const d = new Date(value);
        if (isNaN(d.getTime())) return;
        setBusy(true);
        try {
            const payload = SetTimePayload.fromDate(d);
            await sendPacket(COMMAND_ID.SET_TIME, payload.toBytes());
            pollState();
        } catch (err) {
            console.error('Failed to set device time', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    {t('time.title')}
                </Typography>
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" flexGrow={1} alignItems="center" justifyContent="center">
                        <Typography variant="body2" color="text.secondary">{t('state.waitingConnection')}</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        <TextField
                            label={t('time.field')}
                            type="datetime-local"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            slotProps={{ htmlInput: { step: 1 }, inputLabel: { shrink: true } }}
                            fullWidth
                            size="small"
                        />
                        <Stack direction="row" spacing={1}>
                            <Button variant="outlined" onClick={resetToNow} fullWidth>
                                {t('time.now')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={apply}
                                disabled={busy}
                                fullWidth
                                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                            >
                                {t(busy ? 'time.setting' : 'time.set')}
                            </Button>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {t('time.note')}
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
