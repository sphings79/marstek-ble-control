import React, { useEffect, useState } from 'react';
import {
    Paper, Typography, Box, Switch, CircularProgress, List, ListItem, ListItemIcon, ListItemText
} from '@mui/material';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import LightModeIcon from '@mui/icons-material/LightMode';
import BoltIcon from '@mui/icons-material/Bolt';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import BluetoothIcon from '@mui/icons-material/Bluetooth';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { LedControlPayload } from '../../lib/payloads/LedControlPayload';
import { BackupPowerControlPayload } from "../../lib/payloads/BackupPowerControlPayload";
import { SurplusFeedInControlPayload } from "../../lib/payloads/SurplusFeedInControlPayload";
import { BluetoothControlPayload } from "../../lib/payloads/BluetoothControlPayload.ts";
import { COMMAND_ID } from "../../lib/VenusConst.ts";

interface Props {
    /**
     * Whether the device supports surplus feed-in at all. Venus E 3.0 does not: its Control FW
     * contains neither the `[BLE] Set val = %d, full_en = %d.` handler log nor the MQTT
     * `Set surplus electricity` counterpart, both of which Venus A and Venus D have. Without
     * this the row would render as "Not supported by the current FW version", which would
     * wrongly suggest a firmware update could enable it.
     */
    showSurplusFeedIn?: boolean;
}

export const TogglesWidget = ({ showSurplusFeedIn = true }: Props) => {
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);

    const [ledControlBusy, setLedControlBusy] = useState(false);
    const [backupPowerBusy, setBackupPowerBusy] = useState(false);
    const [surplusFeedInBusy, setSurplusFeedInBusy] = useState(false);
    const [bluetoothControlBusy, setBluetoothControlBusy] = useState(false);

    const hasState = !!stateData;

    const backupPowerOn = stateData?.attributes.BackupPower;

    const ledControlSupported = stateData?.attributes.LEDLight !== undefined;
    const ledOn = stateData?.attributes.LEDLight;

    const surplusFeedInSupported = stateData?.attributes.SurplusFeedIn !== undefined;
    const surplusFeedInOn = stateData?.attributes.SurplusFeedIn;

    const bluetoothControlSupported = stateData?.attributes.BluetoothEnabled !== undefined;
    const bluetoothEnabled = stateData?.attributes.BluetoothEnabled;

    useEffect(() => {
        if (stateData) {
            setBackupPowerBusy(false);
            setLedControlBusy(false);
            setSurplusFeedInBusy(false);
            setBluetoothControlBusy(false);
        }
    }, [stateData]);

    const handleBackupPowerToggle = async (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (!isConnected || backupPowerBusy) return;

        setBackupPowerBusy(true);
        try {
            const payload = new BackupPowerControlPayload(checked);
            await sendPacket(COMMAND_ID.BACKUP_POWER_CONTROL, payload.toBytes());

            pollState();
        } catch (err) {
            console.error("Failed to toggle Backup Power", err);
            setBackupPowerBusy(false);
        }
    };

    const handleLedToggle = async (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (!isConnected || ledControlBusy) return;

        setLedControlBusy(true);
        try {
            const payload = new LedControlPayload(checked);
            await sendPacket(COMMAND_ID.LED_CONTROL, payload.toBytes());

            pollState();
        } catch (err) {
            console.error("Failed to toggle LEDs", err);
            setLedControlBusy(false);
        }
    };

    const handleSurplusFeedInToggle = async (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (!isConnected || surplusFeedInBusy) return;

        setSurplusFeedInBusy(true);
        try {
            const payload = new SurplusFeedInControlPayload(checked);
            await sendPacket(COMMAND_ID.SURPLUS_FEED_IN_CONTROL, payload.toBytes());

            pollState();
        } catch (err) {
            console.error("Failed to toggle Surplus Feed-in", err);
            setSurplusFeedInBusy(false);
        }
    };

    const handleBluetoothControlToggle = async (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
        if (!isConnected || bluetoothControlBusy) {
            return;
        }

        setBluetoothControlBusy(true);
        try {
            const payload = new BluetoothControlPayload(checked);
            await sendPacket(COMMAND_ID.BLUETOOTH_CONTROL, payload.toBytes());

            pollState();
        } catch (err) {
            console.error("Failed to toggle Bluetooth state", err);
            setBluetoothControlBusy(false);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', userSelect: "none" }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'warning.main', color: 'warning.contrastText', display: 'flex', alignItems: 'center', gap: 1 }}>
                <ToggleOnIcon />
                <Typography variant="h6" fontWeight="bold">Toggles</Typography>
            </Box>

            <Box sx={{ flexGrow: 1 }}>
                {!hasState && isConnected ? (
                    <Box p={3} textAlign="center">
                        <CircularProgress size={24} />
                        <Typography variant="caption" display="block" mt={1}>Syncing...</Typography>
                    </Box>
                ) : (
                    <List sx={{ p: 0 }}>

                        <ListItem divider>
                            <ListItemIcon>
                                <BoltIcon color={backupPowerOn ? "warning" : "disabled"} />
                            </ListItemIcon>
                            <ListItemText
                                primary="Backup Power"
                                secondary="Controls the inbuilt power outlet"
                                sx={{ mr: 2 }}
                            />
                            <Switch
                                edge="end"
                                checked={!!backupPowerOn}
                                onChange={handleBackupPowerToggle}
                                disabled={!isConnected || backupPowerBusy}
                                color="warning"
                            />
                        </ListItem>

                        {showSurplusFeedIn && (
                            <ListItem divider>
                                <ListItemIcon>
                                    <CurrencyExchangeIcon color={surplusFeedInOn && surplusFeedInSupported ? "warning" : "disabled"} />
                                </ListItemIcon>
                                <ListItemText
                                    primary="Surplus Feed-in"
                                    secondary={!surplusFeedInSupported ? "Not supported by the current FW version" : "Feed excess solar energy back into the grid when the battery is full"}
                                    sx={{ mr: 2 }}
                                />
                                <Switch
                                    edge="end"
                                    checked={!!surplusFeedInOn}
                                    onChange={handleSurplusFeedInToggle}
                                    disabled={!isConnected || !surplusFeedInSupported || surplusFeedInBusy}
                                    color="warning"
                                />
                            </ListItem>
                        )}

                        <ListItem divider>
                            <ListItemIcon>
                                <LightModeIcon color={ledOn && ledControlSupported ? "warning" : "disabled"} />
                            </ListItemIcon>
                            <ListItemText
                                primary="LED Light"
                                secondary={!ledControlSupported ? "Not supported by the current FW version" : "Control the front panel indicators"}
                                sx={{ mr: 2 }}
                            />
                            <Switch
                                edge="end"
                                checked={ledOn}
                                onChange={handleLedToggle}
                                disabled={!isConnected || !ledControlSupported || ledControlBusy}
                                color="warning"
                            />
                        </ListItem>

                        <ListItem divider>
                            <ListItemIcon>
                                <BluetoothIcon color={bluetoothEnabled && bluetoothControlSupported ? "warning" : "disabled"} />
                            </ListItemIcon>
                            <ListItemText
                                primary="Bluetooth"
                                secondary={
                                    !bluetoothControlSupported ? 
                                        "Not supported by the current FW version" : 
                                        "Once disabled, to connect again, power-cycling the device will make it accessible via BLE again for 10 minutes."
                                }
                                sx={{ mr: 2 }}
                            />
                            <Switch
                                edge="end"
                                checked={bluetoothEnabled}
                                onChange={handleBluetoothControlToggle}
                                disabled={!isConnected || !bluetoothControlSupported || bluetoothControlBusy}
                                color="warning"
                            />
                        </ListItem>

                    </List>
                )}
            </Box>
        </Paper>
    );
};
