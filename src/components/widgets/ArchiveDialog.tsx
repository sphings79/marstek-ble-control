import { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    Link, List, ListItemButton, ListItemText, ListSubheader, Typography,
} from '@mui/material';

import { useI18n } from '../../i18n/i18n';
import {
    ARCHIVE_URL, downloadArchiveFirmware, fetchArchiveFirmwares, type ArchiveFirmware,
} from '../../lib/ota/FirmwareArchive';

interface Props {
    open: boolean;
    modelName: string;
    onClose: () => void;
    /** Called with the verified image once the download is done. */
    onPick: (name: string, bytes: Uint8Array) => void;
}

/** Picks an image from the firmware archive, limited to the connected model. */
export const ArchiveDialog = ({ open, modelName, onClose, onPick }: Props) => {
    const { t, language } = useI18n();

    const [list, setList] = useState<ArchiveFirmware[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyFile, setBusyFile] = useState<string | null>(null);

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
        <Dialog open={open} onClose={busyFile ? undefined : onClose} fullWidth maxWidth="sm" scroll="paper">
            <DialogTitle>{t('ota.archive.title', { model: modelName })}</DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

                {list === null && !error && (
                    <Box display="flex" justifyContent="center" p={4}><CircularProgress size={28} /></Box>
                )}

                {list !== null && list.length === 0 && (
                    <Typography variant="body2" color="text.secondary" p={2}>{t('ota.archive.empty')}</Typography>
                )}

                <List dense disablePadding>
                    {types.map(type => (
                        <li key={type}>
                            <ListSubheader sx={{ lineHeight: '32px', fontWeight: 'bold' }}>{type}</ListSubheader>
                            {(list ?? []).filter(fw => fw.type === type).map(fw => {
                                const note = (language === 'de' ? fw.noteDE : fw.noteEN).trim();
                                return (
                                    <ListItemButton
                                        key={fw.file}
                                        onClick={() => void pick(fw)}
                                        disabled={busyFile !== null}
                                    >
                                        <ListItemText
                                            primary={
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <strong>{fw.display}</strong>
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
                        </li>
                    ))}
                </List>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                    <Link href={ARCHIVE_URL} target="_blank" rel="noopener noreferrer" underline="hover">
                        {t('ota.archive.source')}
                    </Link>
                </Typography>
                <Button onClick={onClose} color="inherit" disabled={busyFile !== null}>{t('common.cancel')}</Button>
            </DialogActions>
        </Dialog>
    );
};
