import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

export const HOLD_SECONDS_MIN = 5;
export const HOLD_SECONDS_MAX = 3600;

/** Whether a value is acceptable as hold time (what the bridge accepts too). */
export function isValidHoldSeconds(value: number): boolean {
    return Number.isInteger(value) && value >= HOLD_SECONDS_MIN && value <= HOLD_SECONDS_MAX;
}

async function call(method: 'GET' | 'POST', body?: unknown): Promise<{ holdSeconds: number }> {
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

    const result = await response.json() as { holdSeconds?: number };
    if (typeof result.holdSeconds !== 'number') throw new Error(translate('err.settingsFailed'));
    return { holdSeconds: result.holdSeconds };
}

/** How long the bridge keeps the storage connections after the last browser or REST command. */
export async function fetchHoldSeconds(): Promise<number> {
    return (await call('GET')).holdSeconds;
}

export async function saveHoldSeconds(holdSeconds: number): Promise<number> {
    return (await call('POST', { holdSeconds })).holdSeconds;
}
