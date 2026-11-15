import { useEffect, useState } from 'react';
import { Box, Alert, CssBaseline, CircularProgress, Typography } from '@mui/material';
import { useBLE } from './contexts/BLEContext';
import { BLEProvider } from './contexts/BLEProvider';

import { ScannerView } from './components/ScannerView';
import { DeviceTopBar } from './components/DeviceTopBar';
import { WifiRssiContext } from './components/WifiRssiContext';
import { Footer } from './components/Footer';
import { VenusAView } from './components/views/VenusAView';
import { VenusDView } from './components/views/VenusDView';
import { VenusEView } from './components/views/VenusEView';
import { VenusE12View } from './components/views/VenusE12View';
import { GenericDeviceView } from './components/views/GenericDeviceView';
import { BridgeAuthView } from './components/bridge/BridgeAuthView';
import { BridgeScannerView } from './components/bridge/BridgeScannerView';
import { probeBridge, BRIDGE_PROTOCOL_VERSION, type BridgeInfo } from './lib/bridge/BridgeApi';
import { BridgeSocket } from './lib/bridge/BridgeSocket';
import { BridgeTransport } from './lib/transport/BridgeTransport';
import { BridgeSlotBar } from './components/bridge/BridgeSlotBar';
import { BridgeFirmwareCard } from './components/bridge/BridgeFirmwareCard';
import { BridgeCard } from './components/bridge/BridgeCard';
import UpdateIcon from '@mui/icons-material/SystemUpdateAlt';
import { useT } from './i18n/i18n';

const MainLayout = ({ bridge }: { bridge: BridgeSocket | null }) => {
    const [wifiRssi, setWifiRssi] = useState<number | null>(null);

    useEffect(() => bridge?.onWifiRssi(setWifiRssi), [bridge]);

    const {
        connectionState,
        deviceInfo,
        rssi,
        error,
        connect,
        reconnect,
        disconnect,
        slots,
        activeSlot,
    } = useBLE();

    if (!deviceInfo) {
        return bridge
            ? (
                <BridgeScannerView
                    bridge={bridge}
                    slot={activeSlot}
                    bound={slots[activeSlot]?.name}
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
        <WifiRssiContext.Provider value={wifiRssi}>
        <Box sx={{ minHeight: '100vh', bgcolor: '#f4f6f8', display: 'flex', flexDirection: 'column' }}>
            <DeviceTopBar
                deviceInfo={deviceInfo}
                status={connectionState}
                rssi={rssi}
                onDisconnect={disconnect}
                onReconnect={reconnect}
            />

            {bridge && (
                <Box sx={{ px: { xs: 1, md: 3 }, py: 1, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
                    <BridgeSlotBar />
                </Box>
            )}

            {error && <Alert severity="error" sx={{ borderRadius: 0 }}>{error}</Alert>}

            {/* Keyed by slot so a switch remounts the views: widgets keep their last value in
                state, and another storage's numbers must not linger until the next poll. */}
            <Box key={activeSlot} sx={{ display: 'contents' }}>
            {deviceInfo.modelName === "Venus A" ? (
                <VenusAView />
            ) : deviceInfo.modelName === "Venus D" ? (
                <VenusDView />
            ) : deviceInfo.modelName === "Venus E 3.0" ? (
                <VenusEView />
            ) : deviceInfo.modelName === "Venus E 1/2" ? (
                <VenusE12View />
            ) : (
                <GenericDeviceView />
            )}
            </Box>

            {/* On mobile the hamburger menu already carries the project links, so the page footer
                is only shown from md up to avoid duplicating them. */}
            <Box sx={{ mt: 'auto', display: { xs: 'none', md: 'block' } }}>
                <Footer />
            </Box>
        </Box>
        </WifiRssiContext.Provider>
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
    const t = useT();
    const [bridgeInfo, setBridgeInfo] = useState<BridgeInfo | null>(null);
    const [detecting, setDetecting] = useState(true);
    const [bridge, setBridge] = useState<{ socket: BridgeSocket; transports: BridgeTransport[] } | null>(null);

    useEffect(() => {
        let cancelled = false;

        void probeBridge().then(info => {
            if (cancelled) return;
            if (info) {
                const socket = new BridgeSocket(info.slots);
                setBridge({
                    socket,
                    transports: Array.from({ length: info.slots }, (_, slot) => new BridgeTransport(slot, socket)),
                });
                setBridgeInfo(info);
            }
            setDetecting(false);
        });

        return () => { cancelled = true; };
    }, []);

    if (detecting) {
        return <><CssBaseline /><Splash /></>;
    }

    // An older bridge speaks a protocol this build does not. Say so rather than misbehave - and
    // keep the update card reachable, since installing the matching release is the way out. It
    // only needs the bridge's HTTP endpoints, so it works without the BLE context.
    if (bridgeInfo && !(bridgeInfo.version >= BRIDGE_PROTOCOL_VERSION)) {
        if (!bridgeInfo.claimed || !bridgeInfo.authenticated) {
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
            <>
                <CssBaseline />
                <BridgeCard
                    icon={<UpdateIcon sx={{ fontSize: 60, color: 'warning.main' }} />}
                    title={t('bridgeOld.title')}
                    description={t('bridgeOld.desc')}
                    below={<BridgeFirmwareCard />}
                >
                    {null}
                </BridgeCard>
            </>
        );
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
        <BLEProvider bridge={bridge ?? undefined}>
            <CssBaseline />
            <MainLayout bridge={bridge?.socket ?? null} />
        </BLEProvider>
    );
}
