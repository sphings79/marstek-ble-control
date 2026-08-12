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

export type VenusModel = 'Venus D' | 'Venus E' | 'Unknown';

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
 * Best-effort guess of which Marstek Venus model a firmware file targets.
 *
 * Primary signal: Marstek embeds a short ASCII model-family tag in every firmware component -
 * "VNSD" (Venus D) or "VNSE" (Venus E). Verified against 6 real Venus D and 4 real Venus E 3.0
 * .bin files (Control/Micro/BMS for both). Control firmware for either model can contain BOTH
 * tags (likely part of a cross-model compatibility/version table near the end of flash), but
 * the tag matching the firmware's own model consistently appears much earlier (~0x18xx) than
 * the other model's tag (~0x55xx-0x59xx) in every sample checked - so whichever tag occurs at
 * the lowest offset wins.
 *
 * Fallback signal: filename, using Marstek's OTA package naming conventions.
 *
 * NOTE: no Venus A firmware samples have been checked against this signature scheme - it may
 * use a different or additional tag ("VNSA"?) not accounted for here.
 */
export function detectFirmwareTargetModel(fileName: string, bytes: Uint8Array): ModelGuess {
    const name = (fileName || '').toLowerCase();

    const vnsdOffset = findAsciiSignature(bytes, 'VNSD');
    const vnseOffset = findAsciiSignature(bytes, 'VNSE');

    if (vnsdOffset !== -1 && (vnseOffset === -1 || vnsdOffset < vnseOffset)) {
        const suffix = vnseOffset !== -1 ? ` (before "VNSE" at 0x${vnseOffset.toString(16)})` : '';
        return { model: 'Venus D', reason: `"VNSD" signature at offset 0x${vnsdOffset.toString(16)}${suffix}` };
    }
    if (vnseOffset !== -1) {
        const suffix = vnsdOffset !== -1 ? ` (before "VNSD" at 0x${vnsdOffset.toString(16)})` : '';
        return { model: 'Venus E', reason: `"VNSE" signature at offset 0x${vnseOffset.toString(16)}${suffix}` };
    }

    if (name.includes('vnsd') || name.includes('vd_inv')) {
        return { model: 'Venus D', reason: `filename contains "${name.includes('vnsd') ? 'VNSD' : 'vd_inv'}"` };
    }
    if (name.includes('vnse') || name.includes('ac_app')) {
        return { model: 'Venus E', reason: `filename contains "${name.includes('vnse') ? 'VNSE' : 'ac_app'}"` };
    }

    return { model: 'Unknown', reason: 'no filename or content signature matched' };
}

/** Guess the connected device's model from its BLE advertised name. */
export function detectConnectedDeviceModel(deviceName: string | undefined | null): VenusModel {
    const name = deviceName || '';
    if (name.includes('VNSD')) return 'Venus D';
    if (name.includes('ACCP')) return 'Venus E';
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
        return { component: 'Control/EMS', otaTypeFlag: 0x00, reason: 'ends with erased-flash 0xFF padding -> device validate expects type=0 (also requires OTA_Is_VNSD_Model()/VNSD-VNSE match)' };
    }
    return { component: 'Unknown', otaTypeFlag: 0x00, reason: `unrecognized trailer (0x${last2.toString(16).padStart(2, '0')} 0x${last1.toString(16).padStart(2, '0')}) - defaulting to type=0 (EMS)` };
}
