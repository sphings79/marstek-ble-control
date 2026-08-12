import { useRef, useState } from 'react';
import {
    Paper, Typography, Box, Button, Stack, Alert, LinearProgress,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
    List, ListItem, ListItemText, Chip
} from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { useBLE } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { OtaManager, OtaPhase, analyzeFirmwareForOta, detectModelMismatch, type OtaAnalysis, type OtaProgress } from '../../lib/ota/OtaManager';

const MAX_LOG_LINES = 300;

export const OtaWidget = () => {
    const { manager, connectionState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const otaManagerRef = useRef<OtaManager | null>(null);

    const [analysis, setAnalysis] = useState<OtaAnalysis | null>(null);
    const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [progress, setProgress] = useState<OtaProgress | null>(null);
    const [log, setLog] = useState<string[]>([]);
    const [running, setRunning] = useState(false);

    const appendLog = (msg: string) => {
        setLog(prev => {
            const next = [...prev, msg];
            return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
        });
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const buf = new Uint8Array(await file.arrayBuffer());
        const a = analyzeFirmwareForOta(file.name, buf);

        setFileBytes(buf);
        setAnalysis(a);
        setProgress(null);
        setLog([]);

        appendLog(`Selected: ${file.name} (${file.size.toLocaleString()} bytes)`);
        appendLog(`Detected model: ${a.modelGuess.model} (${a.modelGuess.reason})`);
        appendLog(`Detected component: ${a.componentGuess.component}, OTA type flag 0x${a.componentGuess.otaTypeFlag.toString(16).padStart(2, '0')} (${a.componentGuess.reason})`);
        appendLog(`Checksum: 0x${(a.checksum >>> 0).toString(16).padStart(8, '0')}`);
    };

    const needsConfirmation = () => {
        if (!analysis) return false;
        const { mismatch } = detectModelMismatch(analysis, manager.device?.name);
        return mismatch || analysis.componentGuess.component === 'Micro/Inverter' || analysis.componentGuess.component === 'MPPT';
    };

    const startClicked = () => {
        if (!analysis || !fileBytes) return;
        if (needsConfirmation()) {
            setConfirmOpen(true);
        } else {
            void runOta();
        }
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
        } catch (err) {
            appendLog(`❌ OTA failed: ${(err as Error).message}`);
        } finally {
            setRunning(false);
        }
    };

    const { mismatch, connectedModel } = analysis
        ? detectModelMismatch(analysis, manager.device?.name)
        : { mismatch: false, connectedModel: 'Unknown' };

    const isNonEmsComponent = analysis?.componentGuess.component === 'Micro/Inverter' || analysis?.componentGuess.component === 'MPPT';

    const phaseLabel: Record<string, string> = {
        [OtaPhase.ACTIVATING]: 'Activating upgrade mode...',
        [OtaPhase.DISCOVERING]: 'Discovering OTA channel...',
        [OtaPhase.SENDING_SIZE]: 'Sending firmware size...',
        [OtaPhase.TRANSFERRING]: 'Transferring firmware...',
        [OtaPhase.FINALIZING]: 'Finalizing...',
        [OtaPhase.SUCCESS]: 'Update complete - device will restart',
        [OtaPhase.FAILED]: 'Failed',
    };

    const percent = progress && progress.totalChunks > 0
        ? Math.round((progress.chunkIndex / progress.totalChunks) * 100)
        : (progress?.phase === OtaPhase.SUCCESS ? 100 : 0);

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'error.dark', color: 'error.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <SystemUpdateAltIcon />
                <Typography variant="h6" fontWeight="bold">Firmware Update (OTA)</Typography>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Experimental and reverse-engineered. Can permanently brick the device. Only
                    proceed if you have a recovery plan and understand the risk.
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
                        Select Firmware File
                    </Button>

                    {analysis && (
                        <Box>
                            <Typography variant="body2" fontWeight="bold">{analysis.fileName}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                                {analysis.size.toLocaleString()} bytes - checksum 0x{(analysis.checksum >>> 0).toString(16).padStart(8, '0')}
                            </Typography>
                            <Stack direction="row" spacing={1} mt={1}>
                                <Chip size="small" label={`Model: ${analysis.modelGuess.model}`} color={mismatch ? 'error' : 'default'} />
                                <Chip size="small" label={`Component: ${analysis.componentGuess.component}`} color={isNonEmsComponent ? 'warning' : 'default'} />
                            </Stack>
                            {mismatch && (
                                <Alert severity="error" sx={{ mt: 1 }}>
                                    Model mismatch: this file looks like {analysis.modelGuess.model}, connected
                                    device looks like {connectedModel}.
                                </Alert>
                            )}
                            {isNonEmsComponent && (
                                <Alert severity="warning" sx={{ mt: 1 }}>
                                    {analysis.componentGuess.component} firmware - uses OTA type flag 0x{analysis.componentGuess.otaTypeFlag.toString(16).padStart(2, '0')},
                                    verified via static analysis of the Control firmware, not yet confirmed on real hardware.
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
                        Start OTA Update
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
                        <Box sx={{ maxHeight: 220, overflowY: 'auto', bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1 }}>
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

            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon color="warning" />
                    Confirm Firmware Update
                </DialogTitle>
                <DialogContent>
                    {mismatch && (
                        <DialogContentText sx={{ mb: 2 }}>
                            This firmware file looks like it is for <strong>{analysis?.modelGuess.model}</strong>, but the
                            connected device looks like <strong>{connectedModel}</strong>. Flashing firmware built for a
                            different model can permanently brick the device. This is only a best-effort filename/content
                            check, not a guarantee.
                        </DialogContentText>
                    )}
                    {isNonEmsComponent && (
                        <DialogContentText>
                            This file looks like <strong>{analysis?.componentGuess.component}</strong> firmware, not
                            Control/EMS. This tool will send OTA type flag 0x{analysis?.componentGuess.otaTypeFlag.toString(16).padStart(2, '0')},
                            which per Ghidra analysis of the Control MCU's validation function is what it expects for
                            this component - the Control MCU should relay it to the physical chip over CAN on its own.
                            This has NOT yet been confirmed by an actual successful flash.
                        </DialogContentText>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={() => void runOta()} color="error" variant="contained">
                        I understand, continue
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
