import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

/**
 * The bridge's API token, for scripts such as Home Assistant. The bridge keeps only a hash, so a
 * token can be shown exactly once, when it is generated.
 */

async function call(method: 'GET' | 'POST' | 'DELETE'): Promise<Response> {
    const response = await fetch(bridgeUrl('api/token').href, {
        method,
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
    });

    if (response.status === 401) throw new Error(translate('err.sessionRejected'));
    if (!response.ok) throw new Error(translate('err.tokenFailed'));
    return response;
}

/** Whether a token is currently set. */
export async function fetchTokenEnabled(): Promise<boolean> {
    const body = await (await call('GET')).json() as { enabled?: boolean };
    return body.enabled === true;
}

/** Create a new token, replacing any old one. The returned value is not retrievable again. */
export async function generateToken(): Promise<string> {
    const body = await (await call('POST')).json() as { token?: string };
    if (typeof body.token !== 'string' || body.token === '') throw new Error(translate('err.tokenFailed'));
    return body.token;
}

export async function disableToken(): Promise<void> {
    await call('DELETE');
}
