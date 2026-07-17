import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Avatar, AVATAR_PALETTE } from './avatar';

/**
 * The 0-byte initials disc (§22 low-bandwidth identity) after the duotone
 * brand-palette upgrade (brand-rethink adoption, 17 Jul 2026). The contrast
 * suite is the regression GATE for the palette: white initials must hold
 * WCAG ≥ 4.5:1 against both stops of every pair — a future recolor that
 * lightens a stop fails here, not in production.
 */

// A hash the shipped blurhash suite proves valid (blurhash.test.ts:35).
const VALID_BLURHASH = 'LyI5Xw39a|%0uuRnfQnSf7fQfQfQ';

function render(props: Parameters<typeof Avatar>[0]): string {
  return renderToStaticMarkup(createElement(Avatar, props));
}

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio of white text against a solid #rrggbb background. */
function whiteContrast(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

describe('Avatar initials disc', () => {
  it('renders initials on a duotone linear-gradient when no src exists', () => {
    const html = render({ name: 'Ayaan Warsame', handle: 'ayaan' });
    expect(html).toContain('linear-gradient(135deg');
    expect(html).toContain('AW');
    expect(html).toContain('xidig-avatar--initials');
  });

  it('is deterministic per handle and varies across handles', () => {
    const first = render({ name: 'A B', handle: 'ayaan' });
    const again = render({ name: 'A B', handle: 'ayaan' });
    expect(again).toBe(first);

    // Probe handles until one lands on a different palette index — the
    // mapping is hash-based, so assert variation exists rather than pinning
    // specific indices.
    const backgroundOf = (html: string) =>
      /background:([^;]+)/.exec(html)?.[1] ?? '';
    const base = backgroundOf(first);
    const probes = ['hodan', 'liibaan', 'sagal', 'warsame', 'idil', 'zahra', 'faarax', 'x1'];
    expect(
      probes.some((h) => backgroundOf(render({ name: 'A B', handle: h })) !== base),
    ).toBe(true);
  });

  it('GATE: every palette stop holds >= 4.5:1 for white initials', () => {
    for (const { from, to } of AVATAR_PALETTE) {
      expect(whiteContrast(from), `white on ${from}`).toBeGreaterThanOrEqual(4.5);
      expect(whiteContrast(to), `white on ${to}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the blurhash branch a FLAT darkened wash, not a gradient', () => {
    const html = render({ name: 'A B', handle: 'ayaan', blurhash: VALID_BLURHASH });
    expect(html).not.toContain('linear-gradient');
    expect(html).toMatch(/background:rgb\(/);
  });

  it('renders the image branch when src is present under default prefs', () => {
    const html = render({ name: 'A B', handle: 'ayaan', src: 'https://cdn.test/x.webp' });
    expect(html).toContain('<img');
    expect(html).not.toContain('xidig-avatar--initials');
  });
});
