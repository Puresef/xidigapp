import { prerender } from 'react-dom/static';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaShowcaseItem } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { ShowcaseModule, type ShowcaseModuleProps } from './showcase-module';

/**
 * Bandhig acceptance (spec §3.1, states v1–v5). The two that are laws rather
 * than looks:
 *
 *  - **A5** — the grid is the array, verbatim and in order. Anything the
 *    component adds, sorts or drops would be engagement leaking into a surface
 *    the member is supposed to own.
 *  - **No empty state for visitors** — with nothing pinned there is no module.
 *    A stranger must not be shown the shape of an absence.
 *
 * `getT` is the real Somali translator, not a stub: these assertions are the
 * only place the frame-verbatim copy is checked against what ships.
 */

vi.mock('@/lib/locale', () => ({
  getLocale: async () => 'so',
  getT: async () => createTranslator('so'),
}));

/** Server components + a client MediaSlot in one tree — `prerender` is the
 *  only renderer that resolves async components (renderToStaticMarkup throws). */
async function render(props: ShowcaseModuleProps): Promise<string> {
  const { prelude } = await prerender(
    <LocaleProvider initialLocale="so">
      <ShowcaseModule {...props} />
    </LocaleProvider>,
  );
  return await new Response(prelude).text();
}

function item(over: Partial<AnigaShowcaseItem> & { entityId: string }): AnigaShowcaseItem {
  return {
    position: 1,
    entityType: 'post',
    href: `/p/${over.entityId}`,
    sourceKind: 'war',
    title: `Shay ${over.entityId}`,
    mediaUrl: `https://cdn.test/${over.entityId}.jpg`,
    mediaThumbUrl: null,
    blurhash: null,
    estBytes: 92_160,
    ...over,
  };
}

const GUUL = item({ entityId: 'a', sourceKind: 'guul', title: 'Guul kowaad' });
const WARSHAD = item({ entityId: 'b', sourceKind: 'warshad', entityType: 'lab', title: 'Warshad' });
const WAR = item({ entityId: 'c', sourceKind: 'war', title: 'War' });

const BASE = {
  displayName: 'Hodan',
  prefs: LITE_BUNDLES.everything,
  addHref: '/profile#bandhig',
} satisfies Partial<ShowcaseModuleProps>;

/** Every tile carries exactly one link; the order they appear IS the order. */
function tileHrefs(html: string): string[] {
  return [...html.matchAll(/class="xidig-ashowcase__link" href="([^"]+)"/g)].map((m) => m[1]!);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** Tiles only — the class is a prefix of `__tile-skeleton`, so match the tag. */
function tiles(html: string): number {
  return [...html.matchAll(/<li class="xidig-ashowcase__tile[ "]/g)].length;
}

describe('pinned refs only (A5)', () => {
  it('renders exactly the items it was given, in the given order', async () => {
    const html = await render({ ...BASE, viewer: 'member', items: [WAR, GUUL, WARSHAD] });

    expect(tileHrefs(html)).toEqual(['/p/c', '/p/a', '/p/b']);
    // Reversing the input reverses the DOM: no internal sort survives this.
    const reversed = await render({ ...BASE, viewer: 'member', items: [WARSHAD, GUUL, WAR] });
    expect(tileHrefs(reversed)).toEqual(['/p/b', '/p/a', '/p/c']);
  });

  it('adds no tile of its own on the visitor view', async () => {
    const html = await render({ ...BASE, viewer: 'member', items: [GUUL, WAR] });
    expect(tiles(html)).toBe(2);
    expect(html).not.toContain('xidig-ashowcase__tile--add');
  });
});

describe('a visitor never meets an empty Bandhig', () => {
  it('renders NOTHING — not a card, not a wrapper — when nothing is pinned', async () => {
    for (const viewer of ['member', 'anon'] as const) {
      expect(await render({ ...BASE, viewer, items: [] }), viewer).toBe('');
    }
  });

  it('offers the owner the empty state and the one move that fixes it', async () => {
    const html = await render({ ...BASE, viewer: 'owner', items: [] });

    expect(html).toContain('Bandhiggaagu waa madhan');
    expect(html).toContain('Ku dhaji Guul, farshaxan Warshad, ama sawir War');
    expect(html).toContain('href="/profile#bandhig"');
    // Warm surface: the mark is sanctioned here (empty own profile), and it
    // is CSS-only geometry — no bytes ride along with the encouragement.
    expect(html).toContain('xidig-animark');
    // Nothing that looks like a count of zero, anywhere (state a2).
    expect(html).not.toMatch(/>\s*0\s*</);
  });
});

describe('source chips — Guul is the only orange one', () => {
  it('gives Guul the trust chip and the guul star', async () => {
    const html = await render({ ...BASE, viewer: 'member', items: [GUUL] });
    expect(html).toContain('xidig-tag--trust');
    expect(html).toContain('x-ic--trust');
    expect(html).toContain('Guul');
  });

  it('keeps Warshad and War neutral — provenance is not an achievement', async () => {
    const html = await render({ ...BASE, viewer: 'member', items: [WARSHAD, WAR] });
    expect(html).toContain('Warshad');
    expect(html).toContain('War');
    expect(html).not.toContain('xidig-tag--trust');
    expect(html).not.toContain('x-ic--trust');
  });

  it('renders no chip at all for a ref with no source kind', async () => {
    const html = await render({
      ...BASE,
      viewer: 'member',
      items: [item({ entityId: 'd', sourceKind: null })],
    });
    expect(html).not.toContain('xidig-ashowcase__chip');
  });
});

describe('Lite defers bytes, never tiles (A15)', () => {
  it('keeps the same grid and offers each tile its real size', async () => {
    const items = [GUUL, WARSHAD, WAR];
    const full = await render({ ...BASE, viewer: 'member', items });
    const lite = await render({ ...BASE, viewer: 'member', items, prefs: LITE_BUNDLES.essentials });

    expect(tiles(lite)).toBe(tiles(full));
    expect(tileHrefs(lite)).toEqual(tileHrefs(full));
    // Three deferred slots, each with its own estimate and its own tap.
    expect(count(lite, 'xidig-media-slot__size')).toBe(3);
    expect(count(lite, 'xidig-media-slot__show')).toBe(3);
    expect(lite).toContain('Data Saver: sawirradu waa la sugaa');
    // …and the full-quality render says nothing about Lite at all.
    expect(full).not.toContain('xidig-ashowcase__lite');
  });

  it('renders a media-less pin as a titled tile rather than dropping it', async () => {
    const html = await render({
      ...BASE,
      viewer: 'member',
      items: [item({ entityId: 'e', mediaUrl: null, title: 'Guul aan sawir lahayn' })],
    });
    expect(html).toContain('xidig-ashowcase__tile--text');
    expect(html).toContain('Guul aan sawir lahayn');
    expect(html).not.toContain('xidig-media-slot');
    // The title is the visible tile here, so it must not also be hidden.
    expect(html).not.toContain('xidig-visually-hidden');
  });
});

describe('module states', () => {
  it('v1 — the skeleton is the loaded grid, at the same cap', async () => {
    const html = await render({ ...BASE, viewer: 'member', items: [], status: 'loading' });

    expect(tiles(html)).toBe(6);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Waa la soo rarayaa');
    // Shimmer rides .xidig-skeleton, whose keyframes sit behind BOTH
    // prefers-reduced-motion and html[data-motion='off'] — no local animation.
    expect(count(html, 'xidig-skeleton')).toBeGreaterThanOrEqual(7);
    expect(html).not.toContain('animation');
  });

  it('v4 — the module fails alone and offers the retry', async () => {
    const html = await render({
      ...BASE,
      viewer: 'member',
      items: [],
      status: 'error',
      retryHref: '/u/hodan',
    });

    expect(html).toContain('Bandhiggu ma soo bixin');
    expect(html).toContain('Wax baa qaldamay markii la soo rarayay');
    expect(html).toContain('href="/u/hodan"');
    expect(html).toContain('role="alert"');
    // The card still stands — the failure is inside it, not instead of it.
    expect(html).toContain('data-module="showcase"');
    expect(html).not.toContain('xidig-ashowcase__grid');
  });

  it('v5 — a queued pin waits honestly, with the true copy and no spinner', async () => {
    const html = await render({
      ...BASE,
      viewer: 'owner',
      items: [GUUL],
      queued: [{ key: 'q1' }],
    });

    expect(html).toContain('Guul cusub — sugaya');
    expect(html).toContain('Waxay baxaysaa marka internetku soo noqdo');
    expect(html).not.toContain('xidig-spinner');
    // The queued pin does not pretend to be in the grid.
    expect(tileHrefs(html)).toEqual(['/p/a']);
  });
});

describe('owner chrome', () => {
  it('gives the owner an add tile and the ownership note', async () => {
    const html = await render({ ...BASE, viewer: 'owner', items: [GUUL] });

    expect(html).toContain('xidig-ashowcase__tile--add');
    expect(html).toContain('aria-label="Ku dar bandhigga"');
    expect(html).toContain('Adigaa dooranaya waxa halkan yaal');
  });

  it('names the member in the visitor note and never in the owner one', async () => {
    const visitor = await render({ ...BASE, viewer: 'member', items: [GUUL] });
    expect(visitor).toContain('Hodan ayaa doortay bandhiggan');
    expect(visitor).not.toContain('Adigaa dooranaya');
    // Visitor markup carries no owner affordance of any kind (A2's grammar).
    expect(visitor).not.toContain('xidig-amodule__grip');
    expect(visitor).not.toContain('aria-pressed');
  });
});
