import { createTranslator } from '@xidig/i18n';
import { describe, expect, it } from 'vitest';

import { ERROR_DEFS, NOTICE_KEYS, isErrorCode, resolveError, type ErrorCode } from './errors';

/**
 * §27 integrity: every error code must resolve to real, fully-interpolated
 * plain-language copy in BOTH locales — a broken key or missing param would
 * show members a raw i18n key or a dangling {placeholder}.
 */

const codes = Object.keys(ERROR_DEFS) as ErrorCode[];

describe.each(['en', 'so'] as const)('error catalog (%s)', (locale) => {
  const t = createTranslator(locale);

  it.each(codes)('%s resolves to finished copy', (code) => {
    const err = resolveError(code, t);
    // A translator returns the key itself for unknown keys.
    expect(err.message).not.toBe(ERROR_DEFS[code].messageKey);
    expect(err.message.length).toBeGreaterThan(10);
    // No unfilled placeholders (params must cover every {slot}).
    expect(err.message).not.toMatch(/\{\w+\}/);
    if (err.cta) {
      expect(err.cta.label).not.toMatch(/^action\./);
      expect(err.cta.href.startsWith('/')).toBe(true);
    }
  });

  it.each(Object.entries(NOTICE_KEYS))('notice %s resolves', (_notice, key) => {
    expect(t(key)).not.toBe(key);
  });
});

describe('§27 copy anchors', () => {
  const t = createTranslator('en');

  it('magic-link expiry names the 10-minute window', () => {
    expect(resolveError('magic_link_expired', t).message).toContain('10 minutes');
  });

  it('OTP expiry names the 10-minute window and offers the magic link', () => {
    const message = resolveError('otp_invalid', t).message;
    expect(message).toContain('10 minutes');
    expect(message.toLowerCase()).toContain('magic link');
  });

  it('reset notice names the 60-minute window', () => {
    expect(t(NOTICE_KEYS.password_reset_sent)).toContain('60 minutes');
  });

  it('wrong credentials offers reset AND magic link (§27)', () => {
    const err = resolveError('wrong_credentials', t);
    expect(err.message.toLowerCase()).toContain('reset');
    expect(err.message.toLowerCase()).toContain('magic link');
  });

  it('session expiry explains the sign-out with a sign-in CTA (§27)', () => {
    const err = resolveError('session_expired', t);
    expect(err.message).toContain('signed out');
    expect(err.cta?.href).toBe('/signin');
  });

  it('password policy errors carry the concrete limits', () => {
    expect(resolveError('password_too_short', t).message).toContain('10');
    expect(resolveError('password_too_long', t).message).toContain('72');
  });
});

describe('isErrorCode', () => {
  it('accepts known codes and rejects everything else', () => {
    expect(isErrorCode('session_expired')).toBe(true);
    expect(isErrorCode('nope')).toBe(false);
    expect(isErrorCode(null)).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});
