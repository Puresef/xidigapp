import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
 * co-sign (Garab).
 */

const KEY = 'marketing.capitalTeaserBody';

describe('capital teaser says investing is not offered', () => {
  it('EN states investing is not offered and names only real actions', () => {
    const text = String(en[KEY]);
    expect(text).toContain('Investing is not offered on Xidig');
    expect(text).toContain('offer help');
    expect(text).toContain('co-sign');
  });

  it('SO twin carries the same statement (provisional pending native review)', () => {
    const text = String(so[KEY]);
    expect(text).toContain('Maalgashi laguma bixiyo Xidig');
    expect(text).toContain('caawin');
    expect(text).toContain('garab');
  });

  it.each([
    ['EN', () => String(en[KEY])],
    ['SO', () => String(so[KEY])],
  ])('%s makes none of the retired or forbidden claims', (_locale, read) => {
    const text = read().toLowerCase();
    // Retired: intent capture existed once; it does not now.
    expect(text).not.toMatch(/intent|ujeeddo keliya|diiwaangeli/);
    // Forbidden: no future activation, no eligibility, no returns, no diligence.
    expect(text).not.toMatch(
      /\b(soon|later|coming|will (open|launch|activate)|eligib|return|due diligence|vetted)\b/,
    );
    expect(text).not.toMatch(/dhawaan|hadhow|mustaqbal/);
  });

  it('the route reads this one key for both the hero and the page description', () => {
    // If someone hard-codes a separate description, the pin above stops
    // covering the metadata surface — fail loudly.
    const page = readFileSync(
      fileURLToPath(
        new URL('../../../apps/web/src/app/capital/candidates/page.tsx', import.meta.url),
      ),
      'utf8',
    );
    const uses = page.match(/t\('marketing\.capitalTeaserBody'\)/g) ?? [];
    expect(uses.length).toBe(2);
    expect(page).toMatch(/description:\s*t\('marketing\.capitalTeaserBody'\)/);
  });
});
