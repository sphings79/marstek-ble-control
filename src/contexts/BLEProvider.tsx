import React, { useEffect, useState } from 'react';
import { BLEConnectionManager, ConnectionState } from '../lib/BLEConnectionManager';
import { TransportKind, type Transport } from '../lib/transport/Transport';
import { parseDeviceName, type DeviceInfo } from '../lib/DeviceUtils';
import { COMMAND_ID } from '../lib/VenusConst.ts';
import { BLEContext } from './BLEContext';

// One manager per transport, for the life of the page. Looked up rather than kept in a ref so
// rendering never has to read a ref, and so StrictMode's double render cannot build a second
// manager that would take over the transport's callbacks.
const managers = new WeakMap<Transport, BLEConnectionManager>();
let defaultManager: BLEConnectionManager | null = null;

const managerFor = (transport?: Transport): BLEConnectionManager => {
    if (!transport) {
        return (defaultManager ??= new BLEConnectionManager());
    }
    let manager = managers.get(transport);
    if (!manager) {
        manager = new BLEConnectionManager(transport);
        managers.set(transport, manager);
    }
    return manager;
};

// Hooks the provider's state up to the manager's callbacks and undoes it on unmount. Kept out of
// the component because assigning to the manager is wiring to an external object, not state.
const attach = (
    manager: BLEConnectionManager,
    handlers: { onState: (state: ConnectionState, msg?: string) => void; onRssi: (rssi: number) => void },
) => {
    manager.onStateChange = handlers.onState;
    manager.onRSSI = handlers.onRssi;
    return () => manager.disconnect();
};

/**
 * `transport` is chosen once, before the provider mounts: Web Bluetooth when the app is served
 * from the hosted site, the WebSocket bridge when it is served by an ESP32. Leaving it out keeps
 * the Web Bluetooth default.
 */
export const BLEProvider = ({ transport, children }: { transport?: Transport; children: React.ReactNode }) => {
    const manager = managerFor(transport);

    // From the prop rather than the manager: it says the same thing.
    const viaBridge = transport?.kind === TransportKind.BRIDGE;

    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [rssi, setRssi] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => attach(manager, {
        onState: (state, msg) => {
            setConnectionState(state);

            if (state === ConnectionState.ERROR && msg) {
                setError(msg);
            }

            if (state === ConnectionState.CONNECTED) {
                setDeviceInfo(parseDeviceName(manager.deviceName || "Unknown"));
            }
        },
        onRssi: setRssi,
    }), [manager]);

    // Both of these are async underneath, and neither used to be awaited or caught: a rejected
    // promise vanished into an unhandled rejection, so a press of connect that failed before it
    // reached the bridge looked exactly like a press that had not registered at all. Which is
    // what it was mistaken for.
    const connect = () => {
        setError(null);
        void manager.scanAndConnect().catch((err: Error) => {
            setConnectionState(ConnectionState.ERROR);
            setError(err.message);
        });
    };

    const reconnect = () => {
        setError(null);
        void manager.reconnect().catch((err: Error) => {
            setConnectionState(ConnectionState.ERROR);
            setError(err.message);
        });
    };

    const disconnect = () => {
        manager.disconnect();
    };

    const sendPacket = (cmd: COMMAND_ID, p?: Uint8Array) => {
        return manager.sendPacket(cmd, p);
    };

    const pollState = () => {
        manager.pollState();
    }

    return (
        <BLEContext.Provider value={{
            manager,
            viaBridge,
            connectionState,
            deviceInfo,
            rssi,
            error,
            connect,
            reconnect,
            disconnect,
            sendPacket,
            pollState
        }}>
            {children}
        </BLEContext.Provider>
    );
};
