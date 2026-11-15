import { createContext, useContext, useEffect, useState } from 'react';
import type { BLEConnectionManager, ConnectionState } from '../lib/BLEConnectionManager';
import type { DeviceInfo } from '../lib/DeviceUtils';
import { VenusPacket } from '../lib/VenusPacket';
import {VenusRegistry} from "../lib/payloads/VenusPayloads.ts";
import type {VenusData, VenusPayloadStatic} from "../lib/payloads/VenusPayloads.ts";
import {COMMAND_ID} from "../lib/VenusConst.ts";

/** One storage slot of the bridge, as the slot selector shows it. */
export interface SlotInfo {
    index: number;
    /** Advertised name of the bound storage, if one is bound. */
    name?: string;
    address?: string;
    state: ConnectionState;
}

export interface BLEContextType {
    manager: BLEConnectionManager;
    /** True when this session reaches the storage through an ESP32 bridge. */
    viaBridge: boolean;
    connectionState: ConnectionState;
    deviceInfo: DeviceInfo | null;
    rssi: number | null;
    error: string | null;

    connect: () => void;
    reconnect: () => void;
    disconnect: () => void;
    sendPacket: (cmd: COMMAND_ID, payload?: Uint8Array) => Promise<void>;
    pollState: () => void;

    /** Bridge only: every slot, with its binding and connection state. Empty over Web Bluetooth. */
    slots: SlotInfo[];
    /** The slot every other value in this context belongs to. Always 0 over Web Bluetooth. */
    activeSlot: number;
    setActiveSlot: (slot: number) => void;
    /** Bridge only: disconnect a slot and remove its device from it. */
    unbindSlot: (slot: number) => void;
}

export const BLEContext = createContext<BLEContextType | null>(null);

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
