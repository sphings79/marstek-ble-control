import React, { useCallback, useEffect, useState } from 'react';
import { BLEConnectionManager, ConnectionState } from '../lib/BLEConnectionManager';
import { TransportKind, type Transport } from '../lib/transport/Transport';
import type { BridgeTransport } from '../lib/transport/BridgeTransport';
import type { BridgeSocket } from '../lib/bridge/BridgeSocket';
import { parseDeviceName, type DeviceInfo } from '../lib/DeviceUtils';
import { COMMAND_ID } from '../lib/VenusConst.ts';
import { BLEContext, type SlotInfo } from './BLEContext';

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

const ACTIVE_SLOT_KEY = 'bridgeActiveSlot';

const loadActiveSlot = (count: number): number => {
    try {
        const stored = Number(localStorage.getItem(ACTIVE_SLOT_KEY));
        if (Number.isInteger(stored) && stored >= 0 && stored < count) return stored;
    } catch {
        // Storage refused; start on the first slot.
    }
    return 0;
};

const saveActiveSlot = (slot: number) => {
    try {
        localStorage.setItem(ACTIVE_SLOT_KEY, String(slot));
    } catch {
        // Not worth failing over.
    }
};

const replaceAt = <T,>(list: T[], index: number, value: T): T[] =>
    list.map((entry, i) => (i === index ? value : entry));

/**
 * `transport` is chosen once, before the provider mounts: Web Bluetooth when the app is served
 * from the hosted site. Leaving it out keeps the Web Bluetooth default.
 *
 * In bridge mode `bridge` carries the shared socket and one transport per slot instead. Each slot
 * gets its own manager and connection state; the context exposes the ACTIVE slot's, so every view
 * and widget keeps using useBLE() as if there were a single storage.
 */
export const BLEProvider = ({ transport, bridge, children }: {
    transport?: Transport;
    bridge?: { socket: BridgeSocket; transports: BridgeTransport[] };
    children: React.ReactNode;
}) => {
    const viaBridge = !!bridge || transport?.kind === TransportKind.BRIDGE;

    const slotTransports: Transport[] | undefined = bridge?.transports;
    const slotCount = slotTransports?.length ?? 1;
    const managerList = slotTransports ? slotTransports.map(managerFor) : [managerFor(transport)];

    const [activeSlot, setActiveSlotState] = useState(() => loadActiveSlot(slotCount));
    const manager = managerList[activeSlot] ?? managerList[0];

    const [states, setStates] = useState<ConnectionState[]>(() => managerList.map(() => ConnectionState.IDLE));
    const [deviceInfos, setDeviceInfos] = useState<(DeviceInfo | null)[]>(() => managerList.map(() => null));
    const [rssis, setRssis] = useState<(number | null)[]>(() => managerList.map(() => null));
    const [errors, setErrors] = useState<(string | null)[]>(() => managerList.map(() => null));
    // Bumped whenever the bridge reports a binding change, so the slot list is recomputed.
    const [, setBindingsVersion] = useState(0);
    // Bumped when any slot enters or leaves a firmware transfer; the flag itself is read from the managers.
    const [, setOtaVersion] = useState(0);
    const otaRunning = managerList.some(m => m.isOtaRunning);

    useEffect(() => bridge?.socket.onSlotsChange(() => setBindingsVersion(v => v + 1)), [bridge]);

    // The latest active slot, readable from the manager callbacks without re-attaching them.
    const activeRef = React.useRef(activeSlot);
    useEffect(() => { activeRef.current = activeSlot; }, [activeSlot]);

    useEffect(() => {
        const list = slotTransports ? slotTransports.map(managerFor) : [managerFor(transport)];

        list.forEach((slotManager, index) => {
            slotManager.onStateChange = (state, msg) => {
                setStates(prev => replaceAt(prev, index, state));

                if (state === ConnectionState.ERROR && msg) {
                    setErrors(prev => replaceAt(prev, index, msg));
                }

                if (state === ConnectionState.CONNECTED) {
                    // An earlier failed attempt must not keep its message on a slot that is now up.
                    setErrors(prev => replaceAt(prev, index, null));
                    setDeviceInfos(prev => replaceAt(prev, index, parseDeviceName(slotManager.deviceName || "Unknown")));
                    // A slot that connects in the background only holds its link. The manager
                    // starts polling right after this callback, and a suspended one declines.
                    if (index !== activeRef.current) slotManager.suspendPolling();
                }

                if (state === ConnectionState.IDLE) {
                    setDeviceInfos(prev => replaceAt(prev, index, null));
                }
            };
            slotManager.onOtaChange = () => setOtaVersion(v => v + 1);
            slotManager.onRSSI = (value) => setRssis(prev => replaceAt(prev, index, value));
        });

        return () => list.forEach(slotManager => slotManager.disconnect());
    }, [slotTransports, transport]);

    // Only the active slot polls. Switching never disconnects: the old slot just stops asking,
    // the new one asks right away (resumePolling polls at once, and does nothing while offline).
    const setActiveSlot = useCallback((slot: number) => {
        const list = slotTransports ? slotTransports.map(managerFor) : [];
        if (list.some(m => m.isOtaRunning)) return;
        if (slot === activeRef.current || slot < 0 || slot >= slotCount) return;

        list[activeRef.current]?.suspendPolling();
        list[slot]?.resumePolling();

        activeRef.current = slot;
        setActiveSlotState(slot);
        saveActiveSlot(slot);
    }, [slotTransports, slotCount]);

    const unbindSlot = (slot: number) => {
        const target = managerList[slot];
        if (!bridge || !target || managerList.some(m => m.isOtaRunning)) return;

        target.disconnect();
        setDeviceInfos(prev => replaceAt(prev, slot, null));
        setErrors(prev => replaceAt(prev, slot, null));
        void bridge.socket.unbind(slot).catch((err: Error) => {
            setErrors(prev => replaceAt(prev, slot, err.message));
        });
    };

    const setActiveError = (message: string) => {
        setStates(prev => replaceAt(prev, activeSlot, ConnectionState.ERROR));
        setErrors(prev => replaceAt(prev, activeSlot, message));
    };

    // Both of these are async underneath, and neither used to be awaited or caught: a rejected
    // promise vanished into an unhandled rejection, so a press of connect that failed before it
    // reached the bridge looked exactly like a press that had not registered at all.
    const connect = () => {
        setErrors(prev => replaceAt(prev, activeSlot, null));
        void manager.scanAndConnect().catch((err: Error) => setActiveError(err.message));
    };

    const reconnect = () => {
        setErrors(prev => replaceAt(prev, activeSlot, null));
        void manager.reconnect().catch((err: Error) => setActiveError(err.message));
    };

    const disconnect = () => {
        manager.disconnect();
    };

    const sendPacket = useCallback((cmd: COMMAND_ID, p?: Uint8Array) => {
        return manager.sendPacket(cmd, p);
    }, [manager]);

    const pollState = () => {
        manager.pollState();
    };

    const slots: SlotInfo[] = bridge
        ? bridge.socket.slots.map((binding, index) => ({
            index,
            name: binding?.name || undefined,
            address: binding?.address,
            state: states[index] ?? ConnectionState.IDLE,
        }))
        : [];

    return (
        <BLEContext.Provider value={{
            manager,
            viaBridge,
            connectionState: states[activeSlot] ?? ConnectionState.IDLE,
            deviceInfo: deviceInfos[activeSlot] ?? null,
            rssi: rssis[activeSlot] ?? null,
            error: errors[activeSlot] ?? null,
            connect,
            reconnect,
            disconnect,
            sendPacket,
            pollState,
            slots,
            activeSlot,
            otaRunning,
            setActiveSlot,
            unbindSlot,
        }}>
            {children}
        </BLEContext.Provider>
    );
};
