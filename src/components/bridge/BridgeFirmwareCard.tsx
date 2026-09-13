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
import { useT } from '../../i18n/i18n';

// 'uploading' is a hand-uploaded file with real byte progress; 'installing' is the bridge fetching
// a release image itself, where there is no progress to report from here - shown indeterminate.
type Phase = 'idle' | 'uploading' | 'installing' | 'restarting' | 'done' | 'failed';

/**
 * Firmware for the ESP32 bridge itself.
 *
 * Built like the other dashboard widgets so it sits in the grid rather than beside it, but with a
 * slate header instead of the OTA card's red one. That difference is the point: confusing the two
 * means sending an ESP32 image to a battery or the reverse, and only one of those is recoverable
 * with a USB cable.
 */
export const BridgeFirmwareCard = () => {
    const t = useT();
    // One input per target rather than one shared input plus a state variable saying what it is
    // for. The pairing is then structural instead of something that has to stay in step.
    const firmwareInput = useRef<HTMLInputElement>(null);
    const webInput = useRef<HTMLInputElement>(null);

    const [version, setVersion] = useState<BridgeVersion | null>(null);
    const [phase, setPhase] = useState<Phase>('idle');
    const [percent, setPercent] = useState(0);
    // True once the bridge has streamed real download progress, so the install bar can switch from
    // indeterminate to a real percentage. Stays false against an older bridge that reports none.
    const [installDeterminate, setInstallDeterminate] = useState(false);
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
                setMessage(t('bridgeFw.back'));
            } else {
                setPhase('failed');
                setMessage(t('bridgeFw.noAnswerUpload'));
            }
        } catch (err) {
            setPhase('failed');
            setMessage((err as Error).message);
        }
    };

    const busy = phase === 'uploading' || phase === 'installing' || phase === 'restarting';

    // Three separate questions. The firmware and the interface are installed separately and are
    // compared separately - gating both on the firmware's version meant updating the firmware
    // first took away the only way to fetch the interface that goes with it, and left the
    // interface button saying the same thing before and after.
    const firmwareOutdated = release != null && isOutdated(version?.version, release.tag);
    const webOutdated = release != null && version?.web !== release.tag;
    const outdated = firmwareOutdated || webOutdated;
    const canInstall = release != null;

    const installRelease = async (target: UpdateTarget) => {
        const url = target === 'web' ? release?.webUrl : release?.firmwareUrl;
        if (!url) return;

        setPhase('installing');
        setPercent(0);
        setInstallDeterminate(false);
        setMessage(null);

        try {
            // The bridge streams "P <percent>" as it downloads and flashes; until the first one the
            // bar stays indeterminate (an older bridge sends none, so it never switches).
            await installFromUrl(url, target, (pct) => {
                setInstallDeterminate(true);
                setPercent(pct);
            });

            setPhase('restarting');
            const back = await waitForBridge();

            if (target === 'web' && back) {
                // The new interface is now on the device but this page is still the old one. Load it.
                setPhase('done');
                setMessage(t('bridgeFw.back'));
                window.location.reload();
                return;
            }

            setPhase(back ? 'done' : 'failed');
            setVersion(back ? await fetchBridgeVersion() : version);
            setMessage(t(back ? 'bridgeFw.back' : 'bridgeFw.noAnswer'));
        } catch (err) {
            setPhase('failed');
            setMessage((err as Error).message);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'grey.800', color: 'common.white', display: 'flex', alignItems: 'center', gap: 1 }}>
                <RouterIcon />
                <Typography variant="h6" fontWeight="bold">{t('bridgeFw.title')}</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                    {t('bridgeFw.notStorage.1')} <strong>{t('bridgeFw.notStorage.strong')}</strong>
                    {t('bridgeFw.notStorage.2')}
                </Alert>

                <Stack spacing={2}>
                    {version && (
                        <Typography variant="caption" color="text.secondary" display="block">
                            {version.version} · slot {version.slot} · {version.built}
                            {version.web && <> · {t('bridgeFw.webInstalled', { version: version.web })}</>}
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
                                      {t('bridgeFw.changelog')}
                                  </Button>
                                : undefined}
                        >
                            <strong>{release.name}</strong> {t('bridgeFw.available')}
                        </Alert>
                    )}

                    {canInstall && release.firmwareUrl && (
                        <Button
                            variant={firmwareOutdated ? 'contained' : 'outlined'}
                            onClick={() => void installRelease('firmware')}
                            disabled={busy}
                            fullWidth
                        >
                            {t(firmwareOutdated ? 'bridgeFw.install' : 'bridgeFw.reinstall', { tag: release.tag })}
                        </Button>
                    )}

                    {canInstall && release.webUrl && (
                        <Button
                            variant={webOutdated ? 'contained' : 'outlined'}
                            onClick={() => void installRelease('web')}
                            disabled={busy}
                            fullWidth
                        >
                            {t(webOutdated ? 'bridgeFw.installWeb' : 'bridgeFw.reinstallWeb', { tag: release.tag })}
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
                        {t('bridgeFw.firmware')}
                    </Button>

                    <Button variant="outlined" onClick={() => webInput.current?.click()} disabled={busy} fullWidth>
                        {t('bridgeFw.webInterface')}
                    </Button>

                    {busy && (
                        <Box>
                            <LinearProgress
                                variant={phase === 'uploading' || (phase === 'installing' && installDeterminate) ? 'determinate' : 'indeterminate'}
                                value={percent}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {phase === 'restarting'
                                    ? t('bridgeFw.restarting')
                                    : phase === 'installing'
                                        ? (installDeterminate ? t('bridgeFw.installingPct', { percent }) : t('bridgeFw.installing'))
                                        : t('bridgeFw.uploading', { percent })}
                            </Typography>
                        </Box>
                    )}

                    <Typography variant="caption" color="text.secondary">
                        {t('bridgeFw.note')}
                    </Typography>
                </Stack>
            </Box>
        </Paper>
    );
};
