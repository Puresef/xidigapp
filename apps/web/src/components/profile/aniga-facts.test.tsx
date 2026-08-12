// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaOwnerFacts } from '@/lib/aniga/view';

import { AnigaFacts } from './aniga-facts';

/**
 * Xogta — the owner's facts card (docs/aniga-modules.md, ruled 11 Aug).
 *
 * Three rules are load-bearing here and each has its own reason to be a test
 * rather than a convention:
 *
 *  - the card is OWNER-ONLY, and absence is structural. A visitor's DOM must
 *    carry no node, which is also what keeps `hidden` and never-entered
 *    byte-identical for them — a visitor who could tell those apart would have
 *    learned that this member deliberately hid something.
 *  - lanes render as `<dd>` TEXT and never as `.xidig-tag`. In this product a
 *    pill is the typography of attested evidence, so a ticked-checkbox lane
 *    wearing one tells the reader a stranger vouched for it. Styling drifts;
 *    an assertion does not.
 *  - the fold explanation appears only when the fold actually bites. A notice
 *    that never changes teaches nothing.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

/** Labels, not slugs — the slugs are here so a raw-slug render can fail. */
const LANES = [
  { slug: 'halal-finance', label: 'Maaliyad xalaal' },
  { slug: 'tech', label: 'Tignoolajiyada' },
];

const facts = (overrides: Partial<AnigaOwnerFacts> = {}): AnigaOwnerFacts => ({
  lanes: LANES,
  fold: null,
  place: 'London',
  ...overrides,
});

describe('the visitor render carries no fold state, because it carries nothing', () => {
  it('emits no DOM at all when the caller passes null', async () => {
    const html = await mount(createElement(AnigaFacts, { facts: null }));

    expect(html.children).toHaveLength(0);
    expect(html.innerHTML.trim()).toBe('');
    // Structural, not stylistic: there is no node to un-hide in devtools.
    expect(html.querySelector('.xidig-section')).toBeNull();
  });
});

describe('an empty card is a promise of content, so it is not rendered', () => {
  it('emits nothing when there are no lanes and nothing is folded away', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ lanes: [], fold: null }) }),
    );

    expect(html.innerHTML.trim()).toBe('');
  });

  it('still renders when the only thing to say is the fold', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ lanes: [], fold: 'hidden', place: null }) }),
    );

    expect(html.querySelector('.xidig-section')).not.toBeNull();
    expect(html.textContent).toContain('Goobtaada booqdayaasha lagama muujiyo.');
  });
});

describe('self-declared facts are a definition list, never attested pills', () => {
  it('renders the lane LABELS as dd text', async () => {
    const html = await mount(createElement(AnigaFacts, { facts: facts() }));

    const terms = Array.from(html.querySelectorAll('.xidig-afacts dt')).map(
      (node) => node.textContent,
    );
    expect(terms[0]).toBe('Waddooyinka');
    expect(html.querySelector('.xidig-afacts dd')?.textContent).toBe(
      'Maaliyad xalaal · Tignoolajiyada',
    );
    // The read path rendered raw slugs for as long as the label columns existed.
    expect(html.innerHTML).not.toContain('halal-finance');
  });

  it('puts no .xidig-tag anywhere in the card — the pill is attested evidence', async () => {
    const html = await mount(createElement(AnigaFacts, { facts: facts() }));
    const card = html.querySelector('.xidig-section');

    expect(card).not.toBeNull();
    expect(card?.querySelectorAll('.xidig-tag')).toHaveLength(0);
    // Belt and braces: a variant class (--trust, --seeded) carries the same
    // typography and would read as vouched-for just as loudly.
    expect(html.innerHTML).not.toContain('xidig-tag');
  });

  it('names the card and the note the member needs to read the row correctly', async () => {
    const html = await mount(createElement(AnigaFacts, { facts: facts() }));

    expect(html.querySelector('.xidig-section__title')?.textContent).toBe('Xogta');
    expect(html.textContent).toContain(
      'Waddooyinku waa sida xubnuhu kuugu helaan tusmada — profile-kaaga lagama muujiyo.',
    );
  });

  it('drops the lanes note when there are no lanes to explain', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ lanes: [], fold: 'hidden', place: null }) }),
    );

    expect(html.textContent).not.toContain('Waddooyinku waa sida xubnuhu');
    expect(html.querySelector('.xidig-afacts dt')).toBeNull();
  });
});

describe('the location row mirrors what a visitor actually sees', () => {
  it('names the folded place in the sentence, not in a label-value row', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ lanes: [], fold: 'region', place: 'UK' }) }),
    );

    // The mirror is worth saying only where it DIVERGES from what the member
    // typed, and there it is a sentence. A "Goobta: UK" row above "Visitors see
    // UK only" would print the same fact twice in two registers.
    expect(html.textContent).toContain('Booqdayaashu waxay arkaan UK oo keliya');
    const terms = Array.from(html.querySelectorAll('.xidig-afacts dt')).map(
      (node) => node.textContent,
    );
    expect(terms).not.toContain('Goobta');
  });

  it('renders no location row when nothing survives the fold', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ lanes: LANES, fold: 'hidden', place: null }) }),
    );

    // Not a textContent sweep: the hidden sentence below the list opens with
    // "Goobtaada", which contains the label as a substring.
    const terms = Array.from(html.querySelectorAll('.xidig-afacts dt')).map(
      (node) => node.textContent,
    );
    expect(terms).toEqual(['Waddooyinka']);
    expect(html.querySelectorAll('.xidig-afacts dd')).toHaveLength(1);
  });
});

describe('the fold is explained only when it bites', () => {
  it('names the place a region fold leaves behind', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ fold: 'region', place: 'UK' }) }),
    );

    expect(html.textContent).toContain('Booqdayaashu waxay arkaan UK oo keliya.');
  });

  it('says so plainly when the location is hidden', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ fold: 'hidden', place: null }) }),
    );

    expect(html.textContent).toContain('Goobtaada booqdayaasha lagama muujiyo.');
  });

  it('says nothing at all when the member publishes their city (exact/city)', async () => {
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ fold: null, place: 'London' }) }),
    );

    // The card is here — the lanes row carries it — so the silence below is a
    // decision about the fold, not an unrendered card.
    expect(html.querySelector('.xidig-section')).not.toBeNull();
    // London is what the member typed AND what a visitor sees, so the header
    // subtitle already says it. Repeating it here would make the card a second
    // place the fold can be got wrong, which is the duplication this design
    // exists to refuse.
    expect(html.textContent).not.toContain('London');
    expect(html.textContent).not.toContain('Booqdayaashu waxay arkaan');
    expect(html.textContent).not.toContain('Goobtaada booqdayaasha lagama muujiyo');
  });

  it('falls back to the hidden sentence when a region fold has no place to name', async () => {
    // 'region' keeps the country and drops the city, so a member who never
    // stored a country has nothing left for a visitor to see. The hidden
    // sentence is the true one; a region line would interpolate a hole.
    const html = await mount(
      createElement(AnigaFacts, { facts: facts({ fold: 'region', place: null }) }),
    );

    expect(html.textContent).toContain('Goobtaada booqdayaasha lagama muujiyo.');
    expect(html.textContent).not.toContain('Booqdayaashu waxay arkaan');
  });
});

/**
 * Every test above mounts the component directly, which means all of them pass
 * on a card no page renders. That is not hypothetical: this card shipped built,
 * tested and UNMOUNTED — the owner rails carried only the manager and the
 * private stats, so the whole surface was dead code and green.
 *
 * A behavioural test cannot reach these two pages (server components behind
 * auth, RLS and a live projection), so the mount is asserted on the source, in
 * the house style of `mascot-forbidden-surfaces.test.ts`. It is a weaker
 * instrument than a render, and it is the correct one here: the defect it
 * catches is not "renders wrongly" but "is never reached at all".
 */
describe('the card is actually mounted — a component no page renders is dead code', () => {
  const OWNER_RAILS = ['../../app/profile/page.tsx', '../../app/u/[handle]/page.tsx'];

  it.each(OWNER_RAILS)('%s puts the Xogta card in the owner rail', (page) => {
    const source = readFileSync(fileURLToPath(new URL(page, import.meta.url)), 'utf8');

    expect(source).toContain('<AnigaFacts');
    // Fed from the projection, never from a locally-derived value: `ownerFacts`
    // is null for non-owners by construction, and that null IS the privacy
    // property. A page that computed its own facts could hand them to a visitor.
    expect(source).toContain('facts={view.ownerFacts}');
  });
});
