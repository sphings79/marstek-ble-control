import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

export interface BridgeVersion {
    version: string;
    built: string;
    idf: string;
    /** Which of the two app slots is running, e.g. "ota_0". */
    slot: string;
    /**
     * The release the web interface was installed from, "custom" for one uploaded by hand, and
     * absent on a bridge too old to record it. The interface carries no version of its own that
     * can be read back, so this is the only way to tell whether it matches a release.
     */
    web?: string;
}

export async function fetchBridgeVersion(): Promise<BridgeVersion | null> {
    try {
        const response = await fetch(bridgeUrl('api/version').href, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) return null;
        return await response.json() as BridgeVersion;
    } catch {
        return null;
    }
}

/** Which half of the bridge an image replaces: the ESP32 firmware, or the interface it serves. */
export type UpdateTarget = 'firmware' | 'web';

/**
 * Send an image to the bridge.
 *
 * XMLHttpRequest rather than fetch, purely for upload progress: this is going over WiFi to a
 * microcontroller, and a bar that moves is the difference between waiting and wondering.
 *
 * Firmware lands in the slot the bridge is not running from and is only booted once its checksum
 * holds, so a broken upload costs nothing. The interface has no second copy and is replaced in
 * place - a broken upload there leaves the bridge serving nothing until the next attempt, though
 * its API keeps answering so a retry is always possible.
 */
export function uploadBridgeFirmware(
    file: File,
    target: UpdateTarget,
    onProgress: (percent: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', bridgeUrl(target === 'web' ? 'api/update/web' : 'api/update').href);
        request.withCredentials = true;
        request.setRequestHeader('Content-Type', 'application/octet-stream');

        request.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        };

        request.onload = () => {
            if (request.status >= 200 && request.status < 300) {
                resolve();
            } else if (request.status === 401) {
                reject(new Error(translate('err.sessionRejected')));
            } else {
                reject(new Error(request.responseText || translate('err.imageRefused', { status: request.status })));
            }
        };

        request.onerror = () => reject(new Error(translate('err.uploadFailed')));
        request.onabort = () => reject(new Error(translate('err.uploadCancelled')));

        request.send(file);
    });
}

/**
 * Wait for the bridge to come back after it restarts into the new firmware.
 *
 * It answers nothing at all for a few seconds while it reboots, so failures are expected and
 * ignored until the deadline.
 */
export async function waitForBridge(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 2_000));
        try {
            const response = await fetch(bridgeUrl('api/bridge').href, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (response.ok) return true;
        } catch {
            // Still down; that is what a reboot looks like from here.
        }
    }

    return false;
}
