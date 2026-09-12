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
    // Owner doctrine (12 Sep): Xidig Plus is patronage, resource and convenience
    // ONLY. EVERY value in EITHER locale that names Xidig Plus is checked, not a
    // hand-picked list. None may pair it with a forbidden power. The one
    // exception is the explicit "does not buy …" sentence, which is removed
    // before matching.
    const flatten = (v: unknown): string =>
      typeof v === 'string' ? v : Object.values(v as Record<string, string>).join(' ');
    const EN_DISCLAIMER =
      'does not buy trust, verification, ranking, governance rights or capital access';
    const SO_DISCLAIMER = 'ma iibsato kalsooni, xaqiijin, kaalin, xuquuq maamul, ama helitaan maal';
    // Power nouns AND gating verbs: "Current access requires Xidig Plus" or
    // "Needs Xidig Plus" must fail just as "unlocks Labs" does.
    const EN_FORBIDDEN =
      /\b(Labs?|candidates?|vot(e|es|ing)|governance|capital|trust|verif\w*|ranking|unlock\w*|credib\w*|requires?|needs?|eligib\w*|access)\b/i;
    const SO_FORBIDDEN =
      /(Warshad|musharax|codbixin|\bcod\b|maamul|maalgash|kalsooni|xaqiijin|furta|u baahan|xaq-u-yeelash|helitaan)/i;
    // Guard the guard: the pre-slice texts this lock exists to stop must fail it.
    for (const old of [
      'Eligibility is under review. Current access requires Xidig Plus.',
      'Serious — a charter-backed venture track. Needs Xidig Plus.',
      'Xidig Plus membership — which unlocks creating Labs, putting candidates forward',
    ]) {
      expect(old).toMatch(EN_FORBIDDEN);
    }
    for (const old of [
      'Abuurista Warshad waxay u baahan tahay Xidig Plus.',
      'Helitaanka hadda wuxuu u baahan yahay Xidig Plus.',
    ]) {
      expect(old).toMatch(SO_FORBIDDEN);
    }
    let checked = 0;
    for (const [key, value] of Object.entries(en)) {
      const text = flatten(value);
      if (!text.includes('Xidig Plus')) continue;
      checked++;
      expect(text.replace(EN_DISCLAIMER, ''), key).not.toMatch(EN_FORBIDDEN);
    }
    for (const [key, value] of Object.entries(so)) {
      const text = flatten(value);
      if (!text.includes('Xidig Plus')) continue;
      checked++;
      expect(text.replace(SO_DISCLAIMER, ''), key).not.toMatch(SO_FORBIDDEN);
    }
    expect(checked).toBeGreaterThanOrEqual(6); // teaser, plan title/body, ToS × 2 locales
    for (const key of [
      'marketing.membershipTeaserBody',
      'marketing.memberSupporterBody',
    ] as const) {
      expect(en[key]).toContain(EN_DISCLAIMER);
      expect(so[key]).toContain(SO_DISCLAIMER);
    }
  });

  it('paused governance/escalation copy is neutral: "under review", never the paid tier or an upgrade', () => {
    // Candidate voting, candidate submission, Lab creation/promotion and the
    // Venture stage are PAUSED for everyone (owner, 12 Sep: "pause, don't
    // broaden"). Their copy says so neutrally.
    expect(en['capital.voteHeading']).toBe('Candidate vote');
    expect(en['capital.voteEligibilityNote']).toBe(
      'Candidate voting is paused while eligibility is under review.',
    );
    const PAUSED_KEYS = [
      'capital.voteEligibilityNote',
      'capital.submitHint',
      'lab.modeLabHint',
      'lab.createSupporterNote',
      'lab.settingsPromoteHint',
      'error.labEligibilityUnderReview',
      'error.putForwardUnderReview',
      'error.venturePromotionUnderReview',
      'error.voteEligibilityUnderReview',
      'maal.indexSubtitle',
      'notif.ventureDemoted',
      'error.ledgerLocked',
      'capital.emptyBody',
      'capital.editSubtitle',
    ] as const;
    for (const key of PAUSED_KEYS) {
      expect(en[key], key).toMatch(/paused while eligibility is under review/);
      expect(en[key], key).not.toMatch(/Xidig Plus|upgrade|\$1|requires/i);
      expect(so[key], key).toMatch(/waa la hakiyay/);
      expect(so[key], key).not.toMatch(/Xidig Plus|kor u qaad|\$1|u baahan/i);
    }
    // The retired upsell and the Lab-creation refusal text are gone for good.
    expect('action.upgradeSupporter' in en).toBe(false);
    expect('error.notSupporter' in en).toBe(false);
    // A ballot option must not borrow the support action's word.
    expect(en['capital.voteApproveDesc']).not.toMatch(/support/i);
  });

  it('no copy promises a paused flow (Lab promotion, re-promotion, submission, member vote)', () => {
    // Paused for everyone (owner, 12 Sep). A surface may describe the pause,
    // never invite the paused action.
    const EN_PROMISES =
      /promote it (again|to a Lab)|grow your Lab into a Venture|submit for review|When Labs submit|reopens if the space|face a member vote|Strong Labs can put|upgrade for higher limits|returns to being a Venture|When they are ready, they show up here/i;
    const SO_PROMISES =
      /mar kale u dallaci|u dallacsii Warshad|ka dibna u gudbi dib-u-eegis|u kordhi Maal|heerkaaga kor u qaad|kor u qaad \$1|dib u noqonaysaa Maal/i;
    for (const [key, value] of Object.entries(en)) {
      const text = typeof value === 'string' ? value : Object.values(value).join(' ');
      expect(text, key).not.toMatch(EN_PROMISES);
    }
    for (const [key, value] of Object.entries(so)) {
      const text = typeof value === 'string' ? value : Object.values(value).join(' ');
      expect(text, key).not.toMatch(SO_PROMISES);
    }
  });

  it('no copy promises an automatic timeout demotion, and none invites a new capital need (owner, 12 Sep)', () => {
    // Both are paused. Warnings sent before the pause render with today's
    // dictionary, so no string may still threaten a return to Lab stage.
    const EN_DEMOTION =
      /returns (it )?to (being )?a Lab (automatically|if)|returns the stage to a Lab automatically|returns to Lab stage unless|timeout limit returns|will return to (the )?Lab/i;
    const SO_DEMOTION =
      /si toos ah u(gu)? celinaya Warshad|ku noqo(taa|naysaa) Warshad haddii|xadka waqti-dhaafka ayaa/i;
    const EN_NEED_INVITE = /declare (a|the|your) (capital )?need|record (a|the|your) need/i;
    for (const [key, value] of Object.entries(en)) {
      const text = typeof value === 'string' ? value : Object.values(value).join(' ');
      expect(text, key).not.toMatch(EN_DEMOTION);
      expect(text, key).not.toMatch(EN_NEED_INVITE);
    }
    for (const [key, value] of Object.entries(so)) {
      const text = typeof value === 'string' ? value : Object.values(value).join(' ');
      expect(text, key).not.toMatch(SO_DEMOTION);
    }

    const flat = (v: unknown) => (typeof v === 'string' ? v : Object.values(v as object).join(' '));
    for (const key of [
      'maal.indexLaw',
      'maal.dormantNotice',
      'maal.dormantFooter',
      'notif.ventureDemotionWarning',
    ] as const) {
      expect(flat(en[key]), key).toMatch(/while the stage rules are under review/);
      expect(flat(so[key]), key).toMatch(/xeerarka heerarka dib loo eegayo/);
    }
    for (const key of ['error.capitalPathwayUnderReview', 'maal.worksNeed'] as const) {
      expect(en[key], key).toMatch(/paused while the capital pathway is under review/);
      expect(en[key], key).not.toMatch(/Xidig Plus|upgrade|\$1|requires|invest/i);
      expect(so[key], key).toMatch(/waa la hakiyay/);
      expect(so[key], key).not.toMatch(/Xidig Plus|kor u qaad|\$1|u baahan/i);
    }
  });

  it('the ToS fees clause no longer promises forbidden powers (interim wording, legal review pending)', () => {
    // Only the "which unlocks …" claim was removed. The legal wording and the
    // TERMS_VERSION bump belong to legal review. Neither is claimed final.
    for (const text of [en['marketing.termsFeesBody'], so['marketing.termsFeesBody']]) {
      expect(text).toContain('Xidig Plus');
      expect(text).not.toMatch(/unlock|\bLabs?\b|candidates?|voting|governance/i);
      expect(text).not.toMatch(/furta|Warshad|musharax|codbixin|maamul/i);
    }
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
   * tier "Xidig Plus" is a brand in its own right and reads the same in both.
   */
  const SOMALI_NOUNS =
    /\b(Warshad\w*|Madal\w*|Suuq|Fariimo|Maal|Aniga|Digniino|Koox|Garab|Taageer\w*|Guul\w*|Codsi\w*|Xaqiiq\w*|Xawli)\b/;
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
