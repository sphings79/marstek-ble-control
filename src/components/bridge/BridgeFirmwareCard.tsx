import { useEffect, useRef, useState } from 'react';
import {
    Alert, Box, Button, LinearProgress, Paper, Stack, Typography
} from '@mui/material';
import RouterIcon from '@mui/icons-material/Router';

import {
    fetchBridgeVersion, uploadBridgeFirmware, waitForBridge,
    type BridgeVersion, type UpdateTarget,
} from '../../lib/bridge/BridgeUpdate';

type Phase = 'idle' | 'uploading' | 'restarting' | 'done' | 'failed';

/**
 * Firmware for the ESP32 bridge itself.
 *
 * Built like the other dashboard widgets so it sits in the grid rather than beside it, but with a
 * slate header instead of the OTA card's red one. That difference is the point: confusing the two
 * means sending an ESP32 image to a battery or the reverse, and only one of those is recoverable
 * with a USB cable.
 */
export const BridgeFirmwareCard = () => {
    // One input per target rather than one shared input plus a state variable saying what it is
    // for. The pairing is then structural instead of something that has to stay in step.
    const firmwareInput = useRef<HTMLInputElement>(null);
    const webInput = useRef<HTMLInputElement>(null);

    const [version, setVersion] = useState<BridgeVersion | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [percent, setPercent] = useState(0);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        void fetchBridgeVersion().then(setVersion);
    }, []);

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>, target: UpdateTarget) => {
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
                setMessage('Restarted and back.');
            } else {
                setPhase('failed');
                setMessage('The image was accepted, but the bridge has not answered again yet. It may just be slow to rejoin WiFi.');
            }
        } catch (err) {
            setPhase('failed');
            setMessage((err as Error).message);
        }
    };

    const busy = phase === 'uploading' || phase === 'restarting';

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <RouterIcon />
                <Typography variant="h6" fontWeight="bold">Bridge Firmware</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                    Updates the <strong>ESP32 bridge</strong>, not the storage. Firmware for the
                    battery goes through the red OTA card.
                </Alert>

                <Stack spacing={2}>
                    {version && (
                        <Typography variant="caption" color="text.secondary" display="block">
                            {version.version} · slot {version.slot} · {version.built}
                        </Typography>
                    )}

                    {message && (
                        <Alert severity={phase === 'done' ? 'success' : 'error'}>{message}</Alert>
                    )}

                    <input
                        ref={firmwareInput}
                        type="file"
                        accept=".bin"
                        style={{ display: 'none' }}
                        onChange={(e) => void handleFile(e, 'firmware')}
                    />
                    <input
                        ref={webInput}
                        type="file"
                        accept=".bin"
                        style={{ display: 'none' }}
                        onChange={(e) => void handleFile(e, 'web')}
                    />

                    <Button variant="outlined" onClick={() => firmwareInput.current?.click()} disabled={busy} fullWidth>
                        Firmware
                    </Button>

                    <Button variant="outlined" onClick={() => webInput.current?.click()} disabled={busy} fullWidth>
                        Web Interface
                    </Button>

                    {busy && (
                        <Box>
                            <LinearProgress
                                variant={phase === 'restarting' ? 'indeterminate' : 'determinate'}
                                value={percent}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {phase === 'restarting' ? 'Restarting...' : `Uploading ${percent}%`}
                            </Typography>
                        </Box>
                    )}

                    <Typography variant="caption" color="text.secondary">
                        Firmware is written to the spare slot and only booted once it is complete,
                        so a failed upload changes nothing. The interface has no spare copy - if
                        that upload breaks off, the bridge serves no page until you retry.
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
