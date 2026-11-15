import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';

import {
    fetchHoldSeconds, saveHoldSeconds, isValidHoldSeconds, HOLD_SECONDS_MIN, HOLD_SECONDS_MAX,
} from '../../lib/bridge/BridgeSettings';
import { useT } from '../../i18n/i18n';

/** How long the bridge holds on to the storages once nobody is using it. */
export const BridgeConnectionCard = () => {
    const t = useT();
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        fetchHoldSeconds()
            .then(seconds => setValue(String(seconds)))
            .catch((err: Error) => setMessage({ ok: false, text: err.message }))
            .finally(() => setLoading(false));
    }, []);

    const parsed = Number(value);
    const invalid = value !== '' && !isValidHoldSeconds(parsed);

    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            setValue(String(await saveHoldSeconds(parsed)));
            setMessage({ ok: true, text: t('bridgeHold.saved') });
        } catch (err) {
            setMessage({ ok: false, text: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimerIcon />
                <Typography variant="h6" fontWeight="bold">{t('bridgeHold.title')}</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1 }}>
                <Stack spacing={2}>
                    {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}

                    <Typography variant="body2" color="text.secondary">{t('bridgeHold.desc')}</Typography>

                    {loading ? (
                        <Stack alignItems="center"><CircularProgress size={24} /></Stack>
                    ) : (
                        <>
                            <TextField
                                label={t('bridgeHold.label')}
                                type="number"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                disabled={busy}
                                size="small"
                                fullWidth
                                error={invalid}
                                helperText={invalid ? t('bridgeHold.range', { min: HOLD_SECONDS_MIN, max: HOLD_SECONDS_MAX }) : ' '}
                                slotProps={{ htmlInput: { min: HOLD_SECONDS_MIN, max: HOLD_SECONDS_MAX, step: 1 } }}
                            />
                            <Button variant="contained" onClick={() => void save()} disabled={busy || value === '' || invalid} fullWidth>
                                {t('bridgeHold.save')}
                            </Button>
                        </>
                    )}
                </Stack>
            </Box>
        </Paper>
    );
};
