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
    ['nav.labs', 'Labs', 'Warshad'],
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

  it('Abuur is the create action — a header button, never a nav tab (naming review 5 Jul)', () => {
    expect(en['action.abuur']).toBe('Create');
    expect(so['action.abuur']).toBe('Abuur');
  });

  it('P1 dictionary migration (HANDOFF-P1, 6 Aug): Codsi replaces Weydiin, Salaan replaces Is-barasho', () => {
    expect(en['plaza.typeAsk']).toBe('Ask');
    expect(so['plaza.typeAsk']).toBe('Codsi');
    expect(en['plaza.typeIntro']).toBe('Intro');
    expect(so['plaza.typeIntro']).toBe('Salaan');
  });

  it('Musharax keeps the house single-consonant spelling (naming review 23 Aug)', () => {
    // House rule: Somali already carries plenty of doubled letters, so we do
    // not double unless the doubling is core to the word — "musharrax" ships
    // as "musharax". One plural stem too: the dictionary used to carry both
    // musharrixiin and musharraxiin.
    expect(so['capital.candidatesTitle']).toBe('Musharaxiinta Maalka');
    expect(so['capital.editTitle']).toBe('Wax ka beddel Musharaxa');
    expect(en['capital.candidatesTitle']).toBe('Venture Candidates');
  });

  it('Garab ships bare — the long forms were retired, tooltips carry the meaning', () => {
    // Naming review 23 Aug: "Garab istaag" / "Waad garab taagan tahay" are NOT
    // shipped. The word stays one syllable and the explanation lives in the
    // helper note and the badge tooltip.
    expect(so['action.garab']).toBe('Garab');
    expect(so['action.garab']).not.toContain('istaag');
    for (const key of ['plaza.garabHelperNote', 'profile.badgeGarabTooltip'] as const) {
      expect(en[key], `${key} must explain Co-sign`).toBeTruthy();
      expect(so[key], `${key} must explain Garab`).toBeTruthy();
    }
  });

  it('own-profile FUNCTION labels say Aniga; explanatory copy may say profile-ka', () => {
    // Naming review 23 Aug: the hub, and anything that acts on your own hub,
    // is Aniga ("me"). Body copy and tooltips are free to say profile-ka —
    // that is where the word gets explained. What is NOT allowed is a third
    // word ("bogga" / the page) on a control.
    for (const key of [
      'action.editProfile',
      'onboarding.completeProfile',
      'profile.managerTitle',
      'settings.hubProfile',
      'nav.profile',
    ] as const) {
      expect(so[key], `${key} is a control on your own hub — it must say Aniga`).toContain('Aniga');
      expect(so[key], `${key} must not fall back to "bogga"`).not.toMatch(/bog/i);
    }
  });

  it('Codsi lifecycle vocabulary (Codsi Detail 1a–3b): Furan → Waa la caawinayaa → La xaliyay', () => {
    expect(so['plaza.askOpen']).toBe('Furan');
    expect(so['plaza.askInProgress']).toBe('Waa la caawinayaa');
    expect(so['plaza.askFulfilled']).toBe('La xaliyay');
  });
});

describe('the two label sets stay separate (naming review 23 Aug)', () => {
  /**
   * Ruling: minimal bleed between the two language settings. A word crosses
   * over only if it has no equivalent, is a brand in its own right, or simply
   * suits the copy — and then it goes on ALLOWED below, with a reason.
   * Everything else uses its own set's word: EN says Lab / Plaza / Directory /
   * Capital / Messages / Ask / Win / Co-sign / Verified, SO says Warshad /
   * Madal / Suuq / Maal / Fariimo / Codsi / Guul / Garab / Xaqiiq.
   */
  const SOMALI_NOUNS =
    /\b(Warshad\w*|Madal\w*|Suuq|Fariimo|Maal|Aniga|Digniino|Koox|Garab|Guul\w*|Codsi\w*|Xaqiiq\w*|Xawli)\b/;
  const ENGLISH_NOUNS = /\b(Labs?|Plaza|Directory|Capital|Messages|Notifications)\b/;

  /** key → why the crossover earns its place. */
  const ALLOWED: Record<string, string> = {
    // A one-time mode choice: the gloss teaches the term the member will meet
    // the moment they read the app in Somali.
    'consent.liteLabel': 'teaching gloss on the Lite mode name',
  };

  /** Plural forms carry their variants in an object — check every branch. */
  function strings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object')
      return Object.values(value).filter((v) => typeof v === 'string');
    return [];
  }

  function bleeds(dict: Record<string, unknown>, pattern: RegExp): string[] {
    const found: string[] = [];
    for (const [key, value] of Object.entries(dict)) {
      if (key in ALLOWED) continue;
      for (const text of strings(value)) {
        const hit = pattern.exec(text);
        if (hit) found.push(`${key}: "${hit[0]}" in "${text.slice(0, 60)}"`);
      }
    }
    return found;
  }

  it('no Somali brand noun appears in an English string', () => {
    expect(bleeds(en as Record<string, unknown>, SOMALI_NOUNS)).toEqual([]);
  });

  it('no English section noun appears in a Somali string', () => {
    expect(bleeds(so as Record<string, unknown>, ENGLISH_NOUNS)).toEqual([]);
  });

  it('every crossover on the allowlist carries a stated reason', () => {
    for (const [key, reason] of Object.entries(ALLOWED)) {
      expect(
        en[key as keyof typeof en] ?? so[key as keyof typeof so],
        `${key} is not a real key`,
      ).toBeTruthy();
      expect(reason.length, `${key} needs a reason, not an empty string`).toBeGreaterThan(10);
    }
  });
});

describe('language identity', () => {
  it('is Somali-first', () => {
    expect(DEFAULT_LOCALE).toBe('so');
    expect(LOCALES[0]).toBe('so');
  });

  it('toggle language names per naming review 5 Jul: short/brandable "Somali" over "Soomaali"', () => {
    expect(LOCALE_NAMES.so).toBe('Somali');
    expect(LOCALE_NAMES.en).toBe('English');
  });
});
