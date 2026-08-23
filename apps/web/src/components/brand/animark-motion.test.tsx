import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnimatedMark } from './animated-mark';
import {
  NO_MOTION_SURFACES,
  TRIGGERS,
  createOnceEver,
  createReceiptGuard,
  gatesOpen,
  motionAllowed,
  motionFor,
} from '@/lib/motion-policy';

/**
 * Xidig mark motion — the locked rules of the G1 direction (approved 22 Aug
 * 2026), mirrored from the G3 live acceptance harness ("Xidig Motion G3.dc.html",
 * eight in-browser checks). The harness runs against a real stylesheet in a
 * real browser; this file pins the same rules at the policy, component and
 * CSS-source level, where CI can hold them.
 *
 * The load-bearing claims:
 *   1. every animation rule sits inside the reduced-motion gate;
 *   2. data-motion='off' and data-lite='1' hard-kill the whole rig;
 *   3. finance / Maal / moderation surfaces never mount motion;
 *   4. the trust ring is a pseudo-element — the mark's paths keep their fills;
 *   5. message_sent and the Maal promotions trigger nothing;
 *   6. the approved triggers map exactly as locked;
 *   7. bursts collapse to one flap;
 *   8. celebrate is once-ever.
 */

const GLOBALS = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8',
);

function render(props: Parameters<typeof AnimatedMark>[0]): string {
  return renderToStaticMarkup(createElement(AnimatedMark, props));
}

/** The G3 motion block: everything from its banner to the last new keyframe. */
function motionBlock(): string {
  const start = GLOBALS.indexOf(' * Xidig mark motion — G1 direction approved 22 Aug 2026');
  expect(start).toBeGreaterThan(-1);
  const end = GLOBALS.indexOf('/* Mount alignment:', start);
  expect(end).toBeGreaterThan(start);
  return GLOBALS.slice(start, end);
}

describe('CSS gates', () => {
  it('every new animation rule sits inside the prefers-reduced-motion gate', () => {
    const block = motionBlock();
    const gateStart = block.indexOf('@media (prefers-reduced-motion: no-preference) {');
    expect(gateStart).toBeGreaterThan(-1);
    // Walk braces to find the end of the media block, then assert that the
    // only `animation-name:` declarations in the file's new block are inside.
    let depth = 0;
    let gateEnd = -1;
    for (let i = gateStart; i < block.length; i += 1) {
      if (block[i] === '{') depth += 1;
      else if (block[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          gateEnd = i;
          break;
        }
      }
    }
    expect(gateEnd).toBeGreaterThan(gateStart);
    const inside = block.slice(gateStart, gateEnd);
    const outside = block.slice(0, gateStart) + block.slice(gateEnd);
    expect(inside.match(/animation-name:/g)?.length ?? 0).toBeGreaterThan(0);
    expect(outside).not.toMatch(/animation-name:/);
    // The one animation declaration allowed outside is the hard kill.
    const outsideAnimations = outside.match(/^\s*animation:.*$/gm) ?? [];
    expect(outsideAnimations.length).toBe(1);
    expect(outsideAnimations[0]).toMatch(/animation: none !important;/);
  });

  it("data-motion='off' and data-lite='1' both gate and hard-kill the rig", () => {
    const block = motionBlock();
    // Selector gate: no animated selector may be reachable without both.
    const gated = block.match(/html:not\(\[data-motion='off'\]\):not\(\[data-lite='1'\]\)/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(7);
    for (const attr of ["html[data-motion='off']", "html[data-lite='1']"]) {
      expect(block).toContain(`${attr} .xidig-animark,`);
      expect(block).toContain(`${attr} .xidig-animark *,`);
      expect(block).toContain(`${attr} .xidig-animark::before,`);
      expect(block).toContain(`${attr} .xidig-animark::after`);
    }
  });

  it('the rest frame is frame 0 AND frame 100% on every new state', () => {
    const block = motionBlock();
    for (const name of ['idle', 'flap1', 'cel-fold-l', 'cel-fold-r', 'cel-lift']) {
      const at = block.indexOf(`@keyframes xidig-animark-${name} {`);
      expect(at, `@keyframes xidig-animark-${name} missing`).toBeGreaterThan(-1);
    }
    // The glow and the ring are the two pseudo-element states: both must land
    // back on opacity 0, so nothing lingers over the mark.
    for (const name of ['cel-glow', 'cel-ring']) {
      const at = block.indexOf(`@keyframes xidig-animark-${name} {`);
      const frames = block.slice(at, block.indexOf('\n}', at));
      expect(frames.slice(frames.lastIndexOf('100%'))).toMatch(/opacity: 0;/);
    }
  });

  it('the trust ring is a bordered ::after in --x-trust, never a path fill', () => {
    const block = motionBlock();
    expect(block).toContain('.xidig-animark--celebrate.xidig-animark--earned::after');
    expect(block).toContain('border: 2px solid var(--x-trust);');
    // No orange anywhere near the mark's own paths.
    expect(block).not.toMatch(/fill:\s*var\(--x-trust\)/);
  });

  it('durations stay under the locked ceilings (flap ≤ 300ms, celebrate ≤ 2500ms)', () => {
    const block = motionBlock();
    expect(block).toMatch(/--x-motion-flap:\s*(\d+)ms/);
    const flap = Number(/--x-motion-flap:\s*(\d+)ms/.exec(block)![1]);
    const celebrate = Number(/--x-motion-celebrate:\s*(\d+)ms/.exec(block)![1]);
    expect(flap).toBeLessThanOrEqual(300);
    expect(celebrate).toBeLessThanOrEqual(2500);
  });
});

describe('the html gates are server-rendered', () => {
  it('layout.tsx sets data-motion and data-lite on <html>', () => {
    const layout = readFileSync(
      fileURLToPath(new URL('../../app/layout.tsx', import.meta.url)),
      'utf8',
    );
    expect(layout).toContain("{...(motionOff ? { 'data-motion': 'off' } : {})}");
    expect(layout).toContain("{...(liteActive ? { 'data-lite': '1' } : {})}");
  });

  it('gatesOpen reads all three gates and refuses to guess on the server', () => {
    expect(gatesOpen(null)).toBe(false); // no document → the CSS gate decides
    const fake = (attrs: Record<string, string>, reduce = false) =>
      ({
        document: { documentElement: { getAttribute: (k: string) => attrs[k] ?? null } },
        matchMedia: () => ({ matches: reduce }),
      }) as unknown as Window;
    expect(gatesOpen(fake({}))).toBe(true);
    expect(gatesOpen(fake({ 'data-motion': 'off' }))).toBe(false);
    expect(gatesOpen(fake({ 'data-lite': '1' }))).toBe(false);
    expect(gatesOpen(fake({}, true))).toBe(false);
  });
});

describe('surfaces — never animate', () => {
  it('finance / Maal / demotion / moderation surfaces resolve to no motion', () => {
    for (const s of [
      'maal',
      'capital',
      'ledger',
      'finance',
      'compliance',
      'demotion',
      'moderation',
      'report',
      'safety',
      'blocked',
    ]) {
      expect(NO_MOTION_SURFACES).toContain(s);
      expect(motionAllowed(s)).toBe(false);
      expect(motionFor('post_published', s)).toBeNull();
    }
    expect(motionAllowed('MAAL')).toBe(false); // case-insensitive
    expect(motionAllowed('madal')).toBe(true);
    expect(motionAllowed(undefined)).toBe(true);
  });

  it('a gated surface renders the static rest frame, same box', () => {
    const gatedHtml = render({ mode: 'celebrate', surface: 'maal', size: 20 });
    expect(gatedHtml).not.toContain('xidig-animark--celebrate');
    expect(gatedHtml).not.toContain('xidig-animark--earned');
    expect(gatedHtml).toContain('width:20px');
    expect(gatedHtml.match(/<svg /g)?.length).toBe(1); // whole mark, no halves
    for (const mode of ['idle', 'flap', 'loading'] as const) {
      expect(render({ mode, surface: 'ledger', size: 20 })).not.toMatch(/xidig-animark--/);
    }
  });

  it('the capital call sites pass the surface, so the policy enforces it', () => {
    for (const rel of ['../capital/vote-panel.tsx', '../capital/interest-bar.tsx']) {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(src).toContain('surface="capital"');
    }
  });
});

describe('triggers — the locked table', () => {
  it('message sent triggers nothing', () => {
    expect(TRIGGERS.message_sent).toBeNull();
    expect(motionFor('message_sent', 'fariimo')).toBeNull();
  });

  it('Maal promotion / re-promotion never animate', () => {
    expect(motionFor('maal_promotion', 'maal')).toBeNull();
    expect(motionFor('maal_repromotion', 'maal')).toBeNull();
    expect(motionFor('maal_promotion', 'madal')).toBeNull(); // the event, not just the surface
  });

  it('approved flap / celebrate triggers map correctly', () => {
    expect(motionFor('post_published', 'madal')).toBe('flap');
    expect(motionFor('garab_given', 'madal')).toBe('flap');
    expect(motionFor('dm_accepted', 'fariimo')).toBe('flap');
    expect(motionFor('onboarding_complete', 'onboarding')).toBe('celebrate');
    expect(motionFor('first_post', 'madal')).toBe('celebrate');
    expect(motionFor('warshad_created', 'warshad')).toBe('celebrate');
    expect(motionFor('verified_reveal', 'profile')).toBe('celebrate-earned');
    expect(motionFor('founding_reveal', 'profile')).toBe('celebrate-earned');
    expect(motionFor('unknown_event', 'madal')).toBeNull();
  });

  it('frequency guard collapses bulk / retry bursts', () => {
    let t = 0;
    const guard = createReceiptGuard(1200, () => t);
    expect([guard(), guard(), guard(), guard(), guard()]).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    t = 1300;
    expect(guard()).toBe(true);
  });

  it('celebrate is once-ever', () => {
    const once = createOnceEver();
    expect(once.shouldPlay('onboarding_complete')).toBe(true);
    expect(once.shouldPlay('onboarding_complete')).toBe(false);
    expect(once.shouldPlay('first_post')).toBe(true);
    once.reset();
    expect(once.shouldPlay('onboarding_complete')).toBe(true);
  });

  it('Garab is a guarded flap receipt, not a celebration', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../plaza/codsi/garab-button.tsx', import.meta.url)),
      'utf8',
    );
    expect(src).toContain('createReceiptGuard(1200)');
    expect(src).toContain('mode="flap"');
    expect(src).not.toContain('mode="ceremony"');
  });
});

describe('component modes', () => {
  it('maps each mode to its rig class', () => {
    const cls = (mode: NonNullable<Parameters<typeof AnimatedMark>[0]['mode']>) =>
      /class="([^"]+)"/.exec(render({ mode, size: 20 }))![1];
    expect(cls('static')).toBe('xidig-animark');
    expect(cls('assemble')).toContain('xidig-animark--assemble');
    expect(cls('hero')).toContain('xidig-animark--hero');
    expect(cls('idle')).toContain('xidig-animark--idle');
    // the shipped loop keeps its class; only the API name changed
    expect(cls('loading')).toContain('xidig-animark--flap');
    expect(cls('loading')).not.toContain('xidig-animark--flap1');
    expect(cls('flap')).toContain('xidig-animark--flap1');
    expect(cls('celebrate')).toContain('xidig-animark--celebrate');
    expect(cls('ceremony')).toContain('xidig-animark--celebrate'); // legacy alias
  });

  it('earned adds the ring class — by either spelling', () => {
    expect(render({ mode: 'celebrate', earned: true, size: 20 })).toContain(
      'xidig-animark--celebrate xidig-animark--earned',
    );
    expect(render({ mode: 'celebrate-earned', size: 20 })).toContain('xidig-animark--earned');
    expect(render({ mode: 'celebrate', size: 20 })).not.toContain('xidig-animark--earned');
  });

  it('the ring never tints the mark — path fills stay canonical', () => {
    const html = render({ mode: 'celebrate', earned: true, size: 20 });
    const fills = [...html.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    expect(fills.length).toBeGreaterThan(0);
    expect(new Set(fills)).toEqual(new Set(['#0077cc', '#2f3038', '#33343c']));
    expect(html.toLowerCase()).not.toContain('ff8c00');
  });

  it('celebrate renders the two fold halves; flap and loading render one mark', () => {
    expect(render({ mode: 'celebrate', size: 20 }).match(/__half--/g)?.length).toBe(2);
    expect(render({ mode: 'flap', size: 20 }).match(/<svg /g)?.length).toBe(1);
    expect(render({ mode: 'loading', size: 20 }).match(/<svg /g)?.length).toBe(1);
    expect(render({ mode: 'idle', size: 20 }).match(/<svg /g)?.length).toBe(1);
  });

  it('stays zero-JS: the mark itself is never a client component', () => {
    const src = readFileSync(
      fileURLToPath(new URL('./animated-mark.tsx', import.meta.url)),
      'utf8',
    );
    expect(src.startsWith("'use client'")).toBe(false);
    expect(src).not.toContain('useState');
  });
});
