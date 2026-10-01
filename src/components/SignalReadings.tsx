import { useContext } from 'react';
import { Box, Typography } from '@mui/material';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import WifiIcon from '@mui/icons-material/Wifi';
import { useT } from '../i18n/i18n';
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

    return (
        <>
            {rssi != null && (
                <Box display="flex" alignItems="center" color="text.secondary" title={t('topbar.bleTitle')}>
                    <BluetoothIcon fontSize="small" />
                    <Typography variant="caption" ml={0.5} whiteSpace="nowrap">
                        {t('topbar.ble', { rssi })}
                    </Typography>
                </Box>
            )}

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
