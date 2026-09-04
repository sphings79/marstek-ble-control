import { bridgeUrl } from './BridgeApi';

const RELEASES_API = 'https://api.github.com/repos/sphings79/marstek-ble-bridge/releases/latest';

export interface BridgeRelease {
    tag: string;
    name: string;
    /** Link to the release page, so the changelog is one click away rather than reproduced here. */
    url: string;
    notes: string;
    firmwareUrl?: string;
    webUrl?: string;
}

/**
 * Ask GitHub what the newest release is.
 *
 * Fetched by the browser rather than the bridge: the API answers cross-origin requests, and the
 * page is the thing that needs to render it. The images are a different matter - release assets
 * carry no cross-origin headers, so the bridge downloads those itself.
 *
 * Returns null for anything that is not a clear answer, including a private repository, where the
 * API replies 404 to a browser with no token. Failing quietly is right here: an update check that
 * cannot reach GitHub is not a reason to put an error in front of someone.
 */
export async function fetchLatestRelease(): Promise<BridgeRelease | null> {
    try {
        const response = await fetch(RELEASES_API, { headers: { 'Accept': 'application/vnd.github+json' } });
        if (!response.ok) return null;

        const data = await response.json() as {
            tag_name?: string;
            name?: string;
            html_url?: string;
            body?: string;
            assets?: { name: string; browser_download_url: string }[];
        };

        if (!data.tag_name) return null;

        const assets = data.assets ?? [];
        const find = (needle: string) =>
            assets.find(a => a.name.toLowerCase().includes(needle))?.browser_download_url;

        return {
            tag: data.tag_name,
            name: data.name || data.tag_name,
            url: data.html_url ?? '',
            notes: data.body ?? '',
            firmwareUrl: find('bridge.bin') ?? find('firmware'),
            webUrl: find('web.bin'),
        };
    } catch {
        return null;
    }
}

/**
 * Whether the running build predates the release.
 *
 * ESP-IDF derives the running version from `git describe`, so a build made at the tag reads as the
 * tag and later ones carry a suffix. Anything that does not start with the tag is therefore either
 * older or from another line of development - both worth offering the release for. Deliberately
 * cruder than parsing version numbers, which would invent precision this does not have.
 */
export function isOutdated(running: string | undefined, tag: string): boolean {
    if (!running) return false;
    return !running.startsWith(tag);
}

/** Have the bridge fetch and install an image itself. It reboots into it on success. */
export async function installFromUrl(url: string, target: 'firmware' | 'web'): Promise<void> {
    const response = await fetch(bridgeUrl('api/update/url').href, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, target }),
    });

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const body = await response.json() as { error?: string };
            if (body.error) detail = body.error;
        } catch {
            // Keep the status code.
        }
        throw new Error(`The bridge could not install it: ${detail}`);
    }
}
