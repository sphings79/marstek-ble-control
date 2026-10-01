// Firmware images from the public archive (github.com/sphings79/marstek-firmware-archiv).
//
// The archive publishes index.json, a flat list of every flashable image, so the app needs one
// small request instead of walking the repository (the GitHub contents API is rate-limited,
// raw.githubusercontent.com is not and sends CORS headers). The images themselves come from the
// same place and are checked against the SHA-256 the index carries.

const ARCHIVE_RAW = 'https://raw.githubusercontent.com/sphings79/marstek-firmware-archiv/main/';

export const ARCHIVE_URL = 'https://github.com/sphings79/marstek-firmware-archiv';

export interface ArchiveFirmware {
    type: string;
    version: string;
    display: string;
    beta: boolean;
    file: string;
    size: number | null;
    sha256: string | null;
    date: string | null;
    noteEN: string;
    noteDE: string;
}

interface ArchiveIndex {
    devices: Record<string, { model: string; firmwares: ArchiveFirmware[] }>;
}

// Folder names in the archive, by the model name the app detects.
const ARCHIVE_DEVICE: Record<string, string> = {
    'Venus A': 'VNSA-0',
    'Venus D': 'VNSD-0',
    'Venus E 3.0': 'VNSE3-0',
};

/** Whether the archive has images for this model at all. */
export function archiveSupports(modelName: string | undefined): boolean {
    return modelName !== undefined && modelName in ARCHIVE_DEVICE;
}

/** Every image for the model, grouped by component with the newest version first. */
export async function fetchArchiveFirmwares(modelName: string): Promise<ArchiveFirmware[]> {
    const code = ARCHIVE_DEVICE[modelName];
    if (!code) return [];

    const response = await fetch(`${ARCHIVE_RAW}index.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const index = (await response.json()) as ArchiveIndex;
    return index.devices[code]?.firmwares ?? [];
}

/** Download one image and verify it against the archive's checksum. */
export async function downloadArchiveFirmware(fw: ArchiveFirmware): Promise<{ name: string; bytes: Uint8Array }> {
    const response = await fetch(`${ARCHIVE_RAW}${fw.file.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (fw.size !== null && bytes.length !== fw.size) {
        throw new Error(`size ${bytes.length}, expected ${fw.size}`);
    }

    if (fw.sha256 !== null) {
        const actual = await sha256Hex(bytes);
        if (actual !== fw.sha256.toLowerCase()) throw new Error('checksum mismatch');
    }

    return { name: fw.file.split('/').pop() ?? fw.file, bytes };
}

async function sha256Hex(data: Uint8Array): Promise<string> {
    // crypto.subtle only exists in secure contexts. The page served by a bridge is plain HTTP on
    // the LAN, so it falls back to the implementation below.
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
        return toHex(new Uint8Array(digest));
    }
    return toHex(sha256(data));
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Plain SHA-256, for pages that have no crypto.subtle. */
export function sha256(data: Uint8Array): Uint8Array {
    const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
    padded.set(data);
    padded[data.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 0x100000000));
    view.setUint32(padded.length - 4, (data.length * 8) >>> 0);

    const h = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const w = new Uint32Array(64);
    const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
            const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    h.forEach((v, i) => outView.setUint32(i * 4, v));
    return out;
}
