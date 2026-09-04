/**
 * Firmware analysis for OTA safety checks: which product model (Venus D/E/A/...) and which
 * physical MCU component (Control/EMS, MPPT, BMS, Micro-Inverter) a selected .bin file targets,
 * plus the checksum the device's bootloader expects.
 *
 * Ported from the sibling "Marstek Venus Monitor" project's js/ble-protocol.js. See that
 * project's VENUS_D_OTA_ADAPTATION.md for the full research trail (Ghidra decompilation of
 * Control FW 149.2's BLE_Cmd_OTA_Validate / OTA_Flash_Prepare_ByTarget, and content-signature
 * verification against 6 real Venus D + 4 real Venus E 3.0 firmware files).
 */

export type VenusModel = 'Venus A' | 'Venus D' | 'Venus E 3.0' | 'Unknown';

export interface ModelGuess {
    model: VenusModel;
    reason: string;
}

/** Ones' complement 32-bit sum, as expected by the Marstek bootloader. */
export function computeFirmwareChecksum(bytes: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < bytes.length; i++) {
        sum += bytes[i];
    }
    sum = sum >>> 0;
    return (~sum) >>> 0;
}

function findAsciiSignature(bytes: Uint8Array, asciiStr: string): number {
    const sig = Array.from(asciiStr).map(c => c.charCodeAt(0));
    for (let i = 0; i <= bytes.length - sig.length; i++) {
        let match = true;
        for (let j = 0; j < sig.length; j++) {
            if (bytes[i + j] !== sig[j]) { match = false; break; }
        }
        if (match) return i;
    }
    return -1;
}

/**
 * Content signature tags, in the order they are probed. Marstek embeds a short ASCII
 * model-family tag in every firmware component: the Control firmware carries its own type
 * string ("VNSA-0", "VNSD-0", "VNSEE3-0") at ~0x18xx, BMS/Micro carry a single tag near the
 * end of the image.
 */
const MODEL_SIGNATURES: readonly { readonly tag: string; readonly model: VenusModel }[] = [
    { tag: 'VNSA', model: 'Venus A' },
    { tag: 'VNSD', model: 'Venus D' },
    { tag: 'VNSE', model: 'Venus E 3.0' },
];

/** Filename fallbacks, using Marstek's OTA package naming conventions. */
const MODEL_FILENAME_HINTS: readonly { readonly needle: string; readonly model: VenusModel }[] = [
    { needle: 'vnsa', model: 'Venus A' },
    { needle: 'va_inv', model: 'Venus A' },
    { needle: 'vnsd', model: 'Venus D' },
    { needle: 'vd_inv', model: 'Venus D' },
    { needle: 'vnse', model: 'Venus E 3.0' },
    { needle: 'ac_app', model: 'Venus E 3.0' },
];

/**
 * Best-effort guess of which Marstek Venus model a firmware file targets.
 *
 * Primary signal: the embedded ASCII model tag. Control firmware for any model also contains a
 * cross-model family table near the end of flash ("VNSEE3\0\0VNSA\0\0\0\0VNSD\0\0\0\0HMG",
 * ~0x52xx-0x59xx), so several tags can be present at once. The tag matching the firmware's own
 * model consistently appears much earlier (~0x18xx) in every sample checked - so whichever tag
 * occurs at the lowest offset wins.
 *
 * Verified against all 22 Venus .bin files in the firmware archive (Control/BMS/Micro for
 * VNSA-0, VNSD-0 and VNSE3-0). Note that without the "VNSA" probe a Venus A Control image is
 * actively misdetected as Venus E, because the family table lists "VNSE" 16 bytes before
 * "VNSD".
 *
 * Fallback signal: filename.
 *
 * NOTE: the one archive sample without any tag is an early Venus E 3.0 BMS image (bms v106),
 * which falls through to the filename check. Venus E Gen 1/2 has never been sampled at all.
 */
export function detectFirmwareTargetModel(fileName: string, bytes: Uint8Array): ModelGuess {
    const name = (fileName || '').toLowerCase();

    const hits = MODEL_SIGNATURES
        .map(sig => ({ ...sig, offset: findAsciiSignature(bytes, sig.tag) }))
        .filter(hit => hit.offset !== -1)
        .sort((a, b) => a.offset - b.offset);

    if (hits.length > 0) {
        const [winner, ...rest] = hits;
        const others = rest.map(hit => `"${hit.tag}" at 0x${hit.offset.toString(16)}`).join(', ');
        const suffix = others ? ` (before ${others})` : '';
        return { model: winner.model, reason: `"${winner.tag}" signature at offset 0x${winner.offset.toString(16)}${suffix}` };
    }

    const hint = MODEL_FILENAME_HINTS.find(candidate => name.includes(candidate.needle));
    if (hint) {
        return { model: hint.model, reason: `filename contains "${hint.needle}"` };
    }

    return { model: 'Unknown', reason: 'no filename or content signature matched' };
}

/**
 * Guess the connected device's model from its BLE advertised name. The names come from the
 * Control firmware's own `AT+QBLENAME=MST_<type>_%c%c%c%c` string: MST_VNSA_xxxx, MST_VNSD_xxxx
 * and MST_VNSE3_xxxx. ("ACCP" belongs to the never-sampled Venus E Gen 1/2 and is not claimed
 * here.)
 */
export function detectConnectedDeviceModel(deviceName: string | undefined | null): VenusModel {
    const name = deviceName || '';
    if (name.includes('VNSA')) return 'Venus A';
    if (name.includes('VNSD')) return 'Venus D';
    if (name.includes('VNSE3')) return 'Venus E 3.0';
    return 'Unknown';
}

export type FirmwareComponent = 'Control/EMS' | 'MPPT' | 'BMS' | 'Micro/Inverter' | 'Unknown';

export interface ComponentGuess {
    component: FirmwareComponent;
    otaTypeFlag: number;
    reason: string;
}

/**
 * Detect which physical MCU component a firmware file targets, and which OTA type flag
 * (byte_2000E941, sent as position 4 in the 0x3A discovery probe payload) the Control MCU
 * requires for it.
 *
 * Ground truth, decompiled directly from Control FW 149.2 via Ghidra:
 *
 *   BLE_Cmd_OTA_Validate (0x0802e78c, handles cmd 0x52 / finalize):
 *     type==0 && OTA_Is_VNSD_Model() && (magic==0 || magic==0xFFFF)  -> valid (EMS/Control)
 *     type==2 && magic==0x2222                                       -> valid (MPPT)
 *     type==3 && magic==0x3333                                       -> valid (BMS)
 *     type==4 && magic==0x4444                                       -> valid (VNS / Micro-Inverter)
 *   where "magic" is the last 2 bytes of the received firmware image, and "type" is the OTA
 *   type flag from the 0x3A probe. OTA_Flash_Prepare_ByTarget (0x0802f730) independently
 *   confirms the same 4 targets with their own flash offsets (EMS=0x80000, MPPT=0x100000,
 *   BMS=0x180000, VNS=0x200000).
 *
 * Once BLE_Cmd_OTA_Validate accepts the image, OTA_Process_Pending_Updates iterates the 4 flash
 * slots and hands off any slot with status 0x02 to ProcessFirmwareUpdateCommand;
 * CAN_UpdateResultHandler maps CAN node-ID responses back to per-slot OTA status - i.e. the
 * Control MCU relays MPPT/BMS/VNS firmware to the physical sub-chip over CAN automatically,
 * on-device. This code only needs to send the correct type flag, not implement any CAN relay.
 *
 * NOT YET CONFIRMED by an actual successful flash - this is static analysis of the Control
 * firmware's own validation code, ported unchanged from the sibling project.
 */
export function detectFirmwareComponentType(bytes: Uint8Array): ComponentGuess {
    if (bytes.length < 2) return { component: 'Unknown', otaTypeFlag: 0x00, reason: 'file too small' };
    const last1 = bytes[bytes.length - 1];
    const last2 = bytes[bytes.length - 2];

    if (last1 === 0x44 && last2 === 0x44) {
        return { component: 'Micro/Inverter', otaTypeFlag: 0x04, reason: 'ends with 0x44 0x44 trailer -> device validate expects type=4 (VNS), magic=0x4444' };
    }
    if (last1 === 0x33 && last2 === 0x33) {
        return { component: 'BMS', otaTypeFlag: 0x03, reason: 'ends with 0x33 0x33 trailer -> device validate expects type=3, magic=0x3333' };
    }
    if (last1 === 0x22 && last2 === 0x22) {
        return { component: 'MPPT', otaTypeFlag: 0x02, reason: 'ends with 0x22 0x22 trailer -> device validate expects type=2, magic=0x2222' };
    }
    if (last1 === 0xFF && last2 === 0xFF) {
        return { component: 'Control/EMS', otaTypeFlag: 0x00, reason: 'ends with erased-flash 0xFF padding -> device validate expects type=0 (also requires the device-side model check to pass)' };
    }
    return { component: 'Unknown', otaTypeFlag: 0x00, reason: `unrecognized trailer (0x${last2.toString(16).padStart(2, '0')} 0x${last1.toString(16).padStart(2, '0')}) - defaulting to type=0 (EMS)` };
}
