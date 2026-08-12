import { Box, Alert, CssBaseline } from '@mui/material';
import { BLEProvider, useBLE } from './contexts/BLEContext';

import { ScannerView } from './components/ScannerView';
import { DeviceTopBar } from './components/DeviceTopBar';
import { VenusAView } from './components/views/VenusAView';
import { VenusDView } from './components/views/VenusDView';
import { GenericDeviceView } from './components/views/GenericDeviceView';

const MainLayout = () => {
    const {
        connectionState,
        deviceInfo,
        rssi,
        error,
        connect,
        reconnect,
        disconnect
    } = useBLE();

    if (!deviceInfo) {
        return (
            <ScannerView
                onScan={connect}
                status={connectionState}
                error={error} 
            />
        );
    }
    
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8' }}>
            <DeviceTopBar
                deviceInfo={deviceInfo}
                status={connectionState}
                rssi={rssi}
                onDisconnect={disconnect}
                onReconnect={reconnect} 
            />

            {error && <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert>}
            
            {deviceInfo.modelName === "Venus A" ? (
                <VenusAView />
            ) : deviceInfo.modelName === "Venus D" ? (
                <VenusDView />
            ) : (
                <GenericDeviceView />
            )}
        </Box>
    );
};

export default function App() {
    return (
        <BLEProvider>
            <CssBaseline />
            <MainLayout />
        </BLEProvider>
    );
}