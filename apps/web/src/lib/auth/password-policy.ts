import { createHash } from 'node:crypto';

import type { ErrorCode } from '@/lib/errors';

import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from './constants';

/**
 * Minimum password policy (§26): length + breach check. Limits live in
 * constants.ts (shared with the error copy); the checks live here.
 */
export { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH };

export type PasswordVerdict =
  | { ok: true; breachChecked: boolean }
  | { ok: false; code: Extract<ErrorCode, 'password_too_short' | 'password_too_long' | 'password_breached'> };

/**
 * Check the password against the Have I Been Pwned corpus using the
 * k-anonymity range API: only the first 5 hex chars of the SHA-1 ever leave
 * the server, so the password itself is never disclosed.
 *
 * Fails OPEN (§26 "where feasible"): if HIBP is slow or down, signup must
 * not break — we log and skip the check rather than lock people out.
 */
async function isBreached(password: string, timeoutMs = 2500): Promise<boolean | 'unavailable'> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'xidig-auth' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return 'unavailable';

    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix, count] = line.trim().split(':');
      if (hashSuffix === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return 'unavailable';
  }
}

/** Validate a candidate password against the full policy. */
export async function validatePassword(password: string): Promise<PasswordVerdict> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, code: 'password_too_short' };
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return { ok: false, code: 'password_too_long' };
  }

  const breached = await isBreached(password);
  if (breached === true) {
    return { ok: false, code: 'password_breached' };
  }
  if (breached === 'unavailable') {
    console.warn('[auth] HIBP breach check unavailable — accepting password unchecked');
    return { ok: true, breachChecked: false };
  }
  return { ok: true, breachChecked: true };
}
