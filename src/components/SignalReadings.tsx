import { useContext } from 'react';
import { Box, Typography } from '@mui/material';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import { useT } from '../i18n/i18n';
import { useBLE } from '../contexts/BLEContext';
import { ConnectionState } from '../lib/BLEConnectionManager';
import { WifiRssiContext } from './WifiRssiContext';

interface Props {
    rssi: number | null;
}

/**
 * The radio readings shown in the header (desktop) and the pinned section bar (mobile).
 * Two different links, told apart by their icon and tooltip: the Bluetooth figure is between
 * whatever is talking to the storage and the storage itself; the WiFi one belongs to the bridge
 * and only exists when there is a bridge in the path.
 */
export const SignalReadings = ({ rssi }: Props) => {
    const t = useT();
    const wifiRssi = useContext(WifiRssiContext);
    const { connectionState } = useBLE();

    // The Bluetooth reading doubles as the link indicator: it turns red when the link is gone
    // (and orange while reconnecting), so a lost connection is visible even when the device
    // header has scrolled away.
    const isLost = connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR;
    const bleColor = isLost ? 'error.main'
        : connectionState === ConnectionState.CONNECTING ? 'warning.main'
        : 'text.secondary';

    // Words while the link is down or coming up, the dBm value while it holds. A connected link
    // without a reading yet shows dashes, so the bar keeps its width either way.
    const bleText = isLost ? t('topbar.lost')
        : connectionState === ConnectionState.CONNECTING ? t('topbar.connecting')
        : rssi != null ? t('topbar.ble', { rssi })
        : t('topbar.noValue');

    return (
        <>
            <Box display="flex" alignItems="center" color={bleColor} title={t('topbar.bleTitle')}>
                <BluetoothIcon fontSize="small" />
                <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                    {bleText}
                </Typography>
            </Box>

            {wifiRssi != null && (
                <Box display="flex" alignItems="center" color="text.secondary" title={t('topbar.wifiTitle')}>
                    <WifiIcon fontSize="small" />
                    <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                        {t('topbar.wifi', { rssi: wifiRssi })}
                    </Typography>
                </Box>
            )}
        </>
    );
};
