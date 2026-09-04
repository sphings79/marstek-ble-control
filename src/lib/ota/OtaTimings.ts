import { TransportKind } from '../transport/Transport';

/**
 * How long each step of the OTA handshake waits for its ACK, and how often it retries.
 *
 * Over a direct Bluetooth link these are the values the transfer was originally verified with.
 * Over the ESP32 bridge every ACK additionally crosses WiFi and the relay, so a stall that would
 * have been a blip locally can now exceed the direct-link budget. A firmware transfer that dies
 * halfway can leave a module unusable, so the bridge profile trades a slower failure for a much
 * smaller chance of aborting a healthy transfer. The higher numbers cost nothing while things are
 * going well - they only apply when something is already hanging.
 */
export interface OtaTimings {
    activateAckMs: number;
    discoverAckMs: number;
    discoverAttempts: number;
    discoverRetryGapMs: number;
    sizeAckMs: number;
    chunkAckMs: number;
    chunkRetries: number;
    finalizeAckMs: number;
}

const DIRECT: OtaTimings = {
    activateAckMs: 3_000,
    discoverAckMs: 2_000,
    discoverAttempts: 3,
    discoverRetryGapMs: 1_000,
    sizeAckMs: 5_000,
    chunkAckMs: 1_500,
    chunkRetries: 3,
    finalizeAckMs: 3_000,
};

const BRIDGE: OtaTimings = {
    activateAckMs: 8_000,
    discoverAckMs: 6_000,
    discoverAttempts: 4,
    discoverRetryGapMs: 1_000,
    sizeAckMs: 12_000,
    chunkAckMs: 5_000,
    chunkRetries: 5,
    finalizeAckMs: 10_000,
};

export function otaTimingsFor(kind: TransportKind): OtaTimings {
    return kind === TransportKind.BRIDGE ? BRIDGE : DIRECT;
}
