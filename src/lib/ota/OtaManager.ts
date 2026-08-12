import type { BLEConnectionManager } from '../BLEConnectionManager';
import {
    buildDataFrame,
    buildFinishFrame,
    buildOtaFrame,
    buildSizeFrame,
    buildTransitionHmFrame,
    decodeIncomingFrame,
} from './OtaFrameCodec';
import {
    computeFirmwareChecksum,
    detectConnectedDeviceModel,
    detectFirmwareComponentType,
    detectFirmwareTargetModel,
    type ComponentGuess,
    type ModelGuess,
} from './FirmwareAnalysis';

/**
 * OTA update orchestrator. Ported step-for-step from the sibling "Marstek Venus Monitor"
 * project's js/ble-protocol.js (performOTAUpdate / sendOTAActivate / sendFirmwareSize /
 * sendFirmwareChunk / sendOTAFinalize), which was reverse-engineered from real Wireshark
 * captures and used successfully for Control/EMS and BMS firmware updates. The type-flag
 * selection (see FirmwareAnalysis.ts) additionally reflects Ghidra decompilation of the
 * Control firmware's own validation function.
 *
 * NOT YET LIVE-TESTED from this codebase - Web Bluetooth requires a real browser + paired
 * device, which isn't available in the environment this port was written in. The framing,
 * checksum, and sequencing logic is an unchanged port of a working implementation, but treat
 * a first real run as the actual test of this file.
 */

export const OtaPhase = Object.freeze({
    IDLE: 'IDLE',
    ACTIVATING: 'ACTIVATING',
    DISCOVERING: 'DISCOVERING',
    SENDING_SIZE: 'SENDING_SIZE',
    TRANSFERRING: 'TRANSFERRING',
    FINALIZING: 'FINALIZING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
});
export type OtaPhase = (typeof OtaPhase)[keyof typeof OtaPhase];

export interface OtaAnalysis {
    fileName: string;
    size: number;
    checksum: number;
    modelGuess: ModelGuess;
    componentGuess: ComponentGuess;
}

export interface OtaProgress {
    phase: OtaPhase;
    chunkIndex: number;
    totalChunks: number;
    message: string;
}

interface Ack {
    ok: boolean;
    cmd: number;
    payload: Uint8Array;
    reason?: string;
}

const OTA_CHUNK_SIZE = 128;

export function analyzeFirmwareForOta(fileName: string, bytes: Uint8Array): OtaAnalysis {
    return {
        fileName,
        size: bytes.length,
        checksum: computeFirmwareChecksum(bytes),
        modelGuess: detectFirmwareTargetModel(fileName, bytes),
        componentGuess: detectFirmwareComponentType(bytes),
    };
}

export function detectModelMismatch(analysis: OtaAnalysis, connectedDeviceName: string | undefined | null): { mismatch: boolean; connectedModel: string } {
    const connectedModel = detectConnectedDeviceModel(connectedDeviceName);
    const mismatch = analysis.modelGuess.model !== 'Unknown' && connectedModel !== 'Unknown' && analysis.modelGuess.model !== connectedModel;
    return { mismatch, connectedModel };
}

export class OtaManager {
    private manager: BLEConnectionManager;

    constructor(manager: BLEConnectionManager) {
        this.manager = manager;
    }

    private log(onLog: (msg: string) => void, msg: string) {
        onLog(msg);
    }

    private waitForAck(expectedCmd: number, timeoutMs: number): Promise<Ack> {
        return new Promise((resolve) => {
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                this.manager.onRawNotification = () => {};
            };

            this.manager.onRawNotification = (bytes: Uint8Array) => {
                const decoded = decodeIncomingFrame(bytes);
                if (!decoded) return;
                if (!decoded.checksumValid) {
                    cleanup();
                    resolve({ ok: false, cmd: decoded.cmd, payload: decoded.payload, reason: 'bad checksum' });
                    return;
                }
                cleanup();
                if (decoded.cmd === expectedCmd) {
                    resolve({ ok: true, cmd: decoded.cmd, payload: decoded.payload });
                } else {
                    resolve({ ok: false, cmd: decoded.cmd, payload: decoded.payload, reason: `unexpected cmd: expected 0x${expectedCmd.toString(16)}, got 0x${decoded.cmd.toString(16)}` });
                }
            };

            timeoutId = setTimeout(() => {
                this.manager.onRawNotification = () => {};
                resolve({ ok: false, cmd: -1, payload: new Uint8Array(0), reason: 'timeout' });
            }, timeoutMs);
        });
    }

    private async activate(onLog: (msg: string) => void): Promise<void> {
        this.log(onLog, '🔄 Activating upgrade mode...');

        await this.manager.sendRaw(buildOtaFrame(0x54, new Uint8Array([0x10])));
        await new Promise(r => setTimeout(r, 100));

        await this.manager.sendRaw(buildTransitionHmFrame(0x10, [0xaa]));

        const ack = await this.waitForAck(0x00, 3000);
        if (!ack.ok) {
            throw new Error(`Activation failed: ${ack.reason}`);
        }
        if (ack.payload.length < 1 || ack.payload[0] !== 0x01) {
            throw new Error(`Unexpected activation ACK payload: [${Array.from(ack.payload).join(', ')}]`);
        }
        this.log(onLog, '✅ Upgrade mode activated');
    }

    private async discover(otaTypeFlag: number, onLog: (msg: string) => void): Promise<void> {
        const maxRetries = 3;
        let lastAck: Ack | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            this.log(onLog, `🔍 Sending 0x3A discovery probe (attempt ${attempt}/${maxRetries}, type flag 0x${otaTypeFlag.toString(16).padStart(2, '0')})...`);

            const probeFrame = buildOtaFrame(0x3A, new Uint8Array([0x10, 0xd7, 0x00, otaTypeFlag, 0xaa, 0xbb]));
            try {
                await this.manager.sendRaw(probeFrame);
                lastAck = await this.waitForAck(0x3A, 2000);
                if (lastAck.ok) {
                    this.log(onLog, `✅ 0x3A handshake successful on attempt ${attempt}`);
                    return;
                }
            } catch (err) {
                this.log(onLog, `⚠️ Probe attempt ${attempt} failed: ${(err as Error).message}`);
            }

            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        throw new Error(`OTA channel discovery failed after ${maxRetries} attempts: ${lastAck?.reason ?? 'timeout'}`);
    }

    private async sendSize(size: number, checksum: number, onLog: (msg: string) => void): Promise<void> {
        this.log(onLog, `📏 Sending firmware size (${size} bytes) + checksum 0x${(checksum >>> 0).toString(16)}...`);

        await this.manager.sendRaw(buildSizeFrame(size, checksum));
        const ack = await this.waitForAck(0x50, 5000);
        if (!ack.ok) {
            throw new Error(`Size ACK failed: ${ack.reason}`);
        }

        if (ack.payload.length >= 9) {
            const echoed = ack.payload[5] | (ack.payload[6] << 8) | (ack.payload[7] << 16) | (ack.payload[8] << 24);
            if ((echoed >>> 0) === (checksum >>> 0)) {
                this.log(onLog, `✅ Firmware checksum verified: 0x${(echoed >>> 0).toString(16)}`);
            } else {
                this.log(onLog, `⚠️ Checksum mismatch: sent 0x${(checksum >>> 0).toString(16)}, device echoed 0x${(echoed >>> 0).toString(16)}`);
            }
        }
    }

    private async sendChunks(bytes: Uint8Array, onLog: (msg: string) => void, onProgress: (p: OtaProgress) => void): Promise<void> {
        const totalChunks = Math.ceil(bytes.length / OTA_CHUNK_SIZE);
        this.log(onLog, `📦 Sending ${totalChunks} chunks (${OTA_CHUNK_SIZE} bytes each)...`);

        let offset = 0;
        let chunkIndex = 0;

        while (offset < bytes.length) {
            const end = Math.min(offset + OTA_CHUNK_SIZE, bytes.length);
            const chunk = bytes.subarray(offset, end);

            let sent = false;
            let retryCount = 0;
            while (!sent && retryCount < 3) {
                try {
                    await this.manager.sendRaw(buildDataFrame(offset, chunk));
                    const ack = await this.waitForAck(0x51, 1500);
                    if (!ack.ok) {
                        throw new Error(ack.reason ?? 'chunk ack failed');
                    }
                    sent = true;
                } catch (err) {
                    retryCount++;
                    this.log(onLog, `Retry ${retryCount}/3 for chunk ${chunkIndex + 1}: ${(err as Error).message}`);
                    if (retryCount >= 3) {
                        throw new Error(`Failed to send chunk ${chunkIndex + 1} after 3 retries`);
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            offset = end;
            chunkIndex++;

            onProgress({ phase: OtaPhase.TRANSFERRING, chunkIndex, totalChunks, message: `Uploading: ${chunkIndex}/${totalChunks} chunks` });
            if (chunkIndex % 10 === 0 || chunkIndex === totalChunks) {
                this.log(onLog, `📊 Progress: ${Math.round((chunkIndex / totalChunks) * 100)}% (${chunkIndex}/${totalChunks})`);
            }
        }

        this.log(onLog, `Data transfer complete: ${bytes.length} bytes in ${chunkIndex} chunks`);
    }

    private async finalize(analysis: OtaAnalysis, onLog: (msg: string) => void): Promise<void> {
        this.log(onLog, 'Finalizing OTA update...');

        await this.manager.sendRaw(buildFinishFrame());
        const ack = await this.waitForAck(0x52, 3000);
        if (!ack.ok) {
            throw new Error(`Finalize ACK failed: ${ack.reason}`);
        }

        if (ack.payload.length >= 2 && ack.payload[0] === 0x00 && ack.payload[1] === 0x01) {
            this.log(onLog, '✅ OTA finalization successful - device will restart');
            return;
        }

        const dir = ack.payload.length >= 1 ? `0x${ack.payload[0].toString(16)}` : 'none';
        const status = ack.payload.length >= 2 ? `0x${ack.payload[1].toString(16)}` : 'none';
        this.log(onLog, `OTA finalization FAILED - dir: ${dir}, status: ${status}`);
        this.log(onLog, 'Possible causes (per BLE_Cmd_OTA_Validate, Control FW 0x0802e78c):');
        this.log(onLog, '  1. CRC mismatch - device calculated checksum differs from sent checksum');

        const c = analysis.componentGuess.component;
        if (c === 'Micro/Inverter') {
            this.log(onLog, '  2. VNS/Micro signature check failed - device expected magic 0x4444 with type flag 0x04');
        } else if (c === 'BMS') {
            this.log(onLog, '  2. BMS signature check failed - device expected magic 0x3333 with type flag 0x03');
        } else if (c === 'MPPT') {
            this.log(onLog, '  2. MPPT signature check failed - device expected magic 0x2222 with type flag 0x02');
        } else {
            this.log(onLog, '  2. EMS/Control check failed - device expected magic 0x0000/0xFFFF with type flag 0x00, and OTA_Is_VNSD_Model()/VNSD-VNSE match');
        }
        this.log(onLog, `OTA type flag sent: 0x${analysis.componentGuess.otaTypeFlag.toString(16).padStart(2, '0')} (component: ${c})`);

        throw new Error(`Finalize rejected by device (status=${status})`);
    }

    /**
     * Run the full OTA sequence. Throws on failure; caller is responsible for showing any
     * model/component mismatch confirmation UI *before* calling this.
     */
    async run(bytes: Uint8Array, analysis: OtaAnalysis, onLog: (msg: string) => void, onProgress: (p: OtaProgress) => void): Promise<void> {
        this.manager.suspendPolling();
        try {
            onProgress({ phase: OtaPhase.ACTIVATING, chunkIndex: 0, totalChunks: 0, message: 'Activating upgrade mode...' });
            await this.activate(onLog);
            await new Promise(r => setTimeout(r, 1500));

            onProgress({ phase: OtaPhase.DISCOVERING, chunkIndex: 0, totalChunks: 0, message: 'Discovering OTA channel...' });
            await this.discover(analysis.componentGuess.otaTypeFlag, onLog);

            onProgress({ phase: OtaPhase.SENDING_SIZE, chunkIndex: 0, totalChunks: 0, message: 'Sending firmware size...' });
            await this.sendSize(analysis.size, analysis.checksum, onLog);

            onProgress({ phase: OtaPhase.TRANSFERRING, chunkIndex: 0, totalChunks: Math.ceil(bytes.length / OTA_CHUNK_SIZE), message: 'Transferring firmware...' });
            await this.sendChunks(bytes, onLog, onProgress);

            onProgress({ phase: OtaPhase.FINALIZING, chunkIndex: 0, totalChunks: 0, message: 'Finalizing...' });
            await this.finalize(analysis, onLog);

            onProgress({ phase: OtaPhase.SUCCESS, chunkIndex: 0, totalChunks: 0, message: 'Update complete - device will restart' });
        } catch (err) {
            onProgress({ phase: OtaPhase.FAILED, chunkIndex: 0, totalChunks: 0, message: (err as Error).message });
            throw err;
        } finally {
            this.manager.onRawNotification = () => {};
            this.manager.resumePolling();
        }
    }
}
