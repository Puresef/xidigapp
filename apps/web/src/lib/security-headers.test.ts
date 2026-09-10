import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

// The security headers ship on every route ('/(.*)') — a drift here silently
// changes browser-side defences app-wide. The Permissions-Policy line has
// already bitten once: microphone=() (empty allowlist) shipped while DM voice
// notes (components/messages/voice-note.tsx) call getUserMedia, which denies
// the mic to our own origin before the browser prompt can appear. Camera and
// geolocation stay fully locked until a real caller ships.
describe('security response headers', () => {
  async function globalHeaders() {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === '/(.*)');
    expect(rule).toBeDefined();
    return new Map(rule!.headers.map((h) => [h.key, h.value]));
  }

  it('allows same-origin microphone for DM voice notes, keeps camera/geolocation locked', async () => {
    const headers = await globalHeaders();
    expect(headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(self), geolocation=()',
    );
  });

  it('keeps the clickjacking and sniffing defences in place', async () => {
    const headers = await globalHeaders();
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
