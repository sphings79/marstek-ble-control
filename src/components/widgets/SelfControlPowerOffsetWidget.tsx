import { useState } from 'react';
import {
    Paper, Typography, Box, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';

import { useBLE } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { SelfControlPowerOffsetPayload } from '../../lib/payloads/SelfControlPowerOffsetPayload';

/**
 * Self-consumption power offset (BLE command 0x55). Signed watt bias for the
 * self-consumption controller (target grid power instead of 0 W).
 */
export const SelfControlPowerOffsetWidget = () => {
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const [offset, setOffset] = useState(0);
    const [busy, setBusy] = useState(false);

    const apply = async () => {
        if (!isConnected || busy) return;
        setBusy(true);
        try {
            const payload = new SelfControlPowerOffsetPayload(offset);
            await sendPacket(COMMAND_ID.SELF_CONTROL_POWER_OFFSET, payload.toBytes());
            pollState();
        } catch (err) {
            console.error('Failed to set self-consumption offset', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TuneIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    Self-Consumption Offset
                </Typography>
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" flexGrow={1} alignItems="center" justifyContent="center">
                        <Typography variant="body2" color="text.secondary">Waiting for connection...</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        <TextField
                            label="Grid target offset (W)"
                            type="number"
                            value={offset}
                            onChange={(e) => setOffset(Number(e.target.value))}
                            slotProps={{ htmlInput: { min: -2500, max: 2500, step: 10 } }}
                            fullWidth
                            size="small"
                        />
                        <Button
                            variant="contained"
                            onClick={apply}
                            disabled={busy}
                            fullWidth
                            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                        >
                            {busy ? 'Applying...' : 'Apply'}
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                            Regulate to this grid power instead of 0 W. Positive = keep importing a little, negative = keep exporting a little (BLE cmd 0x55).
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
