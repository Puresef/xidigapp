import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Design-token contrast gate (DESIGN.md §2 / §4): every named text/background
 * token pair must hold WCAG AA ≥ 4.5:1 in BOTH palettes, and the retired
 * five-hue post-type palette must never reappear in globals.css. Precedent:
 * the avatar-disc contrast gate (components/media/avatar.test.tsx) and the
 * front-door source scans (lib/front/media-governance.test.ts) — invariants
 * are tests, not conventions.
 *
 * The parser reads only the token blocks (`:root { … }` and the bare
 * `[data-theme='dark'] { … }` override at column 0), so rule-level CSS never
 * confuses it. Supported value forms: #rgb/#rrggbb and rgb()/rgba().
 */

const CSS_PATH = fileURLToPath(new URL('./globals.css', import.meta.url));
const css = readFileSync(CSS_PATH, 'utf8');

type Rgba = { r: number; g: number; b: number; a: number };

function parseTokenBlocks(source: string, selector: ':root' | "[data-theme='dark']") {
  const tokens = new Map<string, string>();
  // Token blocks start at column 0 with the bare selector (scoped overrides
  // like "[data-theme='dark'] .xidig-tag--seeded" never match).
  const escaped = selector.replace(/[[\]']/g, (c) => `\\${c}`);
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'gm');
  for (const match of source.matchAll(block)) {
    for (const decl of match[1]!.matchAll(/(--x-[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(decl[1]!, decl[2]!.trim());
    }
  }
  return tokens;
}

const light = parseTokenBlocks(css, ':root');
const dark = new Map([...light, ...parseTokenBlocks(css, "[data-theme='dark']")]);
const palettes = { light, dark } as const;

function parseColor(value: string): Rgba | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    value,
  );
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    };
  }
  return null;
}

function resolve(nameOrLiteral: string, palette: Map<string, string>): Rgba {
  const raw = nameOrLiteral.startsWith('--') ? palette.get(nameOrLiteral) : nameOrLiteral;
  if (!raw) throw new Error(`token ${nameOrLiteral} is not defined`);
  const color = parseColor(raw);
  if (!color) throw new Error(`token ${nameOrLiteral} has unparseable value "${raw}"`);
  return color;
}

/** Composite a (possibly translucent) color over an opaque base. */
function over(top: Rgba, alphaScale: number, base: Rgba): Rgba {
  const a = top.a * alphaScale;
  return {
    r: a * top.r + (1 - a) * base.r,
    g: a * top.g + (1 - a) * base.g,
    b: a * top.b + (1 - a) * base.b,
    a: 1,
  };
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgba): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = {
  /** Token name (--x-*) or literal color. Must resolve opaque. */
  fg: string;
  /** Token name or literal. May be translucent when `base` is given. */
  bg: string;
  /** Extra alpha on bg — models color-mix(in srgb, bg N%, transparent). */
  bgAlpha?: number;
  /** Opaque token the bg is composited over before measuring. */
  base?: string;
  /** Minimum ratio (default 4.5 — WCAG AA text). */
  min?: number;
  note: string;
};

/** Every named token pair the UI relies on. Extend when a new pair ships. */
const PAIRS: Pair[] = [
  { fg: '--x-fg', bg: '--x-bg', note: 'body text on canvas' },
  { fg: '--x-fg', bg: '--x-surface', note: 'body text on cards' },
  { fg: '--x-fg', bg: '--x-surface-2', note: 'text on raised panels (menus, toasts, modals)' },
  { fg: '--x-muted', bg: '--x-bg', note: 'secondary text on canvas' },
  { fg: '--x-muted', bg: '--x-surface', note: 'secondary text on cards' },
  { fg: '--x-muted', bg: '--x-surface-2', note: 'secondary text on raised panels' },
  { fg: '--x-accent-fg', bg: '--x-accent', note: 'primary button label' },
  { fg: '--x-accent-text', bg: '--x-surface', note: 'accent-as-text (icon-button --on, active tab)' },
  {
    fg: '--x-accent-text',
    bg: '--x-accent-soft',
    base: '--x-surface',
    note: 'update chip / .xidig-badge text on accent tint',
  },
  { fg: '--x-trust-fg', bg: '--x-surface', note: 'trust text on cards' },
  {
    fg: '--x-trust-fg',
    bg: '--x-trust-soft',
    base: '--x-surface',
    note: 'Verified chip / Win chip text on trust tint',
  },
  { fg: '#131c2e', bg: '--x-trust', note: 'ink check glyph on the solid trust fill' },
  { fg: '--x-ok', bg: '--x-surface', note: 'icon-button --done' },
  { fg: '--x-ok', bg: '--x-ok-bg', note: 'notice banner' },
  { fg: '--x-danger', bg: '--x-surface', note: 'danger menu items on cards' },
  { fg: '--x-danger', bg: '--x-surface-2', note: 'danger menu items on raised panels' },
  { fg: '--x-danger', bg: '--x-danger-bg', note: 'error banner' },
  {
    fg: '--x-muted',
    bg: '--x-border',
    bgAlpha: 0.45,
    base: '--x-surface',
    note: 'neutral post-type chips (ask/poll/intro) and house hover tint',
  },
  {
    fg: '--x-field-border',
    bg: '--x-field-bg',
    min: 3,
    note: 'form-control boundary (WCAG 1.4.11 non-text)',
  },
];

/** Tokens each palette block must define explicitly (no light fallback). */
const REQUIRED_LIGHT = [
  '--x-surface-2',
  '--x-shadow-2',
  '--x-accent-text',
  '--x-trust',
  '--x-trust-fg',
  '--x-trust-soft',
];
const REQUIRED_DARK = ['--x-surface-2', '--x-shadow-2', '--x-accent-text', '--x-trust-fg', '--x-trust-soft'];

/**
 * The retired five-hue post-type palette + the pre-token icon green + the
 * phantom --x-fg-bg token. Duotone discipline: functional accent + trust
 * orange; sanctioned exemptions are seeded violet #6d28d9 and --x-ok/--x-danger.
 */
const RETIRED = ['#7c4bc0', '#b26a09', '#0e8c86', '#1f8f57', '#1f9d57', '--x-fg-bg'];

describe('globals.css token parser', () => {
  it('reads both palette blocks', () => {
    expect(light.get('--x-bg')).toBe('#f2f5fa');
    expect(dark.get('--x-bg')).toBe('#0a0e1a');
    // Dark inherits anything it does not override.
    expect(dark.get('--x-radius')).toBe(light.get('--x-radius'));
  });

  it('computes WCAG contrast (sanity: black on white = 21)', () => {
    expect(contrast(resolve('#000000', light), resolve('#ffffff', light))).toBeCloseTo(21, 5);
  });
});

describe('design-token palette completeness', () => {
  it.each(REQUIRED_LIGHT)('light palette defines %s', (token) => {
    expect(parseTokenBlocks(css, ':root').has(token), `${token} missing from :root`).toBe(true);
  });

  it.each(REQUIRED_DARK)('dark palette defines %s', (token) => {
    expect(
      parseTokenBlocks(css, "[data-theme='dark']").has(token),
      `${token} missing from the dark token block`,
    ).toBe(true);
  });
});

describe('design-token contrast (AA in both palettes)', () => {
  for (const [theme, palette] of Object.entries(palettes)) {
    it.each(PAIRS)(`${theme}: $fg on $bg — $note`, (pair) => {
      let bg = resolve(pair.bg, palette);
      if (pair.base !== undefined || bg.a < 1 || pair.bgAlpha !== undefined) {
        const base = resolve(pair.base ?? '--x-surface', palette);
        expect(base.a, 'composite base must be opaque').toBe(1);
        bg = over(bg, pair.bgAlpha ?? 1, base);
      }
      // A translucent fg (e.g. the alpha field border in dark) renders
      // composited over its own background — measure what actually paints.
      const fg = over(resolve(pair.fg, palette), 1, bg);
      const ratio = contrast(fg, bg);
      expect(
        ratio,
        `${theme}: ${pair.fg} on ${pair.bg} (${pair.note}) = ${ratio.toFixed(2)}:1, needs ≥ ${
          pair.min ?? 4.5
        }:1`,
      ).toBeGreaterThanOrEqual(pair.min ?? 4.5);
    });
  }
});

describe('duotone discipline scan', () => {
  // Case-insensitive: #7C4BC0 would be the same retired hue as #7c4bc0.
  const cssLower = css.toLowerCase();
  it.each(RETIRED)('globals.css no longer contains %s', (needle) => {
    expect(
      cssLower.includes(needle.toLowerCase()),
      `${needle} found in globals.css — the five-hue chip palette is retired ` +
        '(win → trust treatment, others neutral/accent; see DESIGN.md §2)',
    ).toBe(false);
  });
});

/* ── Interaction-state coverage (DESIGN.md §4): every interactive element
   ships hover / pressed / focus-visible / disabled. Presence checks only —
   selectors may grow :not() guards without breaking these. ──────────────── */

function escapeSelector(sel: string): string {
  return sel.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
}

/** True when the class has a rule for the given pseudo-class (possibly with
 *  intervening :not()/attribute guards, but within one compound selector). */
function hasState(sel: string, pseudo: string): boolean {
  return new RegExp(`${escapeSelector(sel)}[^,{\\s]*${escapeSelector(pseudo)}`).test(css);
}

const FOCUS_VISIBLE_CLASSES = [
  '.xidig-tabs__tab',
  'button.xidig-tag',
  '.xidig-reaction',
  'button.xidig-poll__option',
  '.xidig-language-toggle__option',
  '.xidig-icon-button',
  '.xidig-switch',
  '.xidig-dm-menu__item',
  '.xidig-notif__link',
  '.xidig-mention__item',
  '.xidig-reaction-picker__opt',
  '.xidig-user-menu__item',
  '.xidig-nav__item a',
  '.xidig-media-slot__thumb-btn',
];

const ACTIVE_CLASSES = [
  '.xidig-button',
  '.xidig-reaction',
  'button.xidig-tag',
  '.xidig-icon-button',
  '.xidig-tabs__tab',
  '.xidig-nav__item a',
  '.xidig-vote-card',
  '.xidig-reaction-picker__opt',
];

const DISABLED_CLASSES = [
  'button.xidig-poll__option',
  '.xidig-tabs__tab',
  '.xidig-icon-button',
  '.xidig-language-toggle__option',
  '.xidig-composer-prompt',
  '.xidig-switch',
];

describe('interaction-state coverage', () => {
  it.each(FOCUS_VISIBLE_CLASSES)('focus-visible ring covers %s', (sel) => {
    // ".xidig-nav__item a" carries a descendant space — check the final
    // compound (the anchor) wears the pseudo-class.
    expect(
      new RegExp(`${escapeSelector(sel)}[^,{\\s]*:focus-visible`).test(css),
      `${sel} has no :focus-visible rule`,
    ).toBe(true);
  });

  it.each(ACTIVE_CLASSES)('pressed (:active) state exists for %s', (sel) => {
    expect(hasState(sel, ':active'), `${sel} has no :active rule`).toBe(true);
  });

  it.each(DISABLED_CLASSES)('disabled state exists for %s', (sel) => {
    expect(hasState(sel, ':disabled'), `${sel} has no :disabled rule`).toBe(true);
  });
});

describe('typography measures', () => {
  it('body line-height is 1.55', () => {
    expect(/(^|\n)body \{[^}]*line-height: 1\.55;/.test(css)).toBe(true);
  });

  it('card body text measure is capped at 68ch', () => {
    expect(/\n\.xidig-card__body \{[^}]*max-width: 68ch;/.test(css)).toBe(true);
  });
});

describe('skeleton primitives', () => {
  it.each(['.xidig-skeleton', '.xidig-skeleton--text', '.xidig-skeleton--avatar', '.xidig-skeleton-card'])(
    '%s exists',
    (sel) => {
      expect(css.includes(`\n${sel} {`), `${sel} rule missing`).toBe(true);
    },
  );

  it('base skeleton is static (no animation outside the motion double-gate)', () => {
    const base = /\n\.xidig-skeleton \{([^}]*)\}/.exec(css);
    expect(base, '.xidig-skeleton rule missing').not.toBeNull();
    expect(base![1]).not.toMatch(/animation/);
  });

  it('shimmer sits behind BOTH motion gates', () => {
    // The gated media block must open directly onto the data-motion-guarded
    // shimmer selector — shimmer exists nowhere else.
    expect(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*html:not\(\[data-motion='off'\]\) \.xidig-skeleton::after \{/.test(
        css,
      ),
    ).toBe(true);
    const occurrences = css.split('.xidig-skeleton::after').length - 1;
    expect(occurrences, 'shimmer ::after declared outside the gate').toBe(1);
  });
});

describe('token liveness (no dead tokens)', () => {
  // Every token the palette defines must be consumed by at least one var()
  // in globals.css (tokens exist to be used — a defined-but-unreferenced
  // token is dead weight and a drift hazard).
  const defined = [...parseTokenBlocks(css, ':root').keys()];
  it.each(defined)('%s is consumed via var()', (token) => {
    expect(css.includes(`var(${token})`), `${token} is defined but never consumed`).toBe(true);
  });
});
