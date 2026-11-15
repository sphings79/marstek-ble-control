import { BRIDGE_PROTOCOL_VERSION } from './BridgeApi';

/**
 * Pure helpers for the bridge wire protocol (version 2). No browser APIs in here, so they can be
 * tested without a socket.
 */

/** One storage bound to a slot, as announced by the bridge. */
export interface SlotBinding {
    name: string;
    address: string;
}

/** Write kind, encoded as the second byte of every outbound binary frame. */
export const WRITE_WITHOUT_RESPONSE = 0x00;
export const WRITE_WITH_RESPONSE = 0x01;

/** Whether a bridge speaking this version can be used by this build. Older ones are not supported. */
export function isSupportedVersion(version: unknown): boolean {
    return typeof version === 'number' && version >= BRIDGE_PROTOCOL_VERSION;
}

/** Outbound binary frame: [slot, write kind, ...device bytes]. */
export function encodeWriteFrame(slot: number, bytes: Uint8Array, withResponse: boolean): Uint8Array {
    const frame = new Uint8Array(bytes.length + 2);
    frame[0] = slot;
    frame[1] = withResponse ? WRITE_WITH_RESPONSE : WRITE_WITHOUT_RESPONSE;
    frame.set(bytes, 2);
    return frame;
}

/** Inbound binary frame: [slot, ...exactly one notification]. Null for a frame without a slot byte. */
export function decodeNotifyFrame(data: ArrayBuffer): { slot: number; payload: Uint8Array } | null {
    const bytes = new Uint8Array(data);
    if (bytes.length < 1) return null;
    return { slot: bytes[0], payload: bytes.slice(1) };
}

/** Parse the slot list of a `hello`. Null when the message is not a usable v2 hello. */
export function parseHello(msg: Record<string, unknown>): { version: number; slots: (SlotBinding | null)[] } | null {
    if (typeof msg.version !== 'number') return null;
    const raw = Array.isArray(msg.slots) ? msg.slots : [];

    const slots = raw.map((entry): SlotBinding | null => {
        if (!entry || typeof entry !== 'object') return null;
        const { name, address } = entry as { name?: unknown; address?: unknown };
        if (typeof address !== 'string' || address === '') return null;
        return { name: typeof name === 'string' ? name : '', address };
    });

    return { version: msg.version, slots };
}
