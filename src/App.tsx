import { Box, Alert, CssBaseline } from '@mui/material';
import { BLEProvider, useBLE } from './contexts/BLEContext';

import { ScannerView } from './components/ScannerView';
import { DeviceTopBar } from './components/DeviceTopBar';
import { Footer } from './components/Footer';
import { VenusAView } from './components/views/VenusAView';
import { VenusDView } from './components/views/VenusDView';
import { VenusEView } from './components/views/VenusEView';
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
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8', display: 'flex', flexDirection: 'column' }}>
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
            ) : deviceInfo.modelName === "Venus E 3.0" ? (
                <VenusEView />
            ) : (
                <GenericDeviceView />
            )}

            {/* On mobile the hamburger menu already carries the project links, so the page footer
                is only shown from md up to avoid duplicating them. */}
            <Box sx={{ mt: 'auto', display: { xs: 'none', md: 'block' } }}>
                <Footer />
            </Box>
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