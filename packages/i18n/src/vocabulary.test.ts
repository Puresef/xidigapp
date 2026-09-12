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
  // EN nav follows the 12 Sep owner naming direction (Plaza-as-nav and
  // Lab-as-default retired). The SO side deliberately does NOT mirror it
  // (no-bleed doctrine, 23 Aug): Madal/Warshad stay until the Space/Group/
  // Project + Community meaning review picks the SO terms.
  const canonical = [
    ['nav.home', 'Home', 'Hoy'],
    ['nav.plaza', 'Community', 'Madal'],
    ['nav.labs', 'Projects', 'Warshad'],
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
  it('the support action is "Support" / provisional "Taageer" (owner-edited PRD Relook §24, 12 Sep)', () => {
    // Supersedes the interim "Show support" (Packet B) and the bare "Garab" of
    // the 23 Aug naming review. `garab` survives only as the internal key name.
    expect(en['term.garab']).toBe('Support');
    expect(en['action.garab']).toBe('Support');
    expect(so['term.garab']).toBe('Taageer');
    expect(so['action.garab']).toBe('Taageer');
  });

  it('the support control has one three-state vocabulary: Support → Supporting → Remove support', () => {
    expect(en['action.garab']).toBe('Support');
    expect(en['action.garabActive']).toBe('Supporting');
    expect(en['action.garabRemove']).toBe('Remove support');
    // SO active/remove are PROVISIONAL pending the native review (G34).
    expect(so['action.garabActive']).toBe('La taageeray');
    expect(so['action.garabRemove']).toBe('Ka noqo taageerada');
  });

  it('support counts read as people, not a score ("12 people support this" / "12 qof ayaa taageeray")', () => {
    expect(en['action.garabCount'].one).toBe('{count} person supports this');
    expect(en['action.garabCount'].other).toBe('{count} people support this');
    expect(so['action.garabCount']?.other).toBe('{count} qof ayaa taageeray');
  });

  it('no current user-facing string uses the interim "Show support" or Garab as the support label', () => {
    for (const [dict, name] of [
      [en, 'en'],
      [so, 'so'],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        const texts = typeof value === 'string' ? [value] : Object.values(value as object);
        for (const text of texts) {
          if (typeof text !== 'string') continue;
          expect(text, `${name} ${key}`).not.toMatch(/show support/i);
        }
      }
    }
    // "Garab" as a word is gone from the Somali support cluster; the only
    // survivor is the idiom "isu garab istaagaan" (stand shoulder to
    // shoulder) in a sentence — not a label.
    const garabKeys = Object.entries(so)
      .filter(([, v]) => typeof v === 'string' && /\bgarab/i.test(v))
      .map(([k]) => k);
    expect(garabKeys).toEqual(['home.communityProof']);
  });

  it('the paid tier is "Xidig Plus" — "Supporter" is gone from both locales', () => {
    // Owner-edited PRD Relook §24: Xidig Plus = paid patronage + resource/
    // convenience allowances. Not "Taageere" in Somali (that now reads as the
    // support ACTION; native paid-tier naming is gated).
    for (const [dict, name] of [
      [en, 'en'],
      [so, 'so'],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        const texts = typeof value === 'string' ? [value] : Object.values(value as object);
        for (const text of texts) {
          if (typeof text !== 'string') continue;
          expect(text, `${name} ${key}`).not.toMatch(/\bsupporters?\b/i);
          // Early Backer is legal/historical capital territory (owner ruling:
          // leave it unchanged); its SO "Taageere Hore" is not the paid tier.
          // Flagged: it now collides with the support action's word.
          if (name === 'so' && key !== 'profile.badgeEarlyBacker') {
            expect(text, `so ${key}`).not.toMatch(/taageer(e|aha|uhu)\b/i);
          }
        }
      }
    }
    expect(en['marketing.memberSupporterTitle']).toContain('Xidig Plus');
    expect(so['marketing.memberSupporterTitle']).toContain('Xidig Plus');
  });

  it('Xidig Plus copy never sells trust, verification, ranking, governance, candidates, Labs or capital', () => {
    // Owner ruling 12 Sep: value-proposition copy may name only real,
    // allowed benefits, and says what Plus does NOT buy.
    for (const key of [
      'marketing.membershipTeaserBody',
      'marketing.memberSupporterBody',
    ] as const) {
      const text = en[key];
      expect(text).not.toMatch(
        /governance vot|voting in|putting candidates|creating Labs|Lab creation|unlocks/i,
      );
      expect(text).toContain(
        'does not buy trust, verification, ranking, governance rights or capital access',
      );
    }
    // Where mechanics still gate a governance action, copy states a temporary
    // eligibility constraint — never "Xidig Plus vote".
    expect(en['capital.voteHeading']).toBe('Candidate vote');
    expect(en['capital.voteEligibilityNote']).toBe(
      'Eligibility is under review. Current access requires Xidig Plus.',
    );
    expect(en['capital.voteNotEligible']).toBe('Not currently eligible');
    expect(en['capital.submitHint']).toContain('Eligibility is under review');
    // A ballot option must not borrow the support action's word.
    expect(en['capital.voteApproveDesc']).not.toMatch(/support/i);
  });

  it('the ToS fees clause is renamed only — its legal meaning is left for legal review', () => {
    expect(en['marketing.termsFeesBody']).toContain('Xidig Plus membership — which unlocks');
  });

  it('the support note says what support is NOT — never an investment, vote, rating or check of work', () => {
    const note = en['action.garabNote'];
    for (const word of ['investment', 'vote', 'rating', 'check']) expect(note).toContain(word);
    // The retired count-after-you-take-part promise must not come back.
    expect(note).not.toMatch(/take part|shows only|unlock/i);
  });

  it('no English UI string calls the support control "Co-sign"', () => {
    /**
     * key → why "co-sign" legitimately remains. Anything else naming the
     * support control "co-sign" in English is a regression to the retired
     * Tracker Seq 51 label.
     */
    const DISTINCT_CONCEPTS: Record<string, string> = {
      // Maal "marag": witnessing a logged contribution in the venture ledger —
      // a work-record attestation, not the social support signal (Packet B
      // scope ruling: attestations are distinct mechanisms, left unchanged).
      'maal.weightsBody': 'Maal witness attestation (marag), not support',
      'error.attestationRecusal': 'Maal witness attestation (marag), not support',
    };
    const hits: string[] = [];
    for (const [key, value] of Object.entries(en)) {
      const texts = typeof value === 'string' ? [value] : Object.values(value as object);
      if (texts.some((text) => typeof text === 'string' && /co-?sign/i.test(text))) hits.push(key);
    }
    expect(hits.sort()).toEqual(Object.keys(DISTINCT_CONCEPTS).sort());
  });

  it('"backing" is reserved for a future capital context — current-product copy says support or review', () => {
    /**
     * Packet B follow-up ruling: encouragement says "support"; the Candidate
     * process (open review + member vote) says "review"; "back / backing /
     * community-backed" waits for a legally reviewed capital context. key →
     * why the word legitimately remains.
     */
    const RESERVED_OR_UNRELATED: Record<string, string> = {
      'profile.badgeEarlyBacker':
        'capital-era badge; awards stopped (A2), history retained — renaming it is a capital/legal ruling',
      'lab.modeLabHint': '"charter-backed" = grounded in a written charter, not funding',
      'events.cancelReleaseNote': 'phrasal verb "back out" = cancel an RSVP',
      'events.fullReleaseNote': 'phrasal verb "back out" = cancel an RSVP',
    };
    const backing =
      /\b(backs|backing|backed|backers?|back (what|this|each other|the|a|ventures?))\b|community-backed/i;
    const hits: string[] = [];
    for (const [key, value] of Object.entries(en)) {
      const texts = typeof value === 'string' ? [value] : Object.values(value as object);
      if (texts.some((text) => typeof text === 'string' && backing.test(text))) hits.push(key);
    }
    expect(hits.sort()).toEqual(Object.keys(RESERVED_OR_UNRELATED).sort());
  });

  it('the Candidate process reads as review, not as support (support is not a vote)', () => {
    expect(en['capital.timelineSubmitted']).toBe('Submitted for review');
    expect(en['capital.emptyBody']).toContain('put forward for open review');
    expect(en['capital.indexSubtitle']).toBe('Ventures the community is building and supporting.');
    expect(en['marketing.blockCapitalTitle']).toBe('Support what’s being built');
    expect(en['marketing.capitalTeaserTitle']).toBe('Capital — community-supported ventures');
  });

  it('distinct attestation copy keeps its own verb (Maal witness co-sign is untouched)', () => {
    expect(en['maal.weightsBody']).toContain('a co-sign from members or a lead');
    expect(en['error.attestationRecusal']).toBe(
      'You cannot witness your own contribution. Ask a member or a lead to co-sign it.',
    );
  });

  it('Space modes: EN Project ⇄ Group (12 Sep direction — "Lab" reserved for approved programme context); SO Warshad ⇄ Koox pending meaning review', () => {
    expect(en['term.lab']).toBe('Project');
    expect(so['term.lab']).toBe('Warshad');
    expect(en['term.club']).toBe('Group');
    expect(so['term.club']).toBe('Koox');
  });

  it('post types: Win/Guul · Update/War · Poll/Xulasho (12 Sep direction + owner clarification)', () => {
    expect(en['plaza.typeWin']).toBe('Win');
    expect(so['plaza.typeWin']).toBe('Guul');
    expect(en['plaza.typeUpdate']).toBe('Update');
    expect(so['plaza.typeUpdate']).toBe('War');
    expect(en['plaza.typePoll']).toBe('Poll');
    // Not "Cod" (collides with vote/ballot vocabulary) and not "Codbixin"
    // (a formal voting-process word, too long for a casual chip).
    expect(so['plaza.typePoll']).toBe('Xulasho');
  });

  it('the low-bandwidth mode is named "Data Saver" in BOTH locales — never "Lite", never "Xawli yar" (owner, 12 Sep)', () => {
    for (const dict of [en, so]) {
      expect(dict['settings.liteTitle']).toBe('Data Saver');
      expect(dict['consent.liteLabel']).toBe('Data Saver');
    }
    for (const [dict, retired] of [
      [en, 'Lite'],
      [so, 'Xawli'],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        const text = typeof value === 'string' ? value : Object.values(value).join(' ');
        // Internal key names keep "lite"; user-facing copy must not.
        expect(text.includes(retired), `${key} still says "${retired}"`).toBe(false);
      }
    }
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

  it('the short label is explained by the support note in both locales', () => {
    // The 23 Aug "Garab ships bare" rule is superseded (owner-edited PRD §24);
    // what survives is its principle: a short label, meaning in the note.
    expect(so['action.garab']).toBe('Taageer');
    expect(en['action.garabNote'], 'the note must explain Support').toBeTruthy();
    expect(so['action.garabNote'], 'the note must explain Taageer').toContain('Taageer');
  });

  it('the Garab milestone badge copy is retired in both locales (Packet B follow-up)', () => {
    // "Co-sign ×N" / "verified thanks" mixed the support signal with verified
    // helper credit; the badge was never granted. Its display is retired in
    // lib/aniga/badges.ts and the copy must not return.
    for (const key of ['profile.badgeGarabMilestone', 'profile.badgeGarabTooltip']) {
      expect(key in en, key).toBe(false);
      expect(key in so, key).toBe(false);
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
   * Capital / Messages / Ask / Win / Support / Verified, SO says Warshad /
   * Madal / Suuq / Maal / Fariimo / Codsi / Guul / Taageer / Xaqiiq. The paid
   * tier "Xidig Plus" is a brand in its own right and reads the same in both,
   * and so does the "Data Saver" mode name (owner ruling, 12 Sep — the SO
   * "Xawli yar" label is retired; "Xawli" stays on the Somali list below so it
   * can never resurface in English either).
   */
  const SOMALI_NOUNS =
    /\b(Warshad\w*|Madal\w*|Suuq|Fariimo|Maal|Aniga|Digniino|Koox|Garab|Taageer\w*|Guul\w*|Codsi\w*|Xaqiiq\w*|Xawli)\b/;
  const ENGLISH_NOUNS = /\b(Labs?|Plaza|Directory|Capital|Messages|Notifications)\b/;

  /** key → why the crossover earns its place. */
  // Empty since 12 Sep: the only entry was the EN consent gloss teaching the
  // Somali "Xawli yar", retired now that both locales say "Data Saver".
  const ALLOWED: Record<string, string> = {};

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
