import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

export const HOLD_SECONDS_MIN = 5;
export const HOLD_SECONDS_MAX = 3600;

/** Whether a value is acceptable as hold time (what the bridge accepts too). */
export function isValidHoldSeconds(value: number): boolean {
    return Number.isInteger(value) && value >= HOLD_SECONDS_MIN && value <= HOLD_SECONDS_MAX;
}

export interface BridgeSettings {
    holdSeconds: number;
    /** One entry per slot: whether the bridge keeps that slot connected on its own. */
    keepConnected: boolean[];
}

/** Read a settings response; null when it is not the expected shape. */
export function parseSettings(body: unknown): BridgeSettings | null {
    const { holdSeconds, keepConnected } = (body ?? {}) as { holdSeconds?: unknown; keepConnected?: unknown };
    if (typeof holdSeconds !== 'number') return null;
    return {
        holdSeconds,
        keepConnected: Array.isArray(keepConnected) ? keepConnected.map(entry => entry === true) : [],
    };
}

async function call(method: 'GET' | 'POST', body?: unknown): Promise<BridgeSettings> {
    const response = await fetch(bridgeUrl('api/settings').href, {
        method,
        credentials: 'same-origin',
        headers: body === undefined
            ? { 'Accept': 'application/json' }
            : { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401) throw new Error(translate('err.sessionRejected'));
    if (response.status === 400) throw new Error(translate('err.settingsInvalid'));
    if (!response.ok) throw new Error(translate('err.settingsFailed'));

    const settings = parseSettings(await response.json());
    if (!settings) throw new Error(translate('err.settingsFailed'));
    return settings;
}

/** Request bodies, kept apart so the wire format is checkable without a network. */
export const holdBody = (holdSeconds: number) => ({ holdSeconds });
export const keepBody = (slot: number, enabled: boolean) => ({ keep: { slot, enabled } });

/** Hold time and per-slot "keep connected" flags. */
export function fetchSettings(): Promise<BridgeSettings> {
    return call('GET');
}

/** How long the bridge keeps the storage connections after the last browser or REST command. */
export function saveHoldSeconds(holdSeconds: number): Promise<BridgeSettings> {
    return call('POST', holdBody(holdSeconds));
}

/** Keep a slot connected permanently, or stop doing so. */
export function saveKeepConnected(slot: number, enabled: boolean): Promise<BridgeSettings> {
    return call('POST', keepBody(slot, enabled));
}
