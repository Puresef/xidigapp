import { describe, expect, it } from 'vitest';

import {
  CONSENT_VERSION,
  decideConsent,
  parseConsentCookie,
  serializeConsentCookie,
  type ConsentCookieValue,
} from './model';

/**
 * Consent model (§12). The codec must round-trip its own output, survive
 * junk from the wild (this cookie is client-visible and user-editable), and
 * decideConsent must fail CLOSED both ways on lookup errors: no capture and
 * no banner.
 */

describe('consent cookie codec', () => {
  it('round-trips every flag combination', () => {
    for (const analytics of [true, false]) {
      for (const errorMonitoring of [true, false]) {
        const value: ConsentCookieValue = { version: CONSENT_VERSION, analytics, errorMonitoring };
        expect(parseConsentCookie(serializeConsentCookie(value))).toEqual(value);
      }
    }
  });

  it('serializes stably: fixed key order, 0/1 flags', () => {
    expect(
      serializeConsentCookie({ version: '2026-07-09', analytics: true, errorMonitoring: false }),
    ).toBe('v=2026-07-09&a=1&e=0');
  });

  it('parses the percent-encoded form Next’s cookie serializer emits', () => {
    const encoded = encodeURIComponent('v=2026-07-09&a=1&e=0');
    expect(parseConsentCookie(encoded)).toEqual({
      version: '2026-07-09',
      analytics: true,
      errorMonitoring: false,
    });
  });

  it('is order-insensitive and ignores unknown params', () => {
    expect(parseConsentCookie('e=1&x=junk&v=2026-07-09&a=0')).toEqual({
      version: '2026-07-09',
      analytics: false,
      errorMonitoring: true,
    });
  });

  it('treats missing or non-"1" flags as declined', () => {
    expect(parseConsentCookie('v=2026-07-09')).toEqual({
      version: '2026-07-09',
      analytics: false,
      errorMonitoring: false,
    });
    expect(parseConsentCookie('v=2026-07-09&a=true&e=yes')).toEqual({
      version: '2026-07-09',
      analytics: false,
      errorMonitoring: false,
    });
  });

  it('returns null for empty/absent/junk values without throwing', () => {
    expect(parseConsentCookie(null)).toBeNull();
    expect(parseConsentCookie(undefined)).toBeNull();
    expect(parseConsentCookie('')).toBeNull();
    expect(parseConsentCookie('hello world')).toBeNull();
    expect(parseConsentCookie('a=1&e=1')).toBeNull(); // no version
    expect(parseConsentCookie(`v=${'x'.repeat(65)}`)).toBeNull(); // absurd version
  });

  it('survives malformed percent-escapes (never throws, never matches current)', () => {
    const parsed = parseConsentCookie('v=%ZZ&a=1');
    // Either null or a non-current version is acceptable — just not a throw
    // and not a current-version match.
    expect(parsed?.version === CONSENT_VERSION).toBe(false);
  });
});

describe('decideConsent', () => {
  const currentCookie: ConsentCookieValue = {
    version: CONSENT_VERSION,
    analytics: true,
    errorMonitoring: false,
  };

  it('current-version cookie is authoritative (no prompt, flags from cookie)', () => {
    expect(decideConsent(currentCookie, [])).toEqual({
      needsPrompt: false,
      analytics: true,
      errorMonitoring: false,
    });
  });

  it('current-version decline cookie wins even over stale records', () => {
    const declined: ConsentCookieValue = {
      version: CONSENT_VERSION,
      analytics: false,
      errorMonitoring: false,
    };
    expect(decideConsent(declined, [{ type: 'analytics', version: '2026-01-01' }])).toEqual({
      needsPrompt: false,
      analytics: false,
      errorMonitoring: false,
    });
  });

  it('fails closed both ways on lookup error: no capture AND no banner', () => {
    expect(decideConsent(null, 'error')).toEqual({
      needsPrompt: false,
      analytics: false,
      errorMonitoring: false,
    });
  });

  it('prompts a member with no cookie and no records', () => {
    expect(decideConsent(null, [])).toEqual({
      needsPrompt: true,
      analytics: false,
      errorMonitoring: false,
    });
  });

  it('current-version record answers the prompt; missing category stays declined', () => {
    expect(decideConsent(null, [{ type: 'analytics', version: CONSENT_VERSION }])).toEqual({
      needsPrompt: false,
      analytics: true,
      errorMonitoring: false,
    });
  });

  it('version bump: old records keep their grants honored but re-prompt', () => {
    const state = decideConsent(null, [
      { type: 'analytics', version: '2026-01-01' },
      { type: 'error_monitoring', version: '2026-01-01' },
    ]);
    expect(state).toEqual({ needsPrompt: true, analytics: true, errorMonitoring: true });
  });

  it('old-version cookie is not authoritative — records decide', () => {
    const old: ConsentCookieValue = { version: '2026-01-01', analytics: true, errorMonitoring: true };
    expect(decideConsent(old, [])).toEqual({
      needsPrompt: true,
      analytics: false,
      errorMonitoring: false,
    });
  });
});
