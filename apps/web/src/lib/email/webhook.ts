import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Svix webhook signature verification (Resend delivers events through Svix).
 * Implemented directly on node:crypto — no SDK dependency:
 *
 *   signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
 *   expected      = base64( HMAC-SHA256( base64decode(secret sans "whsec_"),
 *                                        signedContent ) )
 *   header        = space-separated versioned signatures: "v1,<base64> …"
 *
 * Timestamp tolerance ±5 minutes (replay protection).
 */

const TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  rawBody: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  if (key.length === 0) return false;

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`, 'utf8')
    .digest();

  for (const candidate of headers.signature.split(' ')) {
    const [version, value] = candidate.split(',', 2);
    if (version !== 'v1' || !value) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(value, 'base64');
    } catch {
      continue;
    }
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}

/** Event types that put an address on the suppression list. */
export const SUPPRESSING_EVENTS: Record<string, 'bounced' | 'complained'> = {
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};
