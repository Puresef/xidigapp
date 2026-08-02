import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { XidigIcon } from './XidigIcon';
import { XIDIG_ICONS, XIDIG_ICON_DEFAULT_TONE, XIDIG_POST_TYPE_ICON } from './paths';

/**
 * D3 glyph family contract (docs/d3-icon-handoff): decorative-by-default a11y,
 * Guul's orange declared in ONE map, the post-type map covering every plaza
 * type, and the garab smoke opt-in — its motion gate lives in the CSS.
 */

function render(props: Parameters<typeof XidigIcon>[0]): string {
  return renderToStaticMarkup(createElement(XidigIcon, props));
}

describe('XidigIcon', () => {
  it('renders decorative (aria-hidden, no role) without a label', () => {
    const html = render({ name: 'war' });
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role=');
  });

  it('renders role="img" with the resolved label when it carries meaning alone', () => {
    const html = render({ name: 'garab', label: 'Garab' });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Garab"');
    expect(html).not.toContain('aria-hidden');
  });

  it('Guul is the ONLY glyph defaulting to trust orange (§2 one-map rule)', () => {
    for (const name of Object.keys(XIDIG_ICON_DEFAULT_TONE) as (keyof typeof XIDIG_ICON_DEFAULT_TONE)[]) {
      expect(XIDIG_ICON_DEFAULT_TONE[name]).toBe(name === 'guul' ? 'trust' : 'inherit');
    }
    expect(render({ name: 'guul' })).toContain('x-ic--trust');
    // …and an explicit inherit (the chip case) overrides the default.
    expect(render({ name: 'guul', tone: 'inherit' })).not.toContain('x-ic--trust');
  });

  it('post-type map covers every plaza type with a real glyph, garab excluded', () => {
    expect(Object.keys(XIDIG_POST_TYPE_ICON).sort()).toEqual(
      ['ask', 'intro', 'poll', 'update', 'win'].sort(),
    );
    for (const glyph of Object.values(XIDIG_POST_TYPE_ICON)) {
      expect(XIDIG_ICONS[glyph]).toBeDefined();
      expect(glyph).not.toBe('garab'); // garab is an act, not a post type
    }
  });

  it('garab smoke animates only via the opt-in class (base markup stays static)', () => {
    const lit = render({ name: 'garab', variant: 'filled', animateSmoke: true });
    const still = render({ name: 'garab', variant: 'filled' });
    expect(lit).toContain('x-ic-smk--on');
    expect(still).toContain('x-ic-smk'); // wisps exist…
    expect(still).not.toContain('x-ic-smk--on'); // …but never animate un-opted
    // Outline (unlit) has no smoke at all.
    expect(render({ name: 'garab', variant: 'outline' })).not.toContain('x-ic-smk');
  });

  it('every glyph stays within the ≤2KB budget in both variants', () => {
    for (const name of Object.keys(XIDIG_ICONS) as (keyof typeof XIDIG_ICONS)[]) {
      for (const variant of ['outline', 'filled'] as const) {
        const bytes = new TextEncoder().encode(render({ name, variant })).length;
        expect(bytes, `${name}/${variant} = ${bytes}B`).toBeLessThanOrEqual(2048);
      }
    }
  });
});
