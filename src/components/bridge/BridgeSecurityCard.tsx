import { useState } from 'react';
import {
    Alert, Box, Button, Paper, Stack, TextField, Typography
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

import { changeBridgePassword } from '../../lib/bridge/BridgeAuth';
import { useT } from '../../i18n/i18n';

/**
 * Change the bridge's password.
 *
 * Worth its own card rather than a line in a settings menu: until this existed, a password could
 * be set exactly once, and changing it meant erasing the flash with a cable. That is a poor thing
 * to discover on the day you need it.
 */
export const BridgeSecurityCard = () => {
    const t = useT();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [repeat, setRepeat] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    // Eight is what the bridge's own access point needs to be WPA2 rather than open, so it is the
    // number already in play - no reason to invent a second one.
    const tooShort = next.length > 0 && next.length < 8;
    const mismatch = repeat.length > 0 && next !== repeat;
    const ready = current.length > 0 && next.length >= 8 && next === repeat;

    const submit = async () => {
        setBusy(true);
        setMessage(null);

        try {
            await changeBridgePassword(current, next);
            setCurrent('');
            setNext('');
            setRepeat('');
            setMessage({ ok: true, text: t('bridgePw.done') });
        } catch (err) {
            setMessage({ ok: false, text: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon />
                <Typography variant="h6" fontWeight="bold">{t('bridgePw.title')}</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1 }}>
                <Stack spacing={2}>
                    {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}

                    <TextField
                        label={t('bridgePw.current')}
                        type="password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="current-password"
                    />

                    <TextField
                        label={t('bridgePw.new')}
                        type="password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="new-password"
                        error={tooShort}
                        helperText={tooShort ? t('bridgePw.tooShort') : ' '}
                    />

                    <TextField
                        label={t('bridgePw.repeat')}
                        type="password"
                        value={repeat}
                        onChange={(e) => setRepeat(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="new-password"
                        error={mismatch}
                        helperText={mismatch ? t('bridgePw.mismatch') : ' '}
                    />

                    <Button
                        variant="contained"
                        onClick={() => void submit()}
                        disabled={busy || !ready}
                        fullWidth
                    >
                        {t('bridgePw.submit')}
                    </Button>

                    <Typography variant="caption" color="text.secondary">
                        {t('bridgePw.note')}
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
