/**
 * Talking to the ESP32 bridge that serves this app, if there is one.
 *
 * The same bundle is shipped two ways: hosted over HTTPS, where it talks to the battery directly
 * via Web Bluetooth, and from the bridge's own flash, where it goes through the bridge instead.
 * Which one applies is decided at runtime by asking our own origin.
 */

export const BRIDGE_MAGIC = 'marstek-ble-control';
export const BRIDGE_PROTOCOL_VERSION = 1;

export interface BridgeInfo {
    bridge: string;
    version: number;
    /** Whether an admin password has been set yet. */
    claimed: boolean;
    /** Whether the current session is logged in. */
    authenticated: boolean;
}

/** Resolve a bridge endpoint against the app's own base path. */
export function bridgeUrl(path: string): URL {
    return new URL(path, new URL(import.meta.env.BASE_URL, window.location.href));
}

/**
 * Ask our own origin whether it is a bridge.
 *
 * Skipped outright on https, because a bridge is never served that way: it has no certificate and
 * deliberately does not fake one, since the app it serves is same-origin and needs no TLS to reach
 * it. That keeps the hosted deployment from firing a request on every load that can only ever 404
 * - visible to users as a console error, and a delay if the network is slow. (If the bridge ever
 * does grow TLS, this shortcut is the first thing to remove.)
 *
 * Otherwise deliberately strict: a web server answers unknown paths with an HTML error page, which
 * a status-code-only check would happily mistake for a bridge. So the response has to be JSON and
 * has to identify itself. Bounded to one second - it must never hold up the UI.
 */
export async function probeBridge(timeoutMs = 1_000): Promise<BridgeInfo | null> {
    if (window.location.protocol === 'https:') {
        return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(bridgeUrl('api/bridge').href, {
            signal: controller.signal,
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) return null;
        if (!response.headers.get('content-type')?.includes('application/json')) return null;

        const info = await response.json() as BridgeInfo;
        if (info?.bridge !== BRIDGE_MAGIC) return null;

        return info;
    } catch {
        // No bridge, no network, or it took too long - all mean "use Web Bluetooth".
        return null;
    } finally {
        clearTimeout(timer);
    }
}
