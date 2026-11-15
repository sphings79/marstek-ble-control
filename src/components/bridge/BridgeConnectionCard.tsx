import { useEffect, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    FormControlLabel, Paper, Stack, Switch, TextField, Typography,
} from '@mui/material';
import TimerIcon from '@mui/icons-material/Timer';

import {
    fetchSettings, saveHoldSeconds, saveKeepConnected, isValidHoldSeconds, type BridgeSettings, HOLD_SECONDS_MIN, HOLD_SECONDS_MAX,
} from '../../lib/bridge/BridgeSettings';
import { useBLE } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';

/** How long the bridge holds on to the storages once nobody is using it. */
export const BridgeConnectionCard = () => {
    const t = useT();
    const { slots } = useBLE();
    const [keep, setKeep] = useState<boolean[]>([]);
    const [confirmSlot, setConfirmSlot] = useState<number | null>(null);
    const [value, setValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    useEffect(() => {
        fetchSettings()
            .then(settings => { setValue(String(settings.holdSeconds)); setKeep(settings.keepConnected); })
            .catch((err: Error) => setMessage({ ok: false, text: err.message }))
            .finally(() => setLoading(false));
    }, []);

    const parsed = Number(value);
    const invalid = value !== '' && !isValidHoldSeconds(parsed);

    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            apply(await saveHoldSeconds(parsed));
            setMessage({ ok: true, text: t('bridgeHold.saved') });
        } catch (err) {
            setMessage({ ok: false, text: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    // The bridge's answer is the truth; nothing is shown before it arrives.
    const apply = (settings: BridgeSettings) => {
        setValue(String(settings.holdSeconds));
        setKeep(settings.keepConnected);
    };

    const setKeepConnected = async (slot: number, enabled: boolean) => {
        setConfirmSlot(null);
        setBusy(true);
        setMessage(null);
        try {
            apply(await saveKeepConnected(slot, enabled));
        } catch (err) {
            setMessage({ ok: false, text: (err as Error).message });
        } finally {
            setBusy(false);
        }
    };

    const boundSlots = slots.filter(slot => !!slot.address);

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

                            {boundSlots.length > 0 && (
                                <>
                                    <Typography variant="subtitle2">{t('bridgeKeep.title')}</Typography>
                                    <Alert severity="warning">{t('bridgeKeep.warning')}</Alert>
                                    {boundSlots.map(slot => (
                                        <FormControlLabel
                                            key={slot.index}
                                            sx={{ m: 0, justifyContent: 'space-between' }}
                                            labelPlacement="start"
                                            disabled={busy}
                                            control={
                                                <Switch
                                                    checked={keep[slot.index] === true}
                                                    onChange={(_, checked) => (checked ? setConfirmSlot(slot.index) : void setKeepConnected(slot.index, false))}
                                                />
                                            }
                                            label={
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        {t('bridgeSlot.title', { n: slot.index + 1 })}{slot.name ? ` - ${slot.name}` : ''}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">{t('bridgeKeep.switch')}</Typography>
                                                </Box>
                                            }
                                        />
                                    ))}
                                    <Typography variant="caption" color="text.secondary">{t('bridgeKeep.note')}</Typography>
                                </>
                            )}
                        </>
                    )}
                </Stack>
            </Box>

            <Dialog open={confirmSlot !== null} onClose={() => setConfirmSlot(null)}>
                <DialogTitle>{t('bridgeKeep.confirmTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('bridgeKeep.warning')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmSlot(null)}>{t('bridgeApi.cancel')}</Button>
                    <Button color="warning" onClick={() => confirmSlot !== null && void setKeepConnected(confirmSlot, true)}>
                        {t('bridgeKeep.switchOn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
