import { useEffect, useState } from 'react';
import { Box, Alert, CssBaseline, CircularProgress, Typography } from '@mui/material';
import { BLEProvider, useBLE } from './contexts/BLEContext';

import { ScannerView } from './components/ScannerView';
import { DeviceTopBar } from './components/DeviceTopBar';
import { Footer } from './components/Footer';
import { VenusAView } from './components/views/VenusAView';
import { VenusDView } from './components/views/VenusDView';
import { VenusEView } from './components/views/VenusEView';
import { GenericDeviceView } from './components/views/GenericDeviceView';
import { BridgeAuthView } from './components/bridge/BridgeAuthView';
import { BridgeScannerView } from './components/bridge/BridgeScannerView';
import { probeBridge, type BridgeInfo } from './lib/bridge/BridgeApi';
import { BridgeTransport } from './lib/transport/BridgeTransport';
import { useT } from './i18n/i18n';

const MainLayout = ({ bridge }: { bridge: BridgeTransport | null }) => {
    const [wifiRssi, setWifiRssi] = useState<number | null>(null);

    useEffect(() => bridge?.onWifiRssi(setWifiRssi), [bridge]);

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
        return bridge
            ? (
                <BridgeScannerView
                    bridge={bridge}
                    status={connectionState}
                    error={error}
                    onConnect={connect}
                />
            )
            : (
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
                wifiRssi={wifiRssi}
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

const Splash = () => {
    const t = useT();

    return (
    <Box
        sx={{
            minHeight: '100vh', bgcolor: '#f4f6f8', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
        }}
    >
        <CircularProgress />
        <Typography color="text.secondary" variant="body2">{t('app.starting')}</Typography>
    </Box>
    );
};

/**
 * Decides at startup how this copy of the app reaches the battery.
 *
 * The exact same bundle is served two ways: from the hosted site over HTTPS, where it uses Web
 * Bluetooth, and from an ESP32 bridge's own flash, where it relays through that bridge instead.
 * Asking our own origin is what tells the two apart - only the bridge answers the probe.
 */
export default function App() {
    const [bridgeInfo, setBridgeInfo] = useState<BridgeInfo | null>(null);
    const [detecting, setDetecting] = useState(true);
    const [transport, setTransport] = useState<BridgeTransport | null>(null);

    useEffect(() => {
        let cancelled = false;

        void probeBridge().then(info => {
            if (cancelled) return;
            if (info) {
                setTransport(new BridgeTransport());
                setBridgeInfo(info);
            }
            setDetecting(false);
        });

        return () => { cancelled = true; };
    }, []);

    if (detecting) {
        return <><CssBaseline /><Splash /></>;
    }

    // Bridge mode, but the session cannot use it yet: set a password on a fresh bridge, or log in.
    if (bridgeInfo && (!bridgeInfo.claimed || !bridgeInfo.authenticated)) {
        return (
            <>
                <CssBaseline />
                <BridgeAuthView
                    claimed={bridgeInfo.claimed}
                    onAuthenticated={() => setBridgeInfo({ ...bridgeInfo, claimed: true, authenticated: true })}
                />
            </>
        );
    }

    return (
        <BLEProvider transport={transport ?? undefined}>
            <CssBaseline />
            <MainLayout bridge={transport} />
        </BLEProvider>
    );
}
