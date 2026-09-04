import { useEffect, useRef, useState } from 'react';
import {
    Alert, Box, Button, LinearProgress, Paper, Stack, Typography
} from '@mui/material';
import RouterIcon from '@mui/icons-material/Router';

import { fetchBridgeVersion, uploadBridgeFirmware, waitForBridge, type BridgeVersion, type UpdateTarget } from '../../lib/bridge/BridgeUpdate';

type Phase = 'idle' | 'uploading' | 'restarting' | 'done' | 'failed';

/**
 * Firmware for the ESP32 bridge itself.
 *
 * Deliberately kept apart from the storage's own OTA widget, in wording and in looks. Confusing
 * the two would mean sending an ESP32 image to a battery or the other way round, and only one of
 * those two mistakes is recoverable with a USB cable.
 *
 * Reachable whether or not the storage is connected, because a broken Bluetooth link is exactly
 * when a firmware fix is most likely to be what is needed.
 */
export const BridgeFirmwareCard = () => {
    const fileInput = useRef<HTMLInputElement>(null);
    const [target, setTarget] = useState<UpdateTarget>('firmware');

    const [version, setVersion] = useState<BridgeVersion | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [percent, setPercent] = useState(0);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        void fetchBridgeVersion().then(setVersion);
    }, []);

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setPhase('uploading');
        setPercent(0);
        setMessage(null);

        try {
            await uploadBridgeFirmware(file, target, setPercent);

            setPhase('restarting');
            const back = await waitForBridge();

            if (back) {
                setPhase('done');
                setVersion(await fetchBridgeVersion());
                setMessage('The bridge restarted and is back.');
            } else {
                setPhase('failed');
                setMessage('The image was accepted, but the bridge has not come back. Check it before assuming the worst - it may simply be slow to rejoin WiFi.');
            }
        } catch (err) {
            setPhase('failed');
            setMessage((err as Error).message);
        }
    };

    const busy = phase === 'uploading' || phase === 'restarting';

    return (
        <Paper elevation={3} sx={{ p: 0, overflow: 'hidden' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <RouterIcon />
                <Box>
                    <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>Bridge Firmware</Typography>
                    <Typography variant="caption">The ESP32, not the storage</Typography>
                </Box>
            </Box>

            <Box sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Alert severity="info" sx={{ textAlign: 'left' }}>
                        This updates the <strong>bridge</strong>. Firmware for the storage itself goes
                        through the OTA card on the dashboard instead - the two are not
                        interchangeable.
                    </Alert>

                    {version && (
                        <Typography variant="body2" color="text.secondary">
                            Running <strong>{version.version}</strong> from slot <code>{version.slot}</code>,
                            built {version.built}, ESP-IDF {version.idf}
                        </Typography>
                    )}

                    {message && (
                        <Alert severity={phase === 'done' ? 'success' : 'error'} sx={{ textAlign: 'left' }}>
                            {message}
                        </Alert>
                    )}

                    {busy && (
                        <Box>
                            <LinearProgress
                                variant={phase === 'restarting' ? 'indeterminate' : 'determinate'}
                                value={percent}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {phase === 'restarting' ? 'Restarting, waiting for it to come back...' : `Uploading ${percent}%`}
                            </Typography>
                        </Box>
                    )}

                    <input
                        ref={fileInput}
                        type="file"
                        accept=".bin"
                        style={{ display: 'none' }}
                        onChange={(e) => void handleFile(e)}
                    />

                    <Button
                        variant="outlined"
                        onClick={() => { setTarget('firmware'); fileInput.current?.click(); }}
                        disabled={busy}
                        sx={{ textTransform: 'none' }}
                    >
                        Update firmware (marstek-ble-bridge.bin)
                    </Button>

                    <Button
                        variant="outlined"
                        onClick={() => { setTarget('web'); fileInput.current?.click(); }}
                        disabled={busy}
                        sx={{ textTransform: 'none' }}
                    >
                        Update this interface (web.bin)
                    </Button>

                    <Typography variant="caption" color="text.secondary">
                        Firmware goes into the slot the bridge is not running from and is only
                        booted once it has arrived complete, so a failed upload changes nothing.
                        The interface has no second copy: it is replaced in place, and if that
                        upload breaks off the bridge serves nothing until you try again. Its API
                        keeps answering either way, so a retry is always possible.
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
