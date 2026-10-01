import { useEffect, useRef, useState } from 'react';
import {
    Paper, Typography, Box, Button, Stack, Alert, LinearProgress,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
    List, ListItem, ListItemText, Chip
} from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { ArchiveDialog } from './ArchiveDialog';
import { archiveSupports } from '../../lib/ota/FirmwareArchive';
import { useBLE } from '../../contexts/BLEContext';
import { useT } from '../../i18n/i18n';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { OtaManager, OtaPhase, analyzeFirmwareForOta, detectModelMismatch, type OtaAnalysis, type OtaProgress } from '../../lib/ota/OtaManager';

const MAX_LOG_LINES = 300;

export const OtaWidget = () => {
    const t = useT();
    const { manager, connectionState, deviceInfo } = useBLE();
    const modelName = deviceInfo?.modelName;
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const otaManagerRef = useRef<OtaManager | null>(null);

    const [analysis, setAnalysis] = useState<OtaAnalysis | null>(null);
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [progress, setProgress] = useState<OtaProgress | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const logBoxRef = useRef<HTMLDivElement>(null);

    // Keep the newest log line in view.
    useEffect(() => {
        const el = logBoxRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [log]);

    const appendLog = (msg: string) => {
        setLog(prev => {
            const next = [...prev, msg];
            return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
        });
    };

    // Shared by a picked file and an image from the archive, so both go through the same analysis.
    const loadFirmware = (fileName: string, buf: Uint8Array) => {
        const a = analyzeFirmwareForOta(fileName, buf);

        setFileBytes(buf);
        setAnalysis(a);
        setProgress(null);
        setLog([]);

        appendLog(`Selected: ${fileName} (${buf.length.toLocaleString()} bytes)`);
        appendLog(`Detected model: ${a.modelGuess.model} (${a.modelGuess.reason})`);
        appendLog(`Detected component: ${a.componentGuess.component}, OTA type flag 0x${a.componentGuess.otaTypeFlag.toString(16).padStart(2, '0')} (${a.componentGuess.reason})`);
        appendLog(`Checksum: 0x${(a.checksum >>> 0).toString(16).padStart(8, '0')}`);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        loadFirmware(file.name, new Uint8Array(await file.arrayBuffer()));
    };

    const handleArchivePick = (name: string, bytes: Uint8Array) => {
        setArchiveOpen(false);
        loadFirmware(name, bytes);
    };

    const startClicked = () => {
        if (!analysis || !fileBytes) return;
        setConfirmOpen(true);
    };

    const runOta = async () => {
        if (!analysis || !fileBytes) return;
        setConfirmOpen(false);
        setRunning(true);

        if (!otaManagerRef.current) {
            otaManagerRef.current = new OtaManager(manager);
        }

        try {
            await otaManagerRef.current.run(fileBytes, analysis, appendLog, setProgress);
            // Done: drop the loaded file so the start button cannot be pressed a second time.
            setAnalysis(null);
            setFileBytes(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            appendLog(`❌ OTA failed: ${(err as Error).message}`);
        } finally {
            setRunning(false);
        }
    };

    const { mismatch, connectedModel } = analysis
        ? detectModelMismatch(analysis, manager.deviceName)
        : { mismatch: false, connectedModel: 'Unknown' };

    const isNonEmsComponent = analysis?.componentGuess.component === 'Micro/Inverter' || analysis?.componentGuess.component === 'MPPT';

    const phaseLabel: Record<string, string> = {
        [OtaPhase.ACTIVATING]: t('ota.phase.activating'),
        [OtaPhase.DISCOVERING]: t('ota.phase.discovering'),
        [OtaPhase.SENDING_SIZE]: t('ota.phase.sendingSize'),
        [OtaPhase.TRANSFERRING]: t('ota.phase.transferring'),
        [OtaPhase.FINALIZING]: t('ota.phase.finalizing'),
        [OtaPhase.SUCCESS]: t('ota.phase.success'),
        [OtaPhase.FAILED]: t('ota.phase.failed'),
    };

    const percent = progress && progress.totalChunks > 0
        ? Math.round((progress.chunkIndex / progress.totalChunks) * 100)
        : (progress?.phase === OtaPhase.SUCCESS ? 100 : 0);

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'error.dark', color: 'error.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <SystemUpdateAltIcon />
                <Typography variant="h6" fontWeight="bold">{t('ota.title')}</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {t('ota.risk')}
                </Alert>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".bin"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />

                <Stack spacing={2}>
                    <Button
                        variant="outlined"
                        color="error"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isConnected || running}
                    >
                        {t('ota.selectFile')}
                    </Button>

                    {archiveSupports(modelName) && (
                        <Button
                            variant="outlined"
                            color="error"
                            onClick={() => setArchiveOpen(true)}
                            disabled={!isConnected || running}
                        >
                            {t('ota.archive.button')}
                        </Button>
                    )}

                    {analysis && (
                        <Box>
                            <Typography variant="body2" fontWeight="bold">{analysis.fileName}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                                {t('ota.fileInfo', {
                                    size: analysis.size.toLocaleString(),
                                    checksum: (analysis.checksum >>> 0).toString(16).padStart(8, '0'),
                                })}
                            </Typography>
                            <Stack direction="row" spacing={1} mt={1}>
                                <Chip size="small" label={t('ota.model', { model: analysis.modelGuess.model })} color={mismatch ? 'error' : 'default'} />
                                <Chip size="small" label={t('ota.component', { component: analysis.componentGuess.component })} color={isNonEmsComponent ? 'warning' : 'default'} />
                            </Stack>
                            {mismatch && (
                                <Alert severity="error" sx={{ mt: 1 }}>
                                    {t('ota.mismatch', { file: analysis.modelGuess.model, device: String(connectedModel) })}
                                </Alert>
                            )}
                        </Box>
                    )}

                    <Button
                        variant="contained"
                        color="error"
                        onClick={startClicked}
                        disabled={!isConnected || !analysis || running}
                    >
                        {t('ota.start')}
                    </Button>

                    {progress && (
                        <Box>
                            <LinearProgress
                                variant="determinate"
                                value={percent}
                                color={progress.phase === OtaPhase.FAILED ? 'error' : progress.phase === OtaPhase.SUCCESS ? 'success' : 'primary'}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {phaseLabel[progress.phase] ?? progress.message} {progress.totalChunks > 0 ? `(${progress.chunkIndex}/${progress.totalChunks})` : ''}
                            </Typography>
                        </Box>
                    )}

                    {log.length > 0 && (
                        <Box ref={logBoxRef} sx={{ maxHeight: 220, overflowY: 'auto', bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1 }}>
                            <List dense disablePadding>
                                {log.map((line, i) => (
                                    <ListItem key={i} sx={{ py: 0 }}>
                                        <ListItemText primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace' }} primary={line} />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </Stack>
            </Box>

            {modelName && (
                <ArchiveDialog
                    open={archiveOpen}
                    modelName={modelName}
                    onClose={() => setArchiveOpen(false)}
                    onPick={handleArchivePick}
                />
            )}

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon color="warning" />
                    {t('ota.confirmTitle')}
                </DialogTitle>
                <DialogContent>
                    {mismatch && (
                        <DialogContentText sx={{ mb: 2 }}>
                            {t('ota.confirmMismatch.1')} <strong>{analysis?.modelGuess.model}</strong>
                            {t('ota.confirmMismatch.2')} <strong>{connectedModel}</strong>
                            {t('ota.confirmMismatch.3')}
                        </DialogContentText>
                    )}
                    <DialogContentText>{t('ota.confirmAsk')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)} color="inherit">{t('common.cancel')}</Button>
                    <Button onClick={() => void runOta()} color="error" variant="contained">
                        {t('ota.continue')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
