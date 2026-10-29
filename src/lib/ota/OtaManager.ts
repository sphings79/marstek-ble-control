import type { BLEConnectionManager, OtaSession } from '../BLEConnectionManager';
import {
    buildDataFrame,
    buildFinishFrame,
    buildOtaFrame,
    buildSizeFrame,
    buildTransitionHmFrame,
    decodeIncomingFrame,
} from './OtaFrameCodec';
import { otaTimingsFor, type OtaTimings } from './OtaTimings';
import {
    computeFirmwareChecksum,
    detectConnectedDeviceModel,
    detectFirmwareComponentType,
    detectFirmwareTargetModel,
    type ComponentGuess,
    type ModelGuess,
} from './FirmwareAnalysis';

/**
 * Transfers firmware with exclusive connection ownership and correlated ACKs.
 * Listeners are registered before each write so early replies cannot be lost.
 * Transfer acceptance must be followed by reconnecting and checking the installed version.
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

class OtaTimeoutError extends Error {}

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
    private readonly timings: OtaTimings;

    constructor(manager: BLEConnectionManager) {
        this.manager = manager;
        this.timings = otaTimingsFor(manager.transportKind);
    }

    private log(onLog: (msg: string) => void, msg: string) {
        onLog(msg);
    }

    private session: OtaSession | null = null;
    private controller: AbortController | null = null;
    private running = false;

    /** Stop sending; this cannot undo bytes already staged on the device. */
    public cancel(): void { this.controller?.abort(); }

    private checkCancelled(): void {
        if (this.controller?.signal.aborted) throw new Error('Transfer cancelled');
    }

    private async pause(ms: number): Promise<void> {
        this.checkCancelled();
        const signal = this.controller?.signal;
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                unsubscribeLoss();
            };
            const finish = () => { cleanup(); resolve(); };
            const timer = setTimeout(finish, ms);
            const abort = () => {
                cleanup();
                reject(new Error('Transfer cancelled'));
            };
            const unsubscribeLoss = this.manager.subscribeConnectionLoss(() => {
                cleanup();
                reject(new Error('Disconnected during firmware transfer'));
            });
            signal?.addEventListener('abort', abort, { once: true });
            if (!this.manager.isConnected) {
                cleanup();
                reject(new Error('Not connected'));
            }
        });
    }

    /** Initial command54 has no ACK; bound its write and connection lifetime too. */
    private writeOnly(frame: Uint8Array, timeoutMs: number): Promise<void> {
        this.checkCancelled();
        return new Promise((resolve, reject) => {
            let done = false;
            const signal = this.controller?.signal;
            const cleanup = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                unsubscribeLoss();
            };
            const finish = (error?: unknown) => {
                if (done) return;
                done = true;
                cleanup();
                if (error) reject(error); else resolve();
            };
            const abort = () => finish(new Error('Transfer cancelled'));
            const timer = setTimeout(() => finish(new Error('Activation write timeout')), timeoutMs);
            const unsubscribeLoss = this.manager.subscribeConnectionLoss(() => finish(new Error('Disconnected during firmware transfer')));
            signal?.addEventListener('abort', abort, { once: true });
            if (!this.manager.isConnected) { finish(new Error('Not connected')); return; }
            try {
                const write = this.session ? this.session.send(frame) : this.manager.sendRaw(frame);
                void write.then(() => finish(), finish);
            } catch (error) { finish(error); }
        });
    }

    /** Listen first; require BOTH write completion and a correlated complete ACK. */
    private exchange(frame: Uint8Array, expectedCmd: number, timeoutMs: number,
        validate: (payload: Uint8Array) => 'accept' | 'ignore'): Promise<Ack> {
        this.checkCancelled();
        return new Promise((resolve, reject) => {
            let done = false;
            let written = false;
            let reply: Ack | null = null;
            const signal = this.controller?.signal;
            let unsubscribeFrame = () => {};
            let unsubscribeLoss = () => {};
            const cleanup = () => {
                clearTimeout(timer);
                unsubscribeFrame();
                unsubscribeLoss();
                signal?.removeEventListener('abort', abort);
            };
            const fail = (error: unknown) => {
                if (done) return;
                done = true;
                cleanup();
                reject(error);
            };
            const complete = () => {
                if (!done && written && reply) {
                    done = true;
                    cleanup();
                    resolve(reply);
                }
            };
            const abort = () => fail(new Error('Transfer cancelled'));
            const timer = setTimeout(() => fail(written
                ? new OtaTimeoutError(`ACK timeout for command 0x${expectedCmd.toString(16)}`)
                : new Error(`Write timeout for command 0x${expectedCmd.toString(16)}`)), timeoutMs);
            unsubscribeFrame = this.manager.subscribeFrames(bytes => {
                const decoded = decodeIncomingFrame(bytes);
                // Unrelated traffic must never consume this exchange's waiter.
                if (!decoded || decoded.cmd !== expectedCmd || decoded.frameType === 'normalHM') return;
                if (!decoded.checksumValid) return;
                try {
                    if (validate(decoded.payload) === 'ignore') return;
                    reply = { ok: true, cmd: decoded.cmd, payload: decoded.payload.slice() };
                    complete();
                } catch (error) { fail(error); }
            });
            unsubscribeLoss = this.manager.subscribeConnectionLoss(() => fail(new Error('Disconnected during firmware transfer')));
            signal?.addEventListener('abort', abort, { once: true });
            if (!this.manager.isConnected) { fail(new Error('Not connected')); return; }
            try {
                const send = this.session ? this.session.send(frame) : this.manager.sendRaw(frame);
                void send.then(() => { written = true; complete(); }, fail);
            } catch (error) { fail(error); }
        });
    }

    private requirePayload(payload: Uint8Array, length: number): void {
        if (payload.length !== length || payload[0] !== 0) {
            throw new Error('Invalid acknowledgement direction or payload length');
        }
    }

    private u32(payload: Uint8Array, offset: number): number {
        return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(offset, true);
    }

    private async activate(onLog: (msg: string) => void): Promise<void> {
        this.log(onLog, 'Activating upgrade mode...');
        this.checkCancelled();
        await this.writeOnly(buildOtaFrame(0x54, new Uint8Array([0x10])), this.timings.activateAckMs);
        await this.pause(100);
        await this.exchange(buildTransitionHmFrame(0x10, [0xaa]), 0x00, this.timings.activateAckMs, payload => {
            if (payload.length !== 2 || payload[0] !== 1 || payload[1] !== 0xaa) {
                throw new Error('Upgrade activation rejected or malformed');
            }
            return 'accept';
        });
        this.log(onLog, 'Upgrade mode acknowledged');
    }

    private async discover(otaTypeFlag: number, onLog: (msg: string) => void): Promise<void> {
        for (let attempt = 1; attempt <= this.timings.discoverAttempts; attempt++) {
            this.checkCancelled();
            try {
                await this.exchange(buildOtaFrame(0x3a, new Uint8Array([0x10, 0xd7, 0, otaTypeFlag, 0xaa, 0xbb])),
                    0x3a, this.timings.discoverAckMs, payload => {
                        this.requirePayload(payload, 7);
                        if (payload[5] !== 1 || payload[6] !== 0xaa) throw new Error('Device rejected firmware target');
                        if (this.u32(payload, 1) !== 0) throw new Error('Unexpected resume offset; a fresh transfer is required');
                        return 'accept';
                    });
                this.log(onLog, `Firmware target acknowledged (attempt ${attempt})`);
                return;
            } catch (error) {
                if (!(error instanceof OtaTimeoutError) || attempt === this.timings.discoverAttempts) throw error;
                await this.pause(this.timings.discoverRetryGapMs);
            }
        }
    }

    private async sendSize(size: number, checksum: number, onLog: (msg: string) => void): Promise<void> {
        await this.exchange(buildSizeFrame(size, checksum), 0x50, this.timings.sizeAckMs, payload => {
            this.requirePayload(payload, 9);
            if (this.u32(payload, 1) !== size || this.u32(payload, 5) !== (checksum >>> 0)) {
                throw new Error('Device size/checksum echo does not match selected firmware');
            }
            return 'accept';
        });
        this.log(onLog, `Size and checksum acknowledged: ${size} bytes, 0x${checksum.toString(16)}`);
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
            while (!sent && retryCount < this.timings.chunkRetries) {
                try {
                    await this.exchange(buildDataFrame(offset, chunk), 0x51, this.timings.chunkAckMs, payload => {
                        this.requirePayload(payload, 5);
                        const acknowledgedOffset = this.u32(payload, 1);
                        if (acknowledgedOffset < offset) return 'ignore'; // delayed ACK for an earlier chunk
                        if (acknowledgedOffset !== offset) throw new Error('Chunk acknowledgement offset mismatch');
                        return 'accept';
                    });
                    sent = true;
                } catch (err) {
                    if (!(err instanceof OtaTimeoutError)) throw err;
                    retryCount++;
                    this.log(onLog, `Retry ${retryCount}/${this.timings.chunkRetries} for chunk ${chunkIndex + 1}: ${(err as Error).message}`);
                    if (retryCount >= this.timings.chunkRetries) {
                        throw new Error(`Failed to send chunk ${chunkIndex + 1} after ${this.timings.chunkRetries} retries`);
                    }
                    await this.pause(100);
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

    private async finalize(_analysis: OtaAnalysis, onLog: (msg: string) => void): Promise<void> {
        await this.exchange(buildFinishFrame(), 0x52, this.timings.finalizeAckMs, payload => {
            this.requirePayload(payload, 2);
            if (payload[1] !== 1) throw new Error(`Finalize rejected by device (status=0x${payload[1].toString(16)})`);
            return 'accept';
        });
        this.log(onLog, 'Transfer accepted by controller; installed version must be checked after reconnecting');
    }

    /**
     * Transfer a verified immutable image. Throws on failure and on model mismatch.
     * SUCCESS means the controller accepted the transfer, not a verified installed version.
     */
    async run(bytes: Uint8Array, analysis: OtaAnalysis, onLog: (msg: string) => void,
        onProgress: (p: OtaProgress) => void, signal?: AbortSignal): Promise<void> {
        if (this.running) throw new Error('A firmware transfer is already running');
        this.running = true;
        this.controller = new AbortController();
        const abort = () => this.controller?.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        let activationStarted = false;
        try {
            this.checkCancelled();
            // Snapshot both bytes and derived metadata before any asynchronous work.
            const image = bytes.slice();
            const verified = analyzeFirmwareForOta(analysis.fileName, image);
            if (image.length < OTA_CHUNK_SIZE || image.length > 0x7d000 || image.length % OTA_CHUNK_SIZE !== 0) {
                throw new Error('Firmware must be a complete 128-byte-aligned image within the staging capacity');
            }
            if (verified.size !== analysis.size || verified.checksum !== analysis.checksum ||
                verified.modelGuess.model !== analysis.modelGuess.model ||
                verified.componentGuess.component !== analysis.componentGuess.component ||
                verified.componentGuess.otaTypeFlag !== analysis.componentGuess.otaTypeFlag) {
                throw new Error('Firmware bytes do not match their analysis');
            }
            if (verified.componentGuess.component === 'Unknown' || verified.modelGuess.model === 'Unknown') {
                throw new Error('Unknown firmware model or component');
            }
            const deviceModel = detectConnectedDeviceModel(this.manager.deviceName);
            if (deviceModel === 'Unknown' || deviceModel !== verified.modelGuess.model) {
                throw new Error('Firmware model does not match the connected device');
            }
            this.session = await this.manager.beginOtaSession(this.controller.signal);
            this.checkCancelled();
            activationStarted = true;
            onProgress({ phase: OtaPhase.ACTIVATING, chunkIndex: 0, totalChunks: 0, message: 'Activating upgrade mode...' });
            await this.activate(onLog);
            await this.pause(1500);
            onProgress({ phase: OtaPhase.DISCOVERING, chunkIndex: 0, totalChunks: 0, message: 'Discovering OTA channel...' });
            await this.discover(verified.componentGuess.otaTypeFlag, onLog);
            onProgress({ phase: OtaPhase.SENDING_SIZE, chunkIndex: 0, totalChunks: 0, message: 'Sending firmware size...' });
            await this.sendSize(verified.size, verified.checksum, onLog);
            onProgress({ phase: OtaPhase.TRANSFERRING, chunkIndex: 0, totalChunks: image.length / OTA_CHUNK_SIZE, message: 'Transferring firmware...' });
            await this.sendChunks(image, onLog, onProgress);
            onProgress({ phase: OtaPhase.FINALIZING, chunkIndex: 0, totalChunks: 0, message: 'Finalizing...' });
            await this.finalize(verified, onLog);
            onProgress({ phase: OtaPhase.SUCCESS, chunkIndex: 0, totalChunks: 0,
                message: 'Transfer accepted; reconnect and verify installed firmware' });
        } catch (error) {
            onProgress({ phase: OtaPhase.FAILED, chunkIndex: 0, totalChunks: 0, message: String(error instanceof Error ? error.message : error) });
            throw error;
        } finally {
            signal?.removeEventListener('abort', abort);
            // Never send ordinary commands while an accepted image may be applying, or
            // after an interrupted update whose device state is unknown. Reconnect to resume.
            this.session?.release(!activationStarted);
            this.session = null;
            this.controller = null;
            this.running = false;
        }
    }
}
