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
            {/* Wraps rather than overflows. On a phone the name, two radio readings, the status
                and the button do not fit on one line, and pushing the disconnect button off the
                right edge is the one failure here that actually costs someone something. */}
            <Toolbar sx={{ flexWrap: 'wrap', rowGap: 1, columnGap: 2, py: { xs: 1, sm: 0 } }}>
                <Box sx={{ minWidth: 0, flexGrow: 1, mr: 'auto' }}>
                    <Typography variant="h6" lineHeight={1.2} noWrap>
                        {deviceInfo.modelName}
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        fontFamily="monospace"
                        display="block"
                        noWrap
                    >
                        ID: {deviceInfo.id}
                    </Typography>
                </Box>

                {/* One group, so the readings, the status and the button move to the second line
                    together instead of breaking up between them - and wraps internally as well,
                    because on a phone even that group alone is wider than the screen.

                    Two different radio links, so each one says which it is. The Bluetooth figure
                    is between whatever is talking to the storage and the storage itself; the WiFi
                    one belongs to the bridge and only exists when there is a bridge in the path. */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    flexWrap: 'wrap', columnGap: 2, rowGap: 1, minWidth: 0,
                }}>
                    {rssi != null && (
                        <Box display="flex" alignItems="center" color="text.secondary"
                             title="Bluetooth signal to the storage">
                            <SignalCellularAltIcon fontSize="small" />
                            <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                                BLE {rssi} dBm
                            </Typography>
                        </Box>
                    )}

                    {wifiRssi != null && (
                        <Box display="flex" alignItems="center" color="text.secondary"
                             title="WiFi signal of the ESP32 bridge to your access point">
                            <WifiIcon fontSize="small" />
                            <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                                Bridge WiFi {wifiRssi} dBm
                            </Typography>
                        </Box>
                    )}

                    <Chip
                        label={status}
                        color={chipColor}
                        size="small"
                        variant={isConnected ? "filled" : "outlined"}
                    />

                    {isConnected ? (
                        <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            startIcon={<PowerSettingsNewIcon />}
                            onClick={onDisconnect}
                            sx={{ flexShrink: 0 }}
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
                            sx={{ flexShrink: 0 }}
                        >
                            Reconnect
                        </Button>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};
