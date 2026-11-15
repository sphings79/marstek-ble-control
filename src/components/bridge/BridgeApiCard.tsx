import { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    IconButton, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { disableToken, fetchTokenEnabled, generateToken } from '../../lib/bridge/BridgeToken';
import { useT } from '../../i18n/i18n';

const TOKEN_PLACEHOLDER = '<token>';

const copy = (text: string) => {
    try {
        void navigator.clipboard?.writeText(text);
    } catch {
        // Clipboard not available (plain http in some browsers); the text is selectable anyway.
    }
};

const Snippet = ({ text, label }: { text: string; label: string }) => (
    <Box sx={{ position: 'relative' }}>
        <Box
            component="pre"
            sx={{
                m: 0, p: 1.5, pr: 5, bgcolor: 'grey.100', borderRadius: 1, fontSize: 12,
                fontFamily: 'monospace', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}
        >
            {text}
        </Box>
        <Tooltip title={label}>
            <IconButton size="small" aria-label={label} onClick={() => copy(text)} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <ContentCopyIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    </Box>
);

/**
 * Manage the bridge's API token, used by Home Assistant to call the bridge's HTTP API.
 * The token is shown once after it is generated; the bridge only stores a hash.
 */
export const BridgeApiCard = () => {
    const t = useT();
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void fetchTokenEnabled().then(setEnabled).catch((err: Error) => setError(err.message));
    }, []);

    const generate = async () => {
        setConfirming(false);
        setBusy(true);
        setError(null);
        try {
            setToken(await generateToken());
            setEnabled(true);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const disable = async () => {
        setBusy(true);
        setError(null);
        try {
            await disableToken();
            setToken(null);
            setEnabled(false);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const host = window.location.host;
    const statusExample = [
        'sensor:',
        '  - platform: rest',
        '    name: Marstek Bridge',
        `    resource: "http://${host}/api/status"`,
        '    headers:',
        `      Authorization: "Bearer ${token ?? TOKEN_PLACEHOLDER}"`,
        '    scan_interval: 60',
        '    value_template: "{{ value_json.version }}"',
        '    json_attributes:',
        '      - slots',
        '      - heap',
        '      - uptimeSeconds',
        '      - wifiRssi',
        '      - holdSeconds',
        '      - lastCommand',
    ].join('\n');
    const example = [
        'rest_command:',
        '  bridge_peak_shaving:',
        `    url: "http://${host}/api/peak-shaving"`,
        '    method: POST',
        '    headers:',
        `      Authorization: "Bearer ${token ?? TOKEN_PLACEHOLDER}"`,
        '      Content-Type: "application/json"',
        '    payload: \'{"slot":0,"enabled":true,"power":600}\'',
    ].join('\n');

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyIcon />
                <Typography variant="h6" fontWeight="bold" sx={{ flexGrow: 1 }}>{t('bridgeApi.title')}</Typography>
                {enabled !== null && (
                    <Chip
                        size="small"
                        color={enabled ? 'success' : 'default'}
                        label={t(enabled ? 'bridgeApi.enabled' : 'bridgeApi.disabled')}
                    />
                )}
            </Box>

            <Box sx={{ p: 3, flexGrow: 1 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <Typography variant="body2" color="text.secondary">{t('bridgeApi.desc')}</Typography>

                    {token && (
                        <>
                            <Alert severity="warning">{t('bridgeApi.once')}</Alert>
                            <Snippet text={token} label={t('bridgeApi.copyToken')} />
                        </>
                    )}

                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            onClick={() => (enabled ? setConfirming(true) : void generate())}
                            disabled={busy || enabled === null}
                            fullWidth
                        >
                            {t(enabled ? 'bridgeApi.regenerate' : 'bridgeApi.generate')}
                        </Button>
                        {enabled && (
                            <Button variant="outlined" color="error" onClick={() => void disable()} disabled={busy} fullWidth>
                                {t('bridgeApi.disable')}
                            </Button>
                        )}
                    </Stack>

                    <Typography variant="subtitle2">{t('bridgeApi.exampleTitle')}</Typography>
                    <Snippet text={example} label={t('bridgeApi.copyExample')} />
                    <Typography variant="subtitle2">{t('bridgeApi.statusTitle')}</Typography>
                    <Snippet text={statusExample} label={t('bridgeApi.copyExample')} />
                    <Typography variant="caption" color="text.secondary">{t('bridgeApi.httpNote')}</Typography>
                </Stack>
            </Box>

            <Dialog open={confirming} onClose={() => setConfirming(false)}>
                <DialogTitle>{t('bridgeApi.confirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('bridgeApi.confirmBody')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirming(false)}>{t('bridgeApi.cancel')}</Button>
                    <Button color="error" onClick={() => void generate()}>{t('bridgeApi.regenerate')}</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
