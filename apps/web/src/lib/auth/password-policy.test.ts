import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PASSWORD_MIN_LENGTH, validatePassword } from './password-policy';

function hibpResponseFor(password: string, count = 42): string {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  // The range API returns suffixes only; include noise lines around the hit.
  return [`00000AAAA:1`, `${sha1.slice(5)}:${count}`, `FFFFFZZZZ:3`].join('\r\n');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validatePassword — length policy', () => {
  it(`rejects passwords under ${PASSWORD_MIN_LENGTH} chars without calling HIBP`, async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const verdict = await validatePassword('short');
    expect(verdict).toEqual({ ok: false, code: 'password_too_short' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects passwords over 72 BYTES (bcrypt truncation), not 72 chars', async () => {
    vi.stubGlobal('fetch', vi.fn());
    // 25 × 3-byte characters = 75 bytes but only 25 chars.
    const multibyte = '€'.repeat(25);
    const verdict = await validatePassword(multibyte);
    expect(verdict).toEqual({ ok: false, code: 'password_too_long' });
  });

  it('accepts a 72-byte password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('00000AAAA:1', { status: 200 })),
    );
    const verdict = await validatePassword('a'.repeat(72));
    expect(verdict).toEqual({ ok: true, breachChecked: true });
  });
});

describe('validatePassword — HIBP k-anonymity check', () => {
  it('rejects a breached password', async () => {
    const password = 'correct horse battery staple';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // Only the 5-char SHA-1 prefix may leave the process.
        const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
        expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
        expect(String(url)).not.toContain(sha1.slice(5));
        return new Response(hibpResponseFor(password), { status: 200 });
      }),
    );
    const verdict = await validatePassword(password);
    expect(verdict).toEqual({ ok: false, code: 'password_breached' });
  });

  it('treats a zero count as not breached (padding entries)', async () => {
    const password = 'a perfectly fine password';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(hibpResponseFor(password, 0), { status: 200 })),
    );
    expect(await validatePassword(password)).toEqual({ ok: true, breachChecked: true });
  });

  it('accepts a clean password', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('00000AAAA:1\r\nBBBBBCCCC:2', { status: 200 })),
    );
    expect(await validatePassword('a genuinely novel passphrase 7')).toEqual({
      ok: true,
      breachChecked: true,
    });
  });

  it('fails OPEN when HIBP errors (signup must not depend on a third party)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 })),
    );
    expect(await validatePassword('a genuinely novel passphrase 7')).toEqual({
      ok: true,
      breachChecked: false,
    });
  });

  it('fails OPEN when HIBP is unreachable (network throw)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await validatePassword('a genuinely novel passphrase 7')).toEqual({
      ok: true,
      breachChecked: false,
    });
  });
});
