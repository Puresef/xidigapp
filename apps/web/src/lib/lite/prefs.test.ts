import { describe, expect, it } from 'vitest';

import {
  isLiteActive,
  LITE_BUNDLES,
  LITE_COOKIE,
  matchLiteBundle,
  parseLitePrefs,
  serializeLitePrefsCookie,
  type LitePrefs,
} from './prefs';

describe('isLiteActive', () => {
  it('is inactive only when every category loads normally', () => {
    expect(isLiteActive(LITE_BUNDLES.everything)).toBe(false);
    expect(isLiteActive(LITE_BUNDLES.essentials)).toBe(true);
    expect(isLiteActive(LITE_BUNDLES.text)).toBe(true);
  });

  it('activates on any single deferred category', () => {
    const prefs: LitePrefs = { ...LITE_BUNDLES.everything, maps: false };
    expect(isLiteActive(prefs)).toBe(true);
  });
});

describe('matchLiteBundle', () => {
  it('recognizes exact bundles', () => {
    expect(matchLiteBundle({ ...LITE_BUNDLES.text })).toBe('text');
    expect(matchLiteBundle({ ...LITE_BUNDLES.essentials })).toBe('essentials');
    expect(matchLiteBundle({ ...LITE_BUNDLES.everything })).toBe('everything');
  });

  it('returns null for custom mixes', () => {
    expect(matchLiteBundle({ ...LITE_BUNDLES.everything, embeds: false })).toBeNull();
  });
});

describe('parseLitePrefs', () => {
  it('round-trips through the cookie serializer', () => {
    const cookie = serializeLitePrefsCookie(LITE_BUNDLES.essentials);
    expect(cookie.startsWith(`${LITE_COOKIE}=`)).toBe(true);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');

    const value = cookie.split(';')[0]?.slice(LITE_COOKIE.length + 1) ?? '';
    expect(parseLitePrefs(value)).toEqual(LITE_BUNDLES.essentials);
  });

  it('accepts raw (non-URI-encoded) JSON too', () => {
    expect(parseLitePrefs(JSON.stringify(LITE_BUNDLES.text))).toEqual(LITE_BUNDLES.text);
  });

  it('rejects absent, malformed, and half-shaped values', () => {
    expect(parseLitePrefs(undefined)).toBeNull();
    expect(parseLitePrefs('')).toBeNull();
    expect(parseLitePrefs('1')).toBeNull();
    expect(parseLitePrefs('not json')).toBeNull();
    expect(parseLitePrefs('{"images":false}')).toBeNull(); // missing keys
    expect(
      parseLitePrefs(
        '{"images":"no","embeds":true,"maps":true,"animations":true,"smallAvatars":true}',
      ),
    ).toBeNull();
  });
});
