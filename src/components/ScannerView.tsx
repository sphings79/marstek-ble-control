import {
    Box, Button, Typography, Paper, CircularProgress, Alert, Fade, Stack
} from '@mui/material';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import BluetoothSearchingIcon from '@mui/icons-material/BluetoothSearching';
import BluetoothConnectedIcon from '@mui/icons-material/BluetoothConnected';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BrowserNotSupportedIcon from '@mui/icons-material/BrowserNotSupported';

import { ConnectionState } from '../lib/BLEConnectionManager';
import { Footer } from './Footer';
import { useT } from '../i18n/I18nContext';

interface Props {
    onScan: () => void;
    status: ConnectionState;
    error: string | null;
}

export const ScannerView = ({ onScan, status, error }: Props) => {
    const t = useT();
    const isBluetoothSupported = typeof window !== 'undefined' && 'bluetooth' in navigator;

    const isScanning = status === ConnectionState.SCANNING;
    const isConnecting = status === ConnectionState.CONNECTING;
    const isBusy = isScanning || isConnecting;

    const getStateConfig = () => {
        if (!isBluetoothSupported) {
            return {
                icon: <BrowserNotSupportedIcon sx={{ fontSize: 60, color: 'text.disabled' }} />,
                title: t('scanner.unsupported.title'),
                desc: t('scanner.unsupported.desc'),
                btnText: t('scanner.unsupported.btn'),
            };
        }

        if (error) return {
            icon: <ErrorOutlineIcon sx={{ fontSize: 60, color: 'error.main' }} />,
            title: t('scanner.failed.title'),
            desc: t('scanner.failed.desc'),
            btnText: t('scanner.failed.btn'),
        };

        switch (status) {
            case ConnectionState.SCANNING:
                return {
                    icon: <BluetoothSearchingIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
                    title: t('scanner.scanning.title'),
                    desc: t('scanner.scanning.desc'),
                    btnText: t('scanner.scanning.btn'),
                };
            case ConnectionState.CONNECTING:
                return {
                    icon: <BluetoothConnectedIcon sx={{ fontSize: 60, color: 'warning.main' }} />,
                    title: t('scanner.connecting.title'),
                    desc: t('scanner.connecting.desc'),
                    btnText: t('scanner.connecting.btn'),
                };
            default:
                return {
                    icon: <BluetoothIcon sx={{ fontSize: 60, color: 'primary.main' }} />,
                    title: t('scanner.idle.title'),
                    desc: t('scanner.idle.desc'),
                    btnText: t('scanner.idle.btn'),
                };
        }
    };

    const config = getStateConfig();

    return (
        <Box
            display="flex"
            flexDirection="column"
            minHeight="100vh"
            bgcolor="#f4f6f8"
        >
            <Box
                flexGrow={1}
                display="flex"
                justifyContent="center"
                alignItems="center"
                p={2}
            >
            <Paper
                elevation={4}
                sx={{
                    p: 5,
                    textAlign: 'center',
                    borderRadius: 4,
                    maxWidth: 450,
                    width: '100%',
                    mx: 2
                }}
            >
                <Box
                    position="relative"
                    display="inline-flex"
                    mb={3}
                    sx={{
                        '&::after': isBusy ? {
                            content: '""',
                            position: 'absolute',
                            top: -10, left: -10, right: -10, bottom: -10,
                            border: '2px solid',
                            borderColor: isScanning ? 'primary.light' : 'warning.light',
                            borderRadius: '50%',
                            animation: 'ripple 1.5s infinite ease-out',
                        } : {},
                        '@keyframes ripple': {
                            '0%': { transform: 'scale(0.8)', opacity: 1 },
                            '100%': { transform: 'scale(1.5)', opacity: 0 },
                        }
                    }}
                >
                    {isBusy && (
                        <CircularProgress
                            size={76}
                            sx={{
                                position: 'absolute',
                                top: -8,
                                left: -8,
                                color: isScanning ? 'primary.main' : 'warning.main'
                            }}
                        />
                    )}
                    {config.icon}
                </Box>

                <Typography variant="h4" fontWeight="bold" gutterBottom>
                    {config.title}
                </Typography>

                <Typography color="text.secondary" sx={{ mb: 4, minHeight: '48px' }}>
                    {config.desc}
                </Typography>
                
                {error && (
                    <Fade in={!!error}>
                        <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                            {error}
                        </Alert>
                    </Fade>
                )}

                {!isBluetoothSupported && (
                    <Box sx={{ mb: 3 }}>
                        <img
                            src="/webbluetooth.png"
                            style={{
                                width: '100%',
                                borderRadius: '8px',
                                border: '1px solid #e0e0e0'
                            }}
                        />
                    </Box>
                )}

                {
                    isBluetoothSupported &&
                    <Stack spacing={2}>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={onScan}
                            disabled={isBusy}
                            fullWidth
                            sx={{
                                py: 1.5,
                                fontWeight: 'bold',
                                textTransform: 'none',
                                fontSize: '1.1rem'
                            }}
                        >
                            {config.btnText}
                        </Button>
                    </Stack>
                }
            </Paper>
            </Box>

            <Footer />
        </Box>
    );
};
