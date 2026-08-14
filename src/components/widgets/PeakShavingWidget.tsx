import { useState } from 'react';
import {
    Paper, Typography, Box, Switch, FormControlLabel, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

import { useBLE } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { PeakShavingControlPayload } from '../../lib/payloads/PeakShavingControlPayload';

/**
 * Peak Shaving control (firmware v150+, BLE command 0x29).
 *
 * Caps grid power at a configurable threshold. Payload = { peak_state: u8, power: i16 (W) }.
 * The firmware does not report the current peak-shaving state in the STATE (0x03) response,
 * so this is a fire-and-forget control: set the values and press Apply.
 */
export const PeakShavingWidget = () => {
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const [enabled, setEnabled] = useState(false);
    const [power, setPower] = useState(600);
    const [busy, setBusy] = useState(false);

    const apply = async () => {
        if (!isConnected || busy) return;
        setBusy(true);
        try {
            const payload = new PeakShavingControlPayload(enabled, power);
            await sendPacket(COMMAND_ID.PEAK_SHAVING_CONTROL, payload.toBytes());
            pollState();
        } catch (err) {
            console.error('Failed to set peak shaving', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingDownIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    Peak Shaving
                </Typography>
            </Box>

            <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                {!isConnected ? (
                    <Box display="flex" flexGrow={1} alignItems="center" justifyContent="center">
                        <Typography variant="body2" color="text.secondary">Waiting for connection...</Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        <FormControlLabel
                            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                            label={enabled ? 'Enabled' : 'Disabled'}
                        />
                        <TextField
                            label="Peak power (W)"
                            type="number"
                            value={power}
                            onChange={(e) => setPower(Number(e.target.value))}
                            slotProps={{ htmlInput: { min: 0, max: 2500, step: 50 } }}
                            disabled={!enabled}
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
                            Caps grid power at the configured threshold (firmware v150+, BLE cmd 0x29).
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
