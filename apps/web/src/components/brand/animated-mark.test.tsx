import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnimatedMark } from './animated-mark';

/**
 * AnimatedMark contract (mark-redesign spec §4): final-frame base state,
 * decorative layers hidden from the tree, and — the load-bearing gate —
 * the component's geometry must stay byte-identical to the canonical
 * apps/web/src/app/icon.svg (C2). An icon change without a component change
 * fails here, not in production chrome.
 */

function render(props: Parameters<typeof AnimatedMark>[0]): string {
  return renderToStaticMarkup(createElement(AnimatedMark, props));
}

describe('AnimatedMark', () => {
  it('renders an accessible img when labelled', () => {
    const html = render({ mode: 'static', label: 'Xidig' });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Xidig"');
  });

  it('renders decorative (aria-hidden, no role) when unlabelled', () => {
    const html = render({ mode: 'assemble' });
    expect(html.startsWith('<span')).toBe(true);
    expect(html).not.toContain('role="img"');
    expect(/^<span[^>]*aria-hidden="true"/.test(html)).toBe(true);
  });

  it('assemble renders 4 quadrant layers + 2 star halves, all aria-hidden', () => {
    const html = render({ mode: 'assemble', label: 'Xidig' });
    for (const cls of ['__q--1', '__q--2', '__q--3', '__q--4', '__star--r', '__star--l']) {
      expect(html).toContain(`xidig-animark${cls}`);
    }
    // every inner svg is decorative — the wrapper carries the name
    const svgs = html.match(/<svg /g) ?? [];
    const hiddenSvgs = html.match(/<svg [^>]*aria-hidden="true"/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    expect(hiddenSvgs.length).toBe(svgs.length);
  });

  it('ceremony renders two half layers; flap/static render one full mark', () => {
    expect(render({ mode: 'ceremony', label: 'X' }).match(/__half--/g)?.length).toBe(2);
    expect(render({ mode: 'flap', label: 'X' }).match(/<svg /g)?.length).toBe(1);
    expect(render({ mode: 'static', label: 'X' }).match(/<svg /g)?.length).toBe(1);
  });

  it('GATE: geometry is byte-identical to the canonical icon.svg (C2)', () => {
    const icon = readFileSync(
      join(__dirname, '..', '..', 'app', 'icon.svg'),
      'utf8',
    );
    const iconPaths = [...icon.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g)];
    expect(iconPaths.length).toBe(5); // 3 arm paths + 2 woven star halves
    const html = render({ mode: 'static', label: 'Xidig' });
    for (const [, d, fill] of iconPaths) {
      expect(html, `icon path (fill ${fill}) missing from component`).toContain(`d="${d}"`);
      expect(html).toContain(`fill="${fill}"`);
    }
  });
});
