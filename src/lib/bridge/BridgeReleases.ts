import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

const RELEASES_URL = 'https://api.github.com/repos/sphings79/marstek-ble-bridge/releases';
const RELEASES_LATEST = `${RELEASES_URL}/latest`;
// Plenty: the list is not in date order (see pickRelease), so the newest entry can sit anywhere in it.
const RELEASES_LIST = `${RELEASES_URL}?per_page=30`;

export interface BridgeRelease {
    tag: string;
    name: string;
    /** Link to the release page, so the changelog is one click away rather than reproduced here. */
    url: string;
    notes: string;
    prerelease: boolean;
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
/** The parts of a GitHub release this module reads. */
export interface GithubRelease {
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    published_at?: string | null;
    created_at?: string;
    assets?: { name: string; browser_download_url: string }[];
}

const stamp = (entry: GithubRelease) => Date.parse(entry.published_at ?? entry.created_at ?? '') || 0;

/**
 * Every offered release, newest first, drafts left out. Not the list's own order: GitHub sorts it by
 * tag name as text, so `v1.4.0-beta.9` comes before `v1.4.0-beta.10`. Entries without a date count
 * as oldest, which keeps the list order for those.
 */
export function sortReleases(list: GithubRelease[]): GithubRelease[] {
    return list
        .filter(entry => !entry.draft && entry.tag_name)
        .map((entry, index) => ({ entry, index }))
        .sort((x, y) => stamp(y.entry) - stamp(x.entry) || x.index - y.index)
        .map(({ entry }) => entry);
}

/**
 * Choose the release to offer. With betas allowed that is the most recently published non-draft
 * entry of the list; otherwise the newest one that is not a prerelease.
 */
export function pickRelease(list: GithubRelease[], includeBeta: boolean): GithubRelease | null {
    return sortReleases(list).find(entry => includeBeta || !entry.prerelease) ?? null;
}

export function toBridgeRelease(data: GithubRelease, chip?: string): BridgeRelease | null {
    if (!data.tag_name) return null;

    const assets = data.assets ?? [];
    const find = (needle: string) =>
        assets.find(a => a.name.toLowerCase().includes(needle))?.browser_download_url;

    // One firmware image per chip: an ESP32 and an ESP32-S3 do not run each other's. The image for
    // the S3 carries its chip in the name; the ESP32 one is the plain "bridge.bin".
    const firmwareUrl = chip && chip !== 'esp32' ? find(chip) : (find('bridge.bin') ?? find('firmware'));

    return {
        tag: data.tag_name,
        name: data.name || data.tag_name,
        url: data.html_url ?? '',
        notes: data.body ?? '',
        prerelease: data.prerelease === true,
        firmwareUrl,
        webUrl: find('web.bin'),
    };
}

/** All releases of the bridge, newest first, for choosing one. Empty when GitHub cannot be reached. */
export async function fetchReleases(chip?: string): Promise<BridgeRelease[]> {
    try {
        const response = await fetch(RELEASES_LIST, { headers: { 'Accept': 'application/vnd.github+json' } });
        if (!response.ok) return [];
        const data = await response.json() as GithubRelease[];
        if (!Array.isArray(data)) return [];
        return sortReleases(data)
            .map(entry => toBridgeRelease(entry, chip))
            .filter((entry): entry is BridgeRelease => entry != null);
    } catch {
        return [];
    }
}

export async function fetchLatestRelease(includeBeta = false, chip?: string): Promise<BridgeRelease | null> {
    try {
        const response = await fetch(includeBeta ? RELEASES_LIST : RELEASES_LATEST, {
            headers: { 'Accept': 'application/vnd.github+json' },
        });
        if (!response.ok) return null;

        const data = await response.json() as GithubRelease | GithubRelease[];
        const chosen = Array.isArray(data) ? pickRelease(data, includeBeta) : data;
        return chosen ? toBridgeRelease(chosen, chip) : null;
    } catch {
        return null;
    }
}

/**
 * Whether installing `release` crosses between beta and stable. A beta is recognised by "-beta" in
 * the running version; null when the release stays on the same side or the version is unknown.
 */
export function releaseDirection(
    running: string | undefined,
    release: { prerelease: boolean } | null,
): 'toStable' | 'toBeta' | null {
    if (!running || !release) return null;
    const runningBeta = running.includes('-beta');
    if (runningBeta && !release.prerelease) return 'toStable';
    if (!runningBeta && release.prerelease) return 'toBeta';
    return null;
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

/**
 * Have the bridge fetch and install an image itself. It reboots into it on success.
 *
 * The bridge streams progress as it downloads and flashes, because the download holds its single
 * web-server task and a separate progress poll could not be answered: the response body is a live
 * feed of `P <percent>` lines, closed by `OK` or `E <error>`. `onProgress` receives the percentages.
 * A bridge on older firmware answers once with JSON (`{ok, error}`) instead - the tail handles that,
 * so a new interface talking to an old bridge still works.
 */
export async function installFromUrl(
    url: string,
    target: 'firmware' | 'web',
    onProgress?: (percent: number) => void,
): Promise<void> {
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
        throw new Error(translate('err.installFailed', { detail }));
    }

    const reader = response.body?.getReader();
    if (!reader) {
        return;
    }

    const decoder = new TextDecoder();
    let text = '';
    let ok = false;
    let failure: string | null = null;

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = text.indexOf('\n')) >= 0) {
            const line = text.slice(0, nl).trim();
            text = text.slice(nl + 1);
            if (line.startsWith('P ')) {
                const pct = Number(line.slice(2));
                if (Number.isFinite(pct)) onProgress?.(Math.max(0, Math.min(100, pct)));
            } else if (line === 'OK') {
                ok = true;
            } else if (line.startsWith('E ')) {
                failure = line.slice(2);
            }
        }
    }

    if (ok) return;
    if (failure) throw new Error(translate('err.installFailed', { detail: failure }));

    // No streamed verdict: an older bridge's one-shot JSON reply, or an empty body. A clean 200 with
    // neither an OK nor an error line is taken as done.
    let parsed: { ok?: boolean; error?: string } | null = null;
    try {
        parsed = JSON.parse(text.trim() || '{}') as { ok?: boolean; error?: string };
    } catch {
        parsed = null;
    }
    if (parsed?.error) throw new Error(translate('err.installFailed', { detail: parsed.error }));
}
