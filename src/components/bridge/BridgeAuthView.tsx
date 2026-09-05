import { useState } from 'react';
import { Alert, Button, Stack, TextField } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';

import { BridgeCard } from './BridgeCard';
import { claimBridge, loginToBridge } from '../../lib/bridge/BridgeAuth';
import { useT } from '../../i18n/i18n';

interface Props {
    /** False while the bridge still has no password - then this screen sets one. */
    claimed: boolean;
    onAuthenticated: () => void;
}

export const BridgeAuthView = ({ claimed, onAuthenticated }: Props) => {
    const t = useT();
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const claiming = !claimed;
    const tooShort = password.length > 0 && password.length < 8;
    const mismatch = claiming && confirmation.length > 0 && password !== confirmation;
    const canSubmit = password.length >= 8 && !busy && (!claiming || password === confirmation);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            if (claiming) {
                await claimBridge(password);
            }
            await loginToBridge(password);
            onAuthenticated();
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <BridgeCard
            icon={claiming
                ? <KeyOutlinedIcon sx={{ fontSize: 60, color: 'primary.main' }} />
                : <LockOutlinedIcon sx={{ fontSize: 60, color: 'primary.main' }} />}
            title={t(claiming ? 'auth.claimTitle' : 'auth.lockedTitle')}
            description={t(claiming ? 'auth.claimDesc' : 'auth.lockedDesc')}
        >
            <Stack spacing={2} component="form" onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit(); }}>
                {claiming && (
                    <Alert severity="info" sx={{ textAlign: 'left' }}>
                        {t('auth.plainHttp')}
                    </Alert>
                )}

                {error && <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>}

                <TextField
                    type="password"
                    label={t('auth.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    error={tooShort}
                    helperText={tooShort ? t('auth.tooShort') : ' '}
                    autoFocus
                    fullWidth
                    autoComplete={claiming ? 'new-password' : 'current-password'}
                />

                {claiming && (
                    <TextField
                        type="password"
                        label={t('auth.repeat')}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        error={mismatch}
                        helperText={mismatch ? t('auth.mismatch') : ' '}
                        fullWidth
                        autoComplete="new-password"
                    />
                )}

                <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={!canSubmit}
                    fullWidth
                    sx={{ py: 1.5, fontWeight: 'bold', textTransform: 'none', fontSize: '1.1rem' }}
                >
                    {busy ? t('auth.wait') : t(claiming ? 'auth.setPassword' : 'auth.unlock')}
                </Button>
            </Stack>
        </BridgeCard>
    );
};
