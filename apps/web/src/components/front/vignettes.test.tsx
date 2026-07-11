import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createTranslator, type Locale } from '@xidig/i18n';

import {
  buildVignetteLabels,
  Vignette,
  type VignetteKind,
  type VignetteLabels,
} from './vignettes';

/**
 * De-debris contract (docs/front-door-standard.md §2-B7 + §2-I 52): the
 * vignettes are decorative scenes beside marketing.honestyBody's "any number
 * on this page is a real one" — so a text extractor (curl | strip tags,
 * reader mode, preview bots) must see NONE of their strings: no odometer
 * digit strips, no free-floating labels. Everything decorative renders via
 * CSS generated content from data-* attributes instead of DOM text.
 */

const KINDS: readonly VignetteKind[] = [
  'feed',
  'profile',
  'suuq',
  'dm',
  'labs',
  'capital',
  'lite',
  'owned',
];

const LOCALES: readonly Locale[] = ['en', 'so'];

function labelsFor(locale: Locale): VignetteLabels {
  return buildVignetteLabels(createTranslator(locale));
}

function render(kind: VignetteKind, labels: VignetteLabels): string {
  return renderToStaticMarkup(createElement(Vignette, { kind, labels }));
}

/** What tag-stripping extraction sees: text nodes only, attributes gone. */
function extractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenLabels(labels: VignetteLabels): string[] {
  return Object.values(labels).flatMap((value) =>
    typeof value === 'string' ? [value] : [...value],
  );
}

describe('vignette de-debris (front-door-standard §2-B7)', () => {
  for (const locale of LOCALES) {
    const labels = labelsFor(locale);
    for (const kind of KINDS) {
      it(`${kind} (${locale}) exposes zero extractable text`, () => {
        expect(extractText(render(kind, labels))).toBe('');
      });
    }
  }

  it('odometer strips render no digits as DOM text (feed + capital)', () => {
    const labels = labelsFor('en');
    for (const kind of ['feed', 'capital'] as const) {
      expect(extractText(render(kind, labels))).not.toMatch(/[0-9]/);
    }
  });

  it('no vignette label value appears in extracted text, either locale', () => {
    for (const locale of LOCALES) {
      const labels = labelsFor(locale);
      const everything = KINDS.map((kind) => extractText(render(kind, labels))).join(' ');
      for (const label of flattenLabels(labels)) {
        expect(everything).not.toContain(label);
      }
    }
  });
});

describe('vignette aria-hidden pin (front-door-standard §2-I 52)', () => {
  // The generated-content approach is screen-reader-safe ONLY while the
  // container stays aria-hidden: nothing else prevents CSS content: attr()
  // labels from being announced. Removing aria-hidden requires reworking the
  // de-debris design, not just deleting this pin.
  const labels = labelsFor('en');
  for (const kind of KINDS) {
    it(`${kind} container is aria-hidden`, () => {
      const html = render(kind, labels);
      const rootTag = html.slice(0, html.indexOf('>') + 1);
      expect(rootTag).toContain('aria-hidden="true"');
      expect(rootTag).toContain(`xf-vig--${kind}`);
    });
  }
});

describe('generated-content CSS contract (front.css)', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../../app/front.css', import.meta.url)),
    'utf8',
  );
  const labels = labelsFor('en');

  it('front.css renders data-label and odometer data-d generated content', () => {
    expect(css).toContain('content: attr(data-label)');
    expect(css).toContain('content: attr(data-d)');
  });

  it('every data-label element has a ::before/::after rule for one of its classes', () => {
    const labelledTags = KINDS.flatMap(
      (kind) => render(kind, labels).match(/<[a-z]+ [^>]*data-label="[^"]*"[^>]*>/g) ?? [],
    );
    // Non-vacuous: the vignettes must actually carry their strings as
    // data-label attributes (fails if someone reverts to text children).
    expect(labelledTags.length).toBeGreaterThan(0);
    for (const tag of labelledTags) {
      const classes = (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/).filter(Boolean);
      const covered = classes.some(
        (cls) => css.includes(`.${cls}::before`) || css.includes(`.${cls}::after`),
      );
      expect(covered, `no generated-content CSS rule for: ${tag}`).toBe(true);
    }
  });

  it('odometer digits ride data-d attributes', () => {
    const html = render('capital', labels);
    // Co-sign odometer n=7 → digits 0..7 as EMPTY spans with data-d only.
    for (let digit = 0; digit <= 7; digit += 1) {
      expect(html).toContain(`data-d="${digit}"`);
    }
  });
});
