/**
 * OTA frame encode/decode.
 *
 * OTA uses a DIFFERENT frame shape than the regular VenusPacket format (see ../VenusPacket.ts):
 *
 *   Normal HM frame:       [0x73] [LEN]        [0x23] [CMD] [PAYLOAD...] [CHECKSUM]
 *   Transition HM frame:   [0x73] [LEN_HI] [LEN_LO] [0x23] [CMD] [PAYLOAD...] [CHECKSUM]
 *   OTA frame:             [0x73] [LEN_HI] [LEN_LO] [CMD] [PAYLOAD...] [CHECKSUM]
 *
 * All three start with the same magic byte (0x73) and end with an XOR checksum over every
 * preceding byte, but differ in where (or whether) the 0x23 marker and the command byte sit.
 * The device apparently only uses "transition HM" framing for one specific legacy exchange
 * (the 0x10 OTA-activation ack, which replies with cmd=0x00) - everything else during OTA
 * (0x3A discovery, 0x50 size, 0x51 data chunks, 0x52 finalize) uses the plain OTA frame shape.
 *
 * Ported byte-for-byte from the sibling "Marstek Venus Monitor" project's js/ble-protocol.js
 * (buildOtaFrame / buildTransitionHMFrame / buildSizeFrame / buildDataFrame / buildFinishFrame /
 * handleUnifiedNotification's frame-shape discriminator), which was reverse-engineered from
 * real Wireshark captures and confirmed working for Control/EMS and BMS firmware updates.
 */

export function xorChecksum(bytes: Uint8Array | number[]): number {
    let cs = 0;
    for (const b of bytes) cs ^= b;
    return cs & 0xFF;
}

function u32le(n: number): Uint8Array {
    return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
}

/** Build a plain OTA frame: [0x73][LEN_HI][LEN_LO][CMD][PAYLOAD...][CHECKSUM] (no 0x23 marker). */
export function buildOtaFrame(cmdByte: number, payload: Uint8Array): Uint8Array {
    const len = 5 + payload.length;
    const frame = new Uint8Array(len);
    frame[0] = 0x73;
    frame[1] = (len >>> 8) & 0xFF;
    frame[2] = len & 0xFF;
    frame[3] = cmdByte;
    frame.set(payload, 4);
    frame[len - 1] = xorChecksum(frame.subarray(0, len - 1));
    return frame;
}

/** Build a "transition HM" frame: [0x73][LEN_HI][LEN_LO][0x23][CMD][PAYLOAD...][CHECKSUM]. */
export function buildTransitionHmFrame(command: number, payload: number[] = []): Uint8Array {
    const len = 6 + payload.length;
    const frame = new Uint8Array(len);
    frame[0] = 0x73;
    frame[1] = (len >>> 8) & 0xFF;
    frame[2] = len & 0xFF;
    frame[3] = 0x23;
    frame[4] = command;
    frame.set(payload, 5);
    frame[len - 1] = xorChecksum(frame.subarray(0, len - 1));
    return frame;
}

/** cmd 0x50 - firmware size + checksum, sent once before the chunk loop. */
export function buildSizeFrame(sizeBytes: number, checksum: number): Uint8Array {
    const payload = new Uint8Array(9);
    payload[0] = 0x10; // Direction: host->device
    payload.set(u32le(sizeBytes), 1);
    payload.set(u32le(checksum >>> 0), 5);
    return buildOtaFrame(0x50, payload);
}

/** cmd 0x51 - one 128-byte firmware chunk. Shorter final chunks are zero-padded to 128 bytes. */
export function buildDataFrame(offset: number, chunk: Uint8Array): Uint8Array {
    const payload = new Uint8Array(1 + 4 + 128); // DIR + OFFSET + DATA, always fixed 128B data
    payload[0] = 0x10; // Direction: host->device
    payload.set(u32le(offset), 1);
    payload.set(chunk, 5);
    return buildOtaFrame(0x51, payload);
}

/** cmd 0x52 - finalize/validate. */
export function buildFinishFrame(): Uint8Array {
    return buildOtaFrame(0x52, new Uint8Array([0x10]));
}

export interface DecodedFrame {
    frameType: 'normalHM' | 'transitionHM' | 'ota';
    cmd: number;
    payload: Uint8Array;
    checksumValid: boolean;
}

/**
 * Decode any incoming 0x73-prefixed frame, picking the right shape based on where (if
 * anywhere) the 0x23 marker sits - mirrors handleUnifiedNotification()'s exact discriminator
 * from the reference implementation: `value[2] === 0x23 || value[3] === 0x23`.
 */
export function decodeIncomingFrame(bytes: Uint8Array): DecodedFrame | null {
    if (bytes.length < 6 || bytes[0] !== 0x73) {
        return null;
    }

    const isNormalHM = bytes[2] === 0x23;
    const isTransitionHM = !isNormalHM && bytes[3] === 0x23;

    let cmd: number;
    let payload: Uint8Array;
    let declaredLength: number;

    if (isNormalHM) {
        declaredLength = bytes[1];
        cmd = bytes[3];
        payload = bytes.slice(4, -1);
    } else if (isTransitionHM) {
        declaredLength = (bytes[1] << 8) | bytes[2];
        cmd = bytes[4];
        payload = bytes.slice(5, -1);
    } else {
        // Plain OTA frame
        declaredLength = (bytes[1] << 8) | bytes[2];
        cmd = bytes[3];
        payload = bytes.slice(4, -1);
    }

    if (declaredLength !== bytes.length) {
        return null;
    }

    const checksum = bytes[bytes.length - 1];
    const checksumValid = xorChecksum(bytes.subarray(0, bytes.length - 1)) === checksum;

    return {
        frameType: isNormalHM ? 'normalHM' : isTransitionHM ? 'transitionHM' : 'ota',
        cmd,
        payload,
        checksumValid,
    };
}
