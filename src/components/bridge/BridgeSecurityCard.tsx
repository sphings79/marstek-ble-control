import { useState } from 'react';
import {
    Alert, Box, Button, Paper, Stack, TextField, Typography
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

import { changeBridgePassword } from '../../lib/bridge/BridgeAuth';

/**
 * Change the bridge's password.
 *
 * Worth its own card rather than a line in a settings menu: until this existed, a password could
 * be set exactly once, and changing it meant erasing the flash with a cable. That is a poor thing
 * to discover on the day you need it.
 */
export const BridgeSecurityCard = () => {
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
            setMessage({
                ok: true,
                text: 'Changed. Every session has ended, this one included - reload and log in again.',
            });
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
                <Typography variant="h6" fontWeight="bold">Bridge Password</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1 }}>
                <Stack spacing={2}>
                    {message && <Alert severity={message.ok ? 'success' : 'error'}>{message.text}</Alert>}

                    <TextField
                        label="Current password"
                        type="password"
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="current-password"
                    />

                    <TextField
                        label="New password"
                        type="password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="new-password"
                        error={tooShort}
                        helperText={tooShort ? 'At least eight characters.' : ' '}
                    />

                    <TextField
                        label="Repeat new password"
                        type="password"
                        value={repeat}
                        onChange={(e) => setRepeat(e.target.value)}
                        disabled={busy}
                        size="small"
                        fullWidth
                        autoComplete="new-password"
                        error={mismatch}
                        helperText={mismatch ? 'These do not match.' : ' '}
                    />

                    <Button
                        variant="contained"
                        onClick={() => void submit()}
                        disabled={busy || !ready}
                        fullWidth
                    >
                        Change password
                    </Button>

                    <Typography variant="caption" color="text.secondary">
                        The current password is proved to the bridge before the new one is accepted,
                        so someone who picked your session cookie off the network cannot use it to
                        shut you out. Neither password is sent.
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
