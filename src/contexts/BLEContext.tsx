import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BLEConnectionManager, ConnectionState } from '../lib/BLEConnectionManager';
import type { Transport } from '../lib/transport/Transport';
import {type DeviceInfo, parseDeviceName} from '../lib/DeviceUtils';
import { VenusPacket } from '../lib/VenusPacket';
import {VenusRegistry} from "../lib/payloads/VenusPayloads.ts";
import type {VenusData, VenusPayloadStatic} from "../lib/payloads/VenusPayloads.ts";
import {COMMAND_ID} from "../lib/VenusConst.ts";

interface BLEContextType {
    manager: BLEConnectionManager;
    connectionState: ConnectionState;
    deviceInfo: DeviceInfo | null;
    rssi: number | null;
    error: string | null;

    connect: () => void;
    reconnect: () => void;
    disconnect: () => void;
    sendPacket: (cmd: COMMAND_ID, payload?: Uint8Array) => Promise<void>;
    pollState: () => void;
}

const BLEContext = createContext<BLEContextType | null>(null);

/**
 * `transport` is chosen once, before the provider mounts: Web Bluetooth when the app is served
 * from the hosted site, the WebSocket bridge when it is served by an ESP32. Leaving it out keeps
 * the Web Bluetooth default.
 */
export const BLEProvider = ({ transport, children }: { transport?: Transport; children: React.ReactNode }) => {
    const managerRef = useRef<BLEConnectionManager | null>(null);
    if (!managerRef.current) {
        managerRef.current = new BLEConnectionManager(transport);
    }

    const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [rssi, setRssi] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const mgr = managerRef.current!;

        mgr.onStateChange = (state, msg) => {
            setConnectionState(state);

            if (state === ConnectionState.ERROR && msg) {
                setError(msg);
            }

            if (state === ConnectionState.CONNECTED) {
                setDeviceInfo(parseDeviceName(mgr.deviceName || "Unknown"));
            }
        };

        mgr.onRSSI = (val) => setRssi(val);

        return () => mgr.disconnect();
    }, []);

    const connect = () => {
        setError(null);
        managerRef.current!.scanAndConnect();
    };

    const reconnect = () => {
        setError(null);
        managerRef.current!.reconnect();
    };

    const disconnect = () => {
        managerRef.current!.disconnect();
    };

    const sendPacket = (cmd: COMMAND_ID, p?: Uint8Array) => {
        return managerRef.current!.sendPacket(cmd, p);
    };

    const pollState = () => {
        managerRef.current!.pollState();
    }

    return (
        <BLEContext.Provider value={{
            manager: managerRef.current!,
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

export const useBLE = () => {
    const context = useContext(BLEContext);
    if (!context) {
        throw new Error("useBLE must be used within BLEProvider");
    }
    return context;
};

export function useVenusData<ID extends keyof typeof VenusRegistry>(
    commandId: ID,
): VenusData<ID> | null {
    const { manager } = useBLE();
    const [data, setData] = useState<VenusData<ID> | null>(null);

    useEffect(() => {
        const handler = (packet: VenusPacket) => {
            if (packet.commandId === commandId) {
                try {
                    const PayloadClass = VenusRegistry[commandId] as unknown as VenusPayloadStatic<VenusData<ID>>;
                    const parsed = PayloadClass.FROM_BYTES(packet.payload);
                    setData(parsed);
                } catch (err) {
                    console.warn(`Failed to parse payload for cmd 0x${commandId.toString(16)}`, err);
                }
            }
        };

        manager.subscribe(commandId, handler);
        return () => manager.unsubscribe(commandId, handler);
    }, [manager, commandId]);

    return data;
}
