import { AppBar, Toolbar, Typography, Chip, Button, Box } from '@mui/material';
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt';
import WifiIcon from '@mui/icons-material/Wifi';
import RefreshIcon from '@mui/icons-material/Refresh';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { ConnectionState } from '../lib/BLEConnectionManager';
import type { DeviceInfo } from "../lib/DeviceUtils.ts";

interface Props {
    deviceInfo: DeviceInfo;
    status: ConnectionState;
    rssi: number | null;
    /** The bridge's own WiFi signal, when the connection runs through one. */
    wifiRssi?: number | null;
    onDisconnect: () => void;
    onReconnect: () => void;
}

export const DeviceTopBar = ({ deviceInfo, status, rssi, wifiRssi, onDisconnect, onReconnect }: Props) => {
    const isConnected = status === ConnectionState.CONNECTED;

    let chipColor: "success" | "error" | "warning" | "default" = "default";
    if (isConnected) chipColor = "success";
    if (status === ConnectionState.CONNECTING) chipColor = "warning";
    if (status === ConnectionState.DISCONNECTED) chipColor = "error";

    return (
        <AppBar position="sticky" color="default" elevation={1}>
            <Toolbar>
                <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="h6" lineHeight={1.2}>
                        {deviceInfo.modelName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                        ID: {deviceInfo.id}
                    </Typography>
                </Box>

                {/* Two different radio links, so each one says which it is. The Bluetooth figure is
                    between whatever is talking to the storage and the storage itself; the WiFi one
                    belongs to the bridge and only exists when there is a bridge in the path. */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mr: 2 }}>
                    {rssi && (
                        <Box display="flex" alignItems="center" color="text.secondary"
                             title="Bluetooth signal to the storage">
                            <SignalCellularAltIcon fontSize="small" />
                            <Typography variant="caption" ml={0.5}>BLE {rssi} dBm</Typography>
                        </Box>
                    )}

                    <Chip
                        label={status}
                        color={chipColor}
                        size="small"
                        variant={isConnected ? "filled" : "outlined"}
                    />
                </Box>

                {wifiRssi != null && (
                    <Box display="flex" alignItems="center" color="text.secondary" mr={2}
                         title="WiFi signal of the ESP32 bridge to your access point">
                        <WifiIcon fontSize="small" />
                        <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                            Bridge WiFi {wifiRssi} dBm
                        </Typography>
                    </Box>
                )}

                {isConnected ? (
                    <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        startIcon={<PowerSettingsNewIcon />}
                        onClick={onDisconnect}
                    >
                        Disconnect
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={onReconnect}
                    >
                        Reconnect
                    </Button>
                )}
            </Toolbar>
        </AppBar>
    );
};
