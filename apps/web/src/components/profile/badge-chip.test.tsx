import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import {
  ANIGA_BADGE_LABEL_KEYS,
  ANIGA_BADGE_TOOLTIP_KEYS,
  RETIRED_BADGE_SLUGS,
  badgePrefix,
  badgeVariant,
  toAnigaBadge,
  type AnigaBadge,
} from '@/lib/aniga/badges';

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
 *  c) a retired badge renders nothing: the Garab milestone ("Co-sign ×N",
 *     "verified thanks") mixed the support signal with verified helper credit
 *     and was never granted, so it is retired (Packet B follow-up).
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
    for (const b of [EARNED, TENURE, ROLE]) {
      expect(render({ badge: b, size: 'inline' }), b.slug).toBe('');
    }
  });
});

describe('the Garab milestone badge is retired (Packet B follow-up)', () => {
  it('builds no badge at any tier, so a stray user_badges row renders nothing', () => {
    for (const tier of ['5', '25', '100', null]) {
      expect(toAnigaBadge('garab-milestone', 'earned', tier)).toBeNull();
    }
  });

  it('is listed as retired with a stated reason, and has no label or tooltip key', () => {
    expect(RETIRED_BADGE_SLUGS['garab-milestone']?.length).toBeGreaterThan(10);
    expect(ANIGA_BADGE_LABEL_KEYS['garab-milestone']).toBeUndefined();
    expect(ANIGA_BADGE_TOOLTIP_KEYS['garab-milestone']).toBeUndefined();
  });

  it('retiring it does not touch the live helper-credit badge', () => {
    expect(render({ badge: EARNED })).toContain('xidig-tag');
  });
});

describe('slug map', () => {
  it('drops an unmapped slug instead of leaking the English DB name', () => {
    expect(toAnigaBadge('some-future-badge', 'role')).toBeNull();
  });
});
