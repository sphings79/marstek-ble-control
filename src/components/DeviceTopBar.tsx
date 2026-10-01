import { AppBar, Toolbar, Typography, Chip, Button, Box } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { ConnectionState } from '../lib/BLEConnectionManager';
import type { DeviceInfo } from "../lib/DeviceUtils.ts";
import { SignalReadings } from './SignalReadings';
import { useT } from '../i18n/i18n';
import type { StringKey } from '../i18n/i18n';

interface Props {
    deviceInfo: DeviceInfo;
    status: ConnectionState;
    rssi: number | null;
    onDisconnect: () => void;
    onReconnect: () => void;
}

export const DeviceTopBar = ({ deviceInfo, status, rssi, onDisconnect, onReconnect }: Props) => {
    const t = useT();
    const isConnected = status === ConnectionState.CONNECTED;

    let chipColor: "success" | "error" | "warning" | "default" = "default";
    if (isConnected) chipColor = "success";
    if (status === ConnectionState.CONNECTING) chipColor = "warning";
    if (status === ConnectionState.DISCONNECTED) chipColor = "error";

    // Sticky only from md up. On a phone it scrolls away, so the section bar with the menu
    // button is the only thing left pinned and the content gets the room.
    return (
        <AppBar position="sticky" color="default" elevation={1} sx={{ position: { xs: 'static', md: 'sticky' } }}>
            {/* Wraps rather than overflows: pushing the disconnect button off the right edge is the
                one failure here that actually costs someone something. */}
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

                {/* The status and the button stay together on the right. The radio readings sit here
                    on desktop only; on a phone they live in the pinned section bar instead. */}
                <Box sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    flexWrap: 'wrap', columnGap: 2, rowGap: 1, minWidth: 0,
                }}>
                    <Box sx={{ display: { xs: 'none', md: 'contents' } }}>
                        <SignalReadings rssi={rssi} />
                    </Box>

                    <Chip
                        label={t(`status.${status}` as StringKey)}
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
                            {t('topbar.disconnect')}
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
                            {t('topbar.reconnect')}
                        </Button>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};
