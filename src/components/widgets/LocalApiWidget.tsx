import { useState } from 'react';
import {
    Paper, Typography, Box, Switch, FormControlLabel, TextField, Button, Stack, CircularProgress
} from '@mui/material';
import LanIcon from '@mui/icons-material/Lan';

import { useBLE } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID } from '../../lib/VenusConst.ts';
import { LocalApiControlPayload } from '../../lib/payloads/LocalApiControlPayload';

/**
 * Local API control (BLE command 0x28).
 *
 * Enables/disables the device's local UDP JSON-RPC API and sets its port.
 * This is the local API - NOT Modbus TCP (Modbus cannot be toggled).
 */
export const LocalApiWidget = () => {
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const [enabled, setEnabled] = useState(false);
    const [port, setPort] = useState(30000);
    const [busy, setBusy] = useState(false);

    const apply = async () => {
        if (!isConnected || busy) return;
        setBusy(true);
        try {
            const payload = new LocalApiControlPayload(enabled, port);
            await sendPacket(COMMAND_ID.LOCAL_API_CONTROL, payload.toBytes());
            pollState();
        } catch (err) {
            console.error('Failed to set local API', err);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'secondary.dark', color: 'secondary.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <LanIcon />
                <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
                    Local API
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
                            label="Port"
                            type="number"
                            value={port}
                            onChange={(e) => setPort(Number(e.target.value))}
                            slotProps={{ htmlInput: { min: 1, max: 65535, step: 1 } }}
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
                            Local UDP JSON-RPC API (default port 30000). This is not Modbus TCP.
                        </Typography>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
