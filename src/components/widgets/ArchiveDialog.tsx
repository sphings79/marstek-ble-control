import { useEffect, useState } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress,
    Dialog, DialogActions, DialogContent, Link, List, ListItemButton, ListItemText, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { useI18n } from '../../i18n/i18n';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import {
    ARCHIVE_URL, downloadArchiveFirmware, fetchArchiveFirmwares, versionLabel, type ArchiveFirmware,
} from '../../lib/ota/FirmwareArchive';

interface Props {
    open: boolean;
    modelName: string;
    onClose: () => void;
    /** Called with the verified image once the download is done. */
    onPick: (name: string, bytes: Uint8Array) => void;
}

// Which key of the device-info response carries the installed version of each component.
const INSTALLED_KEY: Record<string, string> = {
    Control: 'dev_ver',
    BMS: 'bms_ver',
    Micro: 'inv_ver',
};

/** Picks an image from the firmware archive, limited to the connected model. */
export const ArchiveDialog = ({ open, modelName, onClose, onPick }: Props) => {
    const { t, language } = useI18n();
    const { sendPacket } = useBLE();
    const deviceInfo = useVenusData(COMMAND_ID.DEVICE_INFO);

    const [list, setList] = useState<ArchiveFirmware[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyFile, setBusyFile] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ Control: true });

    // Fetched each time the dialog opens, so a freshly archived image shows up without a reload.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setList(null);
        setError(null);
        fetchArchiveFirmwares(modelName)
            .then(result => { if (!cancelled) setList(result); })
            .catch((err: Error) => { if (!cancelled) setError(t('ota.archive.error', { detail: err.message })); });
        return () => { cancelled = true; };
    }, [open, modelName, t]);

    // The installed versions come from the device info. It is normally already there because the
    // device info card asked for it; if that card has not run (another section on a phone), ask.
    useEffect(() => {
        if (open && !deviceInfo) void sendPacket(COMMAND_ID.DEVICE_INFO).catch(() => {});
    }, [open, deviceInfo, sendPacket]);

    const installedOf = (type: string): string | undefined => {
        const key = INSTALLED_KEY[type];
        return key ? deviceInfo?.data.get(key) : undefined;
    };

    const pick = async (fw: ArchiveFirmware) => {
        setBusyFile(fw.file);
        setError(null);
        try {
            const { name, bytes } = await downloadArchiveFirmware(fw);
            onPick(name, bytes);
        } catch (err) {
            setError(t('ota.archive.downloadError', { detail: (err as Error).message }));
        } finally {
            setBusyFile(null);
        }
    };

    const types = [...new Set((list ?? []).map(fw => fw.type))];

    return (
        <Dialog
            open={open}
            onClose={busyFile ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            scroll="paper"
            slotProps={{ paper: { sx: { overflow: 'hidden' } } }}
        >
            {/* Same header as the cards on the page, in the OTA card's red. */}
            <Box sx={{ p: 2, bgcolor: 'error.dark', color: 'error.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <SystemUpdateAltIcon />
                <Typography variant="h6" fontWeight="bold">{t('ota.archive.title', { model: modelName })}</Typography>
            </Box>

            <DialogContent sx={{ p: 2 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {list === null && !error && (
                    <Box display="flex" justifyContent="center" p={4}><CircularProgress size={28} /></Box>
                )}

                {list !== null && list.length === 0 && (
                    <Typography variant="body2" color="text.secondary">{t('ota.archive.empty')}</Typography>
                )}

                {types.map(type => {
                    const items = (list ?? []).filter(fw => fw.type === type);
                    const installed = installedOf(type);

                    return (
                        <Accordion
                            key={type}
                            disableGutters
                            variant="outlined"
                            expanded={expanded[type] ?? false}
                            onChange={(_, isOpen) => setExpanded(prev => ({ ...prev, [type]: isOpen }))}
                            sx={{ '&::before': { display: 'none' }, '&:not(:last-of-type)': { mb: 1 } }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                    <Typography fontWeight="bold">{type}</Typography>
                                    <Typography variant="caption" color="text.secondary">{items.length}</Typography>
                                    {installed && (
                                        <Chip size="small" color="success" variant="outlined"
                                              label={t('ota.archive.installedVersion', { version: versionLabel(installed, t('ota.archive.beta')) ?? installed })} />
                                    )}
                                </Box>
                            </AccordionSummary>
                            <AccordionDetails sx={{ p: 0 }}>
                                <List dense disablePadding>
                                    {items.map(fw => {
                                        const note = (language === 'de' ? fw.noteDE : fw.noteEN).trim();
                                        const isInstalled = installed !== undefined && installed === fw.version;

                                        return (
                                            <ListItemButton
                                                key={fw.file}
                                                onClick={() => void pick(fw)}
                                                disabled={busyFile !== null}
                                                selected={isInstalled}
                                                divider
                                            >
                                                <ListItemText
                                                    primary={
                                                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                                            <strong>{fw.display}</strong>
                                                            {isInstalled && <Chip size="small" color="success" label={t('ota.archive.installed')} />}
                                                            {fw.beta && <Chip size="small" color="warning" label={t('ota.archive.beta')} />}
                                                            {fw.date && <Typography variant="caption" color="text.secondary">{fw.date}</Typography>}
                                                        </Box>
                                                    }
                                                    secondary={note || undefined}
                                                    slotProps={{ secondary: { sx: { whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } } }}
                                                />
                                                {busyFile === fw.file && <CircularProgress size={18} />}
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            </AccordionDetails>
                        </Accordion>
                    );
                })}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 2 }}>
                <Typography variant="caption" color="text.secondary">
                    <Link href={ARCHIVE_URL} target="_blank" rel="noopener noreferrer" underline="hover">
                        {t('ota.archive.source')}
                    </Link>
                </Typography>
                <Button onClick={onClose} color="inherit" disabled={busyFile !== null}>{t('common.cancel')}</Button>
            </DialogActions>
        </Dialog>
    );
};
