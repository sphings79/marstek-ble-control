import { useEffect, useRef, useState } from 'react';
import {
    Alert, Box, Button, LinearProgress, Paper, Stack, Typography
} from '@mui/material';
import RouterIcon from '@mui/icons-material/Router';

import {
    fetchBridgeVersion, uploadBridgeFirmware, waitForBridge,
    type BridgeVersion, type UpdateTarget,
} from '../../lib/bridge/BridgeUpdate';
import {
    fetchLatestRelease, installFromUrl, isOutdated, type BridgeRelease,
} from '../../lib/bridge/BridgeReleases';

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
    const [release, setRelease] = useState<BridgeRelease | null>(null);

    useEffect(() => {
        void fetchBridgeVersion().then(setVersion);
        void fetchLatestRelease().then(setRelease);
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

    // Two separate questions. Whether to shout about a new version follows the running firmware;
    // whether the release can be installed does not. The web interface has no version of its own
    // to compare, so gating its button on the firmware's meant that updating the firmware first
    // took away the only way to fetch the interface that goes with it.
    const outdated = release != null && isOutdated(version?.version, release.tag);
    const canInstall = release != null;

    const installRelease = async (target: UpdateTarget) => {
        const url = target === 'web' ? release?.webUrl : release?.firmwareUrl;
        if (!url) return;

        setPhase('uploading');
        setPercent(0);
        setMessage(null);

        try {
            // The bridge downloads it itself, so there is no progress to report from here - only
            // the wait, and then whether it came back.
            await installFromUrl(url, target);

            setPhase('restarting');
            const back = await waitForBridge();
            setPhase(back ? 'done' : 'failed');
            setVersion(back ? await fetchBridgeVersion() : version);
            setMessage(back
                ? 'Restarted and back.'
                : 'The bridge accepted it but has not answered again yet.');
        } catch (err) {
            setPhase('failed');
            setMessage((err as Error).message);
        }
    };

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

                    {outdated && (
                        <Alert
                            severity="info"
                            action={release.url
                                ? <Button size="small" href={release.url} target="_blank" rel="noopener noreferrer">
                                      Changelog
                                  </Button>
                                : undefined}
                        >
                            <strong>{release.name}</strong> is available.
                        </Alert>
                    )}

                    {canInstall && release.firmwareUrl && (
                        <Button
                            variant={outdated ? 'contained' : 'outlined'}
                            onClick={() => void installRelease('firmware')}
                            disabled={busy}
                            fullWidth
                        >
                            {outdated ? `Install ${release.tag} firmware` : `Reinstall ${release.tag} firmware`}
                        </Button>
                    )}

                    {canInstall && release.webUrl && (
                        <Button
                            variant={outdated ? 'contained' : 'outlined'}
                            onClick={() => void installRelease('web')}
                            disabled={busy}
                            fullWidth
                        >
                            Install {release.tag} interface
                        </Button>
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
                        Releases are downloaded by the bridge itself; the files below are for
                        installing a build by hand. Firmware is written to the spare slot and only booted once it is complete,
                        so a failed upload changes nothing. The interface has no spare copy - if
                        that upload breaks off, the bridge serves no page until you retry.
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
