import { createPrivateKey, sign } from 'node:crypto';

/**
 * VAPID (RFC 8292) request signing for Web Push — dependency-free, built on
 * Node's crypto so no `web-push` package is required. We send payload-LESS
 * pushes (a privacy-preserving "new activity" tickle: the message body never
 * leaves the server), which need only the VAPID Authorization header, not the
 * aes128gcm content-encryption dance. The service worker wakes, fetches the
 * unread summary, and shows a generic notification.
 */

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 public point (0x04 || x || y). */
  publicKey: string;
  /** base64url, 32-byte P-256 private scalar. */
  privateKey: string;
  /** Contact URI: `mailto:...` or an https URL (RFC 8292 `sub`). */
  subject: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** The push service's origin — the JWT `aud` (RFC 8292 §2). */
export function audienceFromEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}`;
}

/**
 * Build a signed ES256 VAPID JWT for one push endpoint. `exp` is capped well
 * under the spec's 24h ceiling. Throws only on malformed keys (a
 * configuration error, surfaced once at send time, never to a user).
 */
export function buildVapidJwt(keys: VapidKeys, audience: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const payload = b64url(Buffer.from(JSON.stringify({ aud: audience, exp, sub: keys.subject })));
  const signingInput = `${header}.${payload}`;

  const pub = Buffer.from(keys.publicKey, 'base64url');
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY must be a base64url 65-byte uncompressed P-256 point');
  }

  // Reconstruct the private key as a JWK (raw d + the x/y split from the
  // public point), then sign with IEEE-P1363 (raw r||s) — the JOSE format the
  // JWT wants, not Node's default DER.
  const privateKey = createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(pub.subarray(1, 33)),
      y: b64url(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });

  const signature = sign(null, Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return `${signingInput}.${b64url(signature)}`;
}
