import { Box, ButtonBase, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';

import { useBLE } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/ConnectionState';
import { useT } from '../../i18n/i18n';

const dotColor = (state: ConnectionState, bound: boolean): string => {
    if (!bound) return 'grey.400';
    switch (state) {
        case ConnectionState.CONNECTED: return 'success.main';
        case ConnectionState.CONNECTING: return 'warning.main';
        case ConnectionState.ERROR: return 'error.main';
        default: return 'grey.500';
    }
};

/**
 * Picks which of the bridge's storage slots the rest of the app shows. Switching never
 * disconnects anything: every bound slot keeps its link, only the one on screen is polled.
 */
export const BridgeSlotBar = () => {
    const t = useT();
    const { slots, activeSlot, setActiveSlot, unbindSlot } = useBLE();

    if (slots.length === 0) return null;

    const active = slots[activeSlot];

    return (
        <Stack direction="row" spacing={1} alignItems="stretch" sx={{ width: '100%' }}>
            {slots.map(slot => {
                const selected = slot.index === activeSlot;
                const bound = !!slot.address;
                return (
                    <ButtonBase
                        key={slot.index}
                        onClick={() => setActiveSlot(slot.index)}
                        aria-pressed={selected}
                        sx={{
                            flex: '1 1 0', minWidth: 0, p: 1, borderRadius: 1, textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-start',
                            border: '1px solid', borderColor: selected ? 'primary.main' : 'divider',
                            bgcolor: selected ? 'action.selected' : 'background.paper',
                        }}
                    >
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: dotColor(slot.state, bound) }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight="bold" noWrap>
                                {t('bridgeSlot.title', { n: slot.index + 1 })}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                                {bound ? (slot.name || slot.address) : t('bridgeSlot.empty')}
                            </Typography>
                        </Box>
                    </ButtonBase>
                );
            })}

            {active?.address && (
                <Tooltip title={t('bridgeSlot.remove')}>
                    <IconButton aria-label={t('bridgeSlot.remove')} onClick={() => unbindSlot(activeSlot)} sx={{ flexShrink: 0 }}>
                        <LinkOffIcon />
                    </IconButton>
                </Tooltip>
            )}
        </Stack>
    );
};
