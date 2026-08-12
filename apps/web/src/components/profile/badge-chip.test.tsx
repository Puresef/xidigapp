import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { badgePrefix, badgeVariant, toAnigaBadge, type AnigaBadge } from '@/lib/aniga/badges';

import { BadgeChip } from './badge-chip';

/**
 * Badge canon acceptance (ruling 10 / A9–A11). Three laws, all structural —
 * a style regression must fail here, not in review:
 *
 *  a) the prefix glyph encodes the class, and ROLES ARE NEUTRAL — orange on a
 *     role would turn a position in the community into a prize;
 *  b) inline (≤20px) surfaces render the Xaqiiqeysan check or nothing, so a
 *     milestone chip in a feed byline is impossible to build, not just
 *     discouraged;
 *  c) Garab ×5/×25/×100 are ONE badge — no bronze/silver/gold, no rank, no
 *     progress-to-next. Tiers describe what happened; they never rank members.
 */

function render(props: Parameters<typeof BadgeChip>[0]): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'so',
      children: createElement(BadgeChip, props),
    }),
  );
}

function badge(slug: string, badgeClass: AnigaBadge['badgeClass'], tier?: string): AnigaBadge {
  const built = toAnigaBadge(slug, badgeClass, tier ?? null);
  if (!built) throw new Error(`no badge for ${slug}`);
  return built;
}

const IDENTITY = badge('identity-verified', 'identity');
const EARNED = badge('top-helper', 'earned');
const TENURE = badge('founding-member', 'tenure');
const ROLE = badge('lab-lead', 'role');

describe('badge class → prefix + variant (ruling 10a)', () => {
  it('the prefix glyph encodes the class', () => {
    expect(badgePrefix(IDENTITY)).toBe('check');
    expect(badgePrefix(EARNED)).toBe('star');
    expect(badgePrefix(TENURE)).toBe('none');
    expect(badgePrefix(ROLE)).toBe('none');
  });

  it('identity chips lead with the check, earned chips with the guul star', () => {
    // The check is the canon path; the star is the D3 guul glyph, which owns
    // the only default-orange tone in the family.
    expect(render({ badge: IDENTITY })).toContain('M5 13l4 4L19 7');
    expect(render({ badge: EARNED })).toContain('x-ic--trust');

    // Tenure and role carry no glyph at all — the label is the whole badge.
    expect(render({ badge: TENURE })).not.toContain('<svg');
    expect(render({ badge: ROLE })).not.toContain('<svg');
  });

  it('ROLES ARE NEVER ORANGE — every other class is a trust moment', () => {
    expect(badgeVariant(ROLE)).toBe('neutral');
    for (const b of [IDENTITY, EARNED, TENURE]) {
      expect(badgeVariant(b)).toBe('trust');
    }

    const roleHtml = render({ badge: ROLE });
    expect(roleHtml).toContain('xidig-tag');
    expect(roleHtml).not.toContain('xidig-tag--trust');
    // Not just the class: no orange reaches a role by any other route either.
    expect(roleHtml).not.toContain('x-ic--trust');
    expect(roleHtml).not.toContain('trust');

    expect(render({ badge: TENURE })).toContain('xidig-tag--trust');
  });

  it('renders the canon Somali label, not the English definition name', () => {
    expect(render({ badge: ROLE })).toContain('Hoggaamiye Warshad');
    expect(render({ badge: IDENTITY })).toContain('Xaqiiqeysan');
  });

  it('carries the earning criterion on the tooltip where the canon spells one out', () => {
    expect(render({ badge: TENURE })).toContain('500-tii xubnood');
    // A badge with no written criterion gets no tooltip rather than an invented
    // one — an unfalsifiable claim is the thing this profile must not ship.
    expect(toAnigaBadge('early-backer', 'earned')?.tooltipKey).toBeNull();
    expect(render({ badge: badge('early-backer', 'earned') })).not.toContain('title=');
  });
});

describe('inline law: ≤20px surfaces are check-only (ruling 10b / A10)', () => {
  it('renders the Xaqiiqeysan check as a round disc, named for AT', () => {
    const html = render({ badge: IDENTITY, size: 'inline' });
    expect(html).toContain('xidig-badge-check');
    expect(html).toContain('M5 13l4 4L19 7');
    expect(html).toContain('aria-label="Xaqiiqeysan"');
    // The disc is the badge, so it must not also be a chip.
    expect(html).not.toContain('xidig-tag');
  });

  it('returns null for every non-identity class — a milestone byline cannot be built', () => {
    for (const b of [EARNED, TENURE, ROLE, badge('garab-milestone', 'earned', '100')]) {
      expect(render({ badge: b, size: 'inline' }), b.slug).toBe('');
    }
  });
});

describe('Garab tiers are one badge (ruling 10c / A11)', () => {
  const TIERS = ['5', '25', '100'] as const;
  const rendered = TIERS.map((tier) => render({ badge: badge('garab-milestone', 'earned', tier) }));

  it('every tier renders the identical element structure and className', () => {
    // Digits are the ONLY permitted difference: blank them and the three
    // markups must be byte-identical. This catches a tier-specific class, an
    // extra rank element, or a progress node in one shot.
    const [first, ...rest] = rendered.map((html) => html.replace(/\d+/g, 'N'));
    for (const html of rest) expect(html).toBe(first);
  });

  it('shows the threshold as a bare number, with no ladder vocabulary', () => {
    TIERS.forEach((tier, i) => {
      expect(rendered[i]).toContain(`Garab ×${tier}`);
    });
    for (const html of rendered) {
      expect(html.toLowerCase()).not.toMatch(/bronze|silver|gold|rank|next|level|progress/);
    }
  });

  it('refuses to build a tier badge without its threshold', () => {
    // Otherwise the `{count}` placeholder would reach the DOM.
    expect(toAnigaBadge('garab-milestone', 'earned', null)).toBeNull();
  });
});

describe('slug map', () => {
  it('drops an unmapped slug instead of leaking the English DB name', () => {
    expect(toAnigaBadge('some-future-badge', 'role')).toBeNull();
  });
});
