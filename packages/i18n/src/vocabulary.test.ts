import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';
import { DEFAULT_LOCALE, LOCALE_NAMES, LOCALES } from './locales';

/**
 * Canonical vocabulary lock (Bilingual UI Copy & Naming System + PRD decisions).
 * A failure here means a naming decision was changed in code without a
 * naming-review decision — update the PRD/naming doc first, then this test.
 */
describe('canonical navigation names', () => {
  const canonical = [
    ['nav.home', 'Home', 'Hoy'],
    ['nav.plaza', 'Plaza', 'Madal'],
    ['nav.labs', 'Labs', 'Labs'],
    ['nav.suuq', 'Directory & Map', 'Suuq'],
    ['nav.messages', 'Messages', 'Fariimo'],
    ['nav.capital', 'Capital', 'Maal'],
    ['nav.notifications', 'Notifications', 'Digniino'],
    ['nav.profile', 'Profile', 'Aniga'],
  ] as const;

  it.each(canonical)('%s → EN "%s" · SO "%s"', (key, enName, soName) => {
    expect(en[key]).toBe(enName);
    expect(so[key]).toBe(soName);
  });
});

describe('canonical product terms', () => {
  it('Garab backs things with the EN label "Co-sign" (PRD decision log, Tracker Seq 51)', () => {
    expect(en['term.garab']).toBe('Co-sign');
    expect(so['term.garab']).toBe('Garab');
    expect(en['action.garab']).toBe('Co-sign');
    expect(so['action.garab']).toBe('Garab');
  });

  it('social proof counts stay in the canonical noun per locale ("142 garab / 142 co-signs")', () => {
    expect(en['action.garabCount'].other).toBe('{count} co-signs');
    expect(so['action.garabCount']?.other).toBe('{count} garab');
  });

  it('Space modes: Lab (Warshad) ⇄ Club (Koox) — naming review of 27 Jun (PRD §16)', () => {
    expect(en['term.lab']).toBe('Lab');
    expect(so['term.lab']).toBe('Warshad');
    expect(en['term.club']).toBe('Club');
    expect(so['term.club']).toBe('Koox');
  });

  it('Maalgeli is the invest action (Somalia-region gated at render time, PRD §17)', () => {
    expect(en['term.maalgeli']).toBe('Invest');
    expect(so['term.maalgeli']).toBe('Maalgeli');
  });
});

describe('language identity', () => {
  it('is Somali-first', () => {
    expect(DEFAULT_LOCALE).toBe('so');
    expect(LOCALES[0]).toBe('so');
  });

  it('names each language in itself (endonyms), for the toggle', () => {
    expect(LOCALE_NAMES.so).toBe('Soomaali');
    expect(LOCALE_NAMES.en).toBe('English');
  });
});
