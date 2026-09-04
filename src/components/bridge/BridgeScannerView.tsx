import { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, List, ListItemButton, ListItemText, Stack, Typography
} from '@mui/material';
import RouterIcon from '@mui/icons-material/Router';
import BluetoothSearchingIcon from '@mui/icons-material/BluetoothSearching';

import { BridgeCard } from './BridgeCard';
import { BridgeFirmwareCard } from './BridgeFirmwareCard';
import { ConnectionState } from '../../lib/ConnectionState';
import type { BridgeDevice, BridgeTransport } from '../../lib/transport/BridgeTransport';

interface Props {
    bridge: BridgeTransport;
    status: ConnectionState;
    error: string | null;
    onConnect: () => void;
}

/**
 * Stands in for the browser's device chooser, which does not exist in bridge mode. The bridge is
 * pinned to one device - a battery only accepts a single BLE connection, so one bridge serves one
 * storage - and this screen either offers to connect to it or, if nothing is bound yet, lets the
 * bridge scan and pick.
 *
 * Connecting is deliberately a button press rather than automatic: every open tab would otherwise
 * claim the battery's only BLE slot.
 */
export const BridgeScannerView = ({ bridge, status, error, onConnect }: Props) => {
    const [devices, setDevices] = useState<BridgeDevice[] | null>(null);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);

    const bound = bridge.deviceName;
    const busy = status === ConnectionState.CONNECTING || status === ConnectionState.SCANNING;

    useEffect(() => bridge.onScanResults((found) => {
        setDevices(found);
        setScanning(false);
    }), [bridge]);

    const rescan = async () => {
        setScanning(true);
        setScanError(null);
        setDevices(null);
        try {
            await bridge.scan();
        } catch (err) {
            setScanError((err as Error).message);
            setScanning(false);
        }
    };

    const pick = async (device: BridgeDevice) => {
        try {
            await bridge.bind(device.address, device.name);
            setDevices(null);
            onConnect();
        } catch (err) {
            setScanError((err as Error).message);
        }
    };

    return (
        <BridgeCard
            icon={scanning
                ? <BluetoothSearchingIcon sx={{ fontSize: 60, color: 'primary.main' }} />
                : <RouterIcon sx={{ fontSize: 60, color: 'primary.main' }} />}
            title={bound ?? 'No device selected'}
            description={bound
                ? 'Reached through the ESP32 bridge instead of your browser\'s Bluetooth.'
                : 'The bridge is not paired with a storage yet. Scan and pick one.'}
        >
            <Stack spacing={2}>
                {error && <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>}
                {scanError && <Alert severity="error" sx={{ textAlign: 'left' }}>{scanError}</Alert>}

                {devices && devices.length === 0 && !scanning && (
                    <Alert severity="warning" sx={{ textAlign: 'left' }}>
                        The bridge did not see any Marstek device. Move it closer to the storage, or
                        check that nothing else is holding the battery's Bluetooth connection.
                    </Alert>
                )}

                {devices && devices.length > 0 && (
                    <List dense sx={{ textAlign: 'left', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        {devices.map(device => (
                            <ListItemButton key={device.address} onClick={() => void pick(device)}>
                                <ListItemText primary={device.name} secondary={device.address} />
                                <Chip size="small" label={`${device.rssi} dBm`} />
                            </ListItemButton>
                        ))}
                    </List>
                )}

                {scanning && (
                    <Stack alignItems="center" spacing={1} py={1}>
                        <CircularProgress size={24} />
                        <Typography variant="caption" color="text.secondary">Bridge is scanning...</Typography>
                    </Stack>
                )}

                {bound && (
                    <Button
                        variant="contained"
                        size="large"
                        onClick={onConnect}
                        disabled={busy || scanning}
                        fullWidth
                        sx={{ py: 1.5, fontWeight: 'bold', textTransform: 'none', fontSize: '1.1rem' }}
                    >
                        {status === ConnectionState.CONNECTING ? 'Connecting...' : 'Connect'}
                    </Button>
                )}

                <Button
                    variant={bound ? 'outlined' : 'contained'}
                    size="large"
                    onClick={() => void rescan()}
                    disabled={scanning || busy}
                    fullWidth
                    sx={{ py: 1.5, fontWeight: 'bold', textTransform: 'none' }}
                >
                    {bound ? 'Scan for another device' : 'Scan'}
                </Button>

                {/* Also here, not just on the dashboard: a bridge that cannot reach the storage is
                    exactly when a firmware fix is most likely to be the thing that is needed. */}
                <Box mt={2}>
                    <BridgeFirmwareCard />
                </Box>
            </Stack>
        </BridgeCard>
    );
};
