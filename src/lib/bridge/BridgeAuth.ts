import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import { bridgeUrl } from './BridgeApi';
import { translate } from '../../i18n/i18n';

/**
 * Login against the bridge without ever putting the password on the wire.
 *
 * The bridge serves over plain http:// - it has no certificate and, as decided, is not going to
 * pretend otherwise with a self-signed one. That rules out `crypto.subtle`, which browsers only
 * expose in secure contexts, hence @noble/hashes.
 *
 * Shape: the bridge stores `key = SHA-256(salt || password)`. To log in it hands out that salt
 * plus a single-use nonce; the client answers `HMAC-SHA-256(key, nonce)`. Someone listening on the
 * LAN learns a salt, a nonce and one HMAC over them - none of which can be replayed against the
 * next nonce, and none of which yields the password.
 *
 * What this does NOT protect:
 * - The session cookie afterwards is readable on the wire. Stealing it grants control until it
 *   expires; it does not reveal the password.
 * - Claiming an unclaimed bridge sends the derived key once, in the clear. There is no way around
 *   that short of a PAKE, which is far out of scope here. It is bounded: it happens exactly once,
 *   and only within the claim window right after boot.
 *
 * Anyone who needs actual confidentiality on their network wants a VPN or a separate VLAN, and the
 * README says so.
 */

export interface Challenge {
    salt: string;
    nonce: string;
}

function deriveKey(saltHex: string, password: string): Uint8Array {
    const salt = hexToBytes(saltHex);
    const pw = utf8ToBytes(password);

    const input = new Uint8Array(salt.length + pw.length);
    input.set(salt, 0);
    input.set(pw, salt.length);

    return sha256(input);
}

async function postJson(path: string, body: unknown): Promise<Response> {
    return fetch(bridgeUrl(path).href, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** Set the admin password on a bridge that does not have one yet. */
export async function claimBridge(password: string): Promise<void> {
    const response = await fetch(bridgeUrl('api/auth/challenge').href, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(translate('err.claimRefused'));
    }

    const { salt } = await response.json() as Challenge;
    const claim = await postJson('api/auth/claim', {
        salt,
        key: bytesToHex(deriveKey(salt, password)),
    });

    if (!claim.ok) {
        throw new Error(translate(claim.status === 409 ? 'err.alreadyClaimed' : 'err.claimFailed'));
    }
}

/** Log in. On success the bridge sets the session cookie itself. */
export async function loginToBridge(password: string): Promise<void> {
    const response = await fetch(bridgeUrl('api/auth/challenge').href, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(translate('err.noChallenge'));
    }

    const { salt, nonce } = await response.json() as Challenge;
    const key = deriveKey(salt, password);
    const proof = bytesToHex(hmac(sha256, key, hexToBytes(nonce)));

    const login = await postJson('api/auth/login', { nonce, response: proof });

    if (!login.ok) {
        throw new Error(translate(login.status === 429 ? 'err.tooManyAttempts' : 'err.wrongPassword'));
    }
}

/**
 * Change the password.
 *
 * Answers a fresh challenge with the *old* key before sending the new one, so a session cookie
 * picked up off the network is not on its own enough to lock the owner out - which is the one
 * consequence of a readable cookie that could not simply be undone.
 *
 * The salt is new too, and generated here. `crypto.getRandomValues` is available in insecure
 * contexts; only `crypto.subtle` is not, which is why the hashing goes through @noble/hashes.
 */
export async function changeBridgePassword(current: string, next: string): Promise<void> {
    const response = await fetch(bridgeUrl('api/auth/challenge').href, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(translate('err.noChallenge'));
    }

    const { salt, nonce } = await response.json() as Challenge;
    const proof = bytesToHex(hmac(sha256, deriveKey(salt, current), hexToBytes(nonce)));

    const freshSalt = new Uint8Array(16);
    crypto.getRandomValues(freshSalt);
    const freshSaltHex = bytesToHex(freshSalt);

    const change = await postJson('api/auth/password', {
        nonce,
        response: proof,
        salt: freshSaltHex,
        key: bytesToHex(deriveKey(freshSaltHex, next)),
    });

    if (!change.ok) {
        throw new Error(translate(change.status === 429 ? 'err.tooManyAttempts' : 'err.wrongCurrentPassword'));
    }
}

export async function logoutFromBridge(): Promise<void> {
    await postJson('api/auth/logout', {});
}
