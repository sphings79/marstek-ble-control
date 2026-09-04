/**
 * Connection lifecycle shared by BLEConnectionManager and every Transport implementation.
 *
 * Lives in its own module so a Transport can reference it without importing
 * BLEConnectionManager, which imports Transport in turn. BLEConnectionManager re-exports it, so
 * existing `import { ConnectionState } from '../lib/BLEConnectionManager'` call sites keep working.
 */
export const ConnectionState = Object.freeze({
    IDLE: "IDLE",
    SCANNING: "SCANNING",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    DISCONNECTED: "DISCONNECTED",
    ERROR: "ERROR"
});
export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];
