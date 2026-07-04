import { describe, expect, it, vi } from 'vitest';

import { negotiateLocale } from './locales';
import { parseLocaleCookie, serializeLocaleCookie } from './cookie';
import { createTranslator, translateWith, type MessageKey } from './translate';
import type { Message } from './messages';

type TestDictionary = Partial<Record<MessageKey, Message>>;

describe('createTranslator', () => {
  it('resolves English strings', () => {
    const t = createTranslator('en');
    expect(t('nav.home')).toBe('Home');
    expect(t('action.garab')).toBe('Co-sign');
  });

  it('resolves Somali strings', () => {
    const t = createTranslator('so');
    expect(t('nav.home')).toBe('Hoy');
    expect(t('action.garab')).toBe('Garab');
  });

  it('selects plural forms from the count param', () => {
    const t = createTranslator('en');
    expect(t('action.garabCount', { count: 1 })).toBe('1 co-sign');
    expect(t('action.garabCount', { count: 142 })).toBe('142 co-signs');
  });

  it('keeps the invariant Somali plural for garab', () => {
    const t = createTranslator('so');
    expect(t('action.garabCount', { count: 1 })).toBe('1 garab');
    expect(t('action.garabCount', { count: 142 })).toBe('142 garab');
  });
});

describe('translateWith (resolution + interpolation internals)', () => {
  const primary = { 'x.translated': 'haa {name}' } as unknown as TestDictionary;
  const fallback = {
    'x.translated': 'yes {name}',
    'x.only-fallback': 'fallback wins',
    'x.plural': { one: 'one thing', other: '{count} things' },
  } as unknown as TestDictionary;

  it('prefers the primary dictionary', () => {
    expect(
      translateWith('so', primary, fallback, 'x.translated' as MessageKey, { name: 'A' }),
    ).toBe('haa A');
  });

  it('falls back per-key to the dictionary of record', () => {
    expect(translateWith('so', primary, fallback, 'x.only-fallback' as MessageKey)).toBe(
      'fallback wins',
    );
  });

  it('returns the key itself for unknown keys instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translateWith('so', primary, fallback, 'x.missing-everywhere' as MessageKey)).toBe(
      'x.missing-everywhere',
    );
    warn.mockRestore();
  });

  it('leaves unknown placeholders intact rather than rendering "undefined"', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translateWith('en', {}, fallback, 'x.translated' as MessageKey)).toBe('yes {name}');
    warn.mockRestore();
  });

  it('uses the "other" form when a plural message gets no count', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(translateWith('en', {}, fallback, 'x.plural' as MessageKey)).toBe('{count} things');
    warn.mockRestore();
  });
});

describe('negotiateLocale', () => {
  it('defaults to Somali when the header is absent or unhelpful', () => {
    expect(negotiateLocale(null)).toBe('so');
    expect(negotiateLocale('')).toBe('so');
    expect(negotiateLocale('fr-FR, de;q=0.8')).toBe('so');
  });

  it('honours the browser preference between supported locales', () => {
    expect(negotiateLocale('en-US,en;q=0.9')).toBe('en');
    expect(negotiateLocale('so, en;q=0.8')).toBe('so');
  });

  it('is quality-aware, not order-aware', () => {
    expect(negotiateLocale('en;q=0.5, so;q=0.9')).toBe('so');
    expect(negotiateLocale('so;q=0, en;q=0.1')).toBe('en');
  });

  it('matches on the primary subtag', () => {
    expect(negotiateLocale('so-SO')).toBe('so');
    expect(negotiateLocale('en-GB')).toBe('en');
  });
});

describe('locale cookie', () => {
  it('round-trips through a cookie string', () => {
    const cookie = serializeLocaleCookie('so');
    expect(cookie).toContain('xidig_locale=so');
    expect(parseLocaleCookie(`other=1; ${cookie.split(';')[0]}; theme=dark`)).toBe('so');
  });

  it('rejects unsupported or absent values', () => {
    expect(parseLocaleCookie('xidig_locale=fr')).toBeNull();
    expect(parseLocaleCookie('theme=dark')).toBeNull();
    expect(parseLocaleCookie(null)).toBeNull();
  });
});
