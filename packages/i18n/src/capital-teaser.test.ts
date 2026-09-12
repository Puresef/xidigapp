import { describe, expect, it } from 'vitest';

import { en } from './dictionaries/en';
import { so } from './dictionaries/so';

/**
 * The /capital/candidates teaser is the last surface that still described the
 * retired invest funnel as current ("Today Xidig captures intent only") after
 * A2 removed intent capture. It renders twice from one key — the signed-out
 * hero paragraph AND the route's <meta description> — so the dictionary pin
 * here covers both, and the source assertion below keeps that coupling honest.
 *
 * Xidig does not offer investment, does not capture investment intent, and
 * makes no promise about activating it later. The only member actions the
 * copy may point at are the ones that exist on a candidate: "I can help" and
 * the support action — ENGLISH "Support", provisional SOMALI "Taageer"
 * (owner-edited PRD Relook §24, 12 Sep; supersedes the interim "Show support"
 * and the bare "Garab"). The control says the same (term.garab /
 * action.garab, pinned by vocabulary.test.ts), so prose and button agree; the
 * assertions below stop the retired "co-sign" and "show support" returning.
 *
 * The route-coupling half of this pin — that /capital/candidates still reads
 * this ONE key for both its hero and its <meta description>, so a dictionary
 * assertion keeps covering the metadata surface — lives in
 * apps/web/src/app/capital/candidates/teaser-copy.test.ts: it reads the page
 * source, and node builtins are not typed in this package.
 */

const KEY = 'marketing.capitalTeaserBody';

describe('capital teaser says investing is not offered', () => {
  it('EN states investing is not offered and names only real actions', () => {
    const text = String(en[KEY]);
    expect(text).toContain('Investing is not offered on Xidig');
    expect(text).toContain('offer help');
    expect(text).toContain('support the work');
    expect(text).not.toMatch(/show support/i);
    expect(text).not.toContain('co-sign');
  });

  it('SO twin carries the same statement (provisional pending native review)', () => {
    const text = String(so[KEY]);
    expect(text).toContain('Maalgashi laguma bixiyo Xidig');
    expect(text).toContain('caawin');
    expect(text).toContain('taageer');
  });

  it.each([
    ['EN', () => String(en[KEY])],
    ['SO', () => String(so[KEY])],
  ])('%s makes none of the retired or forbidden claims', (_locale, read) => {
    const text = read().toLowerCase();
    // Retired: intent capture existed once; it does not now.
    expect(text).not.toMatch(/intent|ujeeddo keliya|diiwaangeli/);
    // Forbidden: no future activation, no eligibility, no returns, no diligence.
    // (The stems take \w* so "eligibility"/"returns" match: a bare \beligib\b
    // never matched a real word, and the lock was dead until 12 Sep.)
    expect(text).not.toMatch(
      /\b(soon|later|coming|will (open|launch|activate)|eligib\w*|returns?|due diligence|vetted)\b/,
    );
    expect(text).not.toMatch(/dhawaan|hadhow|mustaqbal/);
  });
});
