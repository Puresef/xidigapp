// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { AnigaModules } from '@/components/profile/aniga-modules';
import { resolveModuleStates } from '@/lib/aniga/modules';
import type { AnigaView } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type { ProfileView } from '@/lib/profile-view';

/**
 * Acceptance A2 — a module the member hid is ABSENT from the visitor's page,
 * not dimmed, not `display:none`, not an empty wrapper.
 *
 * This is the reason the criterion says "structural test": a unit test over
 * `publishedModules()` proves an array is short, which is not the same claim.
 * The claim is about the page — so this renders the real column and then goes
 * looking for the hidden module in the DOM the way anyone else would: by text,
 * by `data-module`, by class, by any attribute value at all. Absence has to
 * survive a hostile reader with devtools open, not just a `queryByText`.
 *
 * The fixture is built so the test can fail. The hidden module is given real
 * content (tags a visitor would otherwise see), the flag-held module is given
 * real numbers, and the stored order is deliberately NOT the registry order —
 * so a renderer that forgets the projection, or that re-sorts, breaks here.
 *
 * The owner pass is the other half: it shows the flag-held module as a locked
 * card (frame 10a). Without it, "the visitor has no metrics node" could just as
 * easily mean the module is broken for everyone.
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

const OWNER = '11111111-1111-4111-8111-111111111111';

function baseView(): ProfileView {
  return {
    profile: {
      user_id: OWNER,
      display_name: 'Hodan Cabdi',
      handle: 'hodan',
      bio: null,
      location_city: 'London',
      location_country: 'UK',
      skills: ['React'],
      lanes: [],
      links: [{ label: 'GitHub', url: 'https://github.com/hodan' }],
      verification_status: 'verified',
      created_at: '2026-01-01T00:00:00Z',
    },
    badges: [],
    counts: { followers: 128, vouches: 4 },
    reputation: { contribution: 0, helper: 0 },
    media: {
      avatarUrl: null,
      avatarThumbUrl: null,
      avatarBlurhash: null,
      coverUrl: null,
      coverThumbUrl: null,
      coverBlurhash: null,
    },
    openTo: [],
    pins: [],
    isAi: false,
  } as ProfileView;
}

/**
 * Stored order, and it is not the seeded one: links before skills before
 * showcase. `resolveModuleStates` is the real projection — the fixture states
 * are merged and sorted by it rather than hand-written, so a drift between the
 * registry and the renderer shows up here too.
 *
 * `looking_for` is hidden BY THE MEMBER. `metrics` is held by the platform
 * flag (absent from `flags`, which reads as off).
 */
const STORED_ROWS = [
  { module_id: 'links', position: 1, visible: true },
  { module_id: 'skills', position: 2, visible: true },
  { module_id: 'showcase', position: 3, visible: true },
  { module_id: 'looking_for', position: 4, visible: false },
  { module_id: 'spaces', position: 5, visible: true },
  { module_id: 'helper', position: 6, visible: true },
  { module_id: 'suuq', position: 7, visible: true },
  { module_id: 'metrics', position: 8, visible: true },
];

/** The three modules carrying content in this fixture, in STORED order. */
const RENDERED_ORDER = ['links', 'skills', 'showcase'];

function anigaView(viewer: 'owner' | 'member'): AnigaView {
  return {
    base: baseView(),
    headline: 'Injineer software · London',
    modules: resolveModuleStates(STORED_ROWS, { profile_metrics_module: false }),
    showcase: [
      {
        position: 1,
        entityType: 'post',
        entityId: 'post-1',
        href: '/p/post-1',
        sourceKind: 'guul',
        title: 'Guul kowaad',
        mediaUrl: 'https://cdn.test/a.jpg',
        mediaThumbUrl: null,
        blurhash: null,
        estBytes: 92_160,
      },
    ],
    skills: [{ skill: 'Amniga xogta', endorsers: 12, rank: 1, endorsedByViewer: false }],
    links: [
      {
        label: 'GitHub',
        url: 'https://github.com/hodan',
        urlKey: 'github.com/hodan',
        verificationStatus: 'verified',
        ogStatus: 'failed',
        ogTitle: null,
        ogSiteName: null,
        ogImageUrl: null,
        verificationToken: null,
      },
    ],
    // The hidden module is NOT empty — it has content a visitor would meet if
    // the projection leaked. An empty hidden module would prove nothing.
    lookingFor: {
      slugs: ['collaborators'],
      matches:
        viewer === 'owner'
          ? [
              {
                href: '/labs/suuq-card',
                title: 'Suuq-Card waxay raadinaysaa "amniga xogta"',
                reason: 'Ku habboon xirfaddaada',
                memberCount: 6,
              },
            ]
          : [],
    },
    helper: [],
    mutuals: null,
    suuq: null,
    // Owner-visible numbers even while the flag is off — which is exactly what
    // must not reach a visitor.
    metrics: viewer === 'owner' ? { posts: 31, asksHelped: 7, connections: 128 } : null,
    privateStats: null,
    ownerFacts: null,
  };
}

const visitor = () =>
  mount(
    createElement(AnigaModules, {
      view: anigaView('member'),
      viewer: 'member' as const,
      prefs: LITE_BUNDLES.everything,
    }),
  );

const owner = () =>
  mount(
    createElement(AnigaModules, {
      view: anigaView('owner'),
      viewer: 'owner' as const,
      prefs: LITE_BUNDLES.everything,
    }),
  );

describe('A2 — an owner-hidden module leaves no trace in the visitor DOM', () => {
  it('renders no node, no attribute and no text for the hidden module', async () => {
    const html = await visitor();

    // 1. The card itself.
    expect(html.querySelector('[data-module="looking_for"]')).toBeNull();
    // 2. Its label, and the content it would have carried.
    expect(html.textContent).not.toContain('Waxaan raadinayaa');
    expect(html.textContent).not.toContain('La-hawlgale');

    // 3. Any node referencing it AT ALL — id, class, data-*, aria-*, href.
    //    This is the assertion that separates "absent" from "hidden": a
    //    display:none card, an aria-hidden wrapper, or a bare <section> keyed
    //    by module id would all survive 1 and 2 and die here.
    const referencing = Array.from(html.querySelectorAll('*')).filter((node) =>
      Array.from(node.attributes).some(
        (attr) => /looking[_-]?for|alooking/i.test(attr.value) || /looking/i.test(attr.name),
      ),
    );
    expect(referencing.map((node) => node.outerHTML)).toEqual([]);

    // 4. And nothing in the serialized markup either — comments included, so a
    //    React placeholder or a commented-out card is caught too.
    expect(html.innerHTML).not.toMatch(/looking[_-]?for|alooking|raadinayaa/i);
  });

  it('still renders the visible modules — so this test can actually fail', async () => {
    const html = await visitor();

    expect(html.querySelector('[data-module="skills"]')).not.toBeNull();
    expect(html.textContent).toContain('Xirfadaha');
    expect(html.textContent).toContain('Amniga xogta');
    expect(html.querySelector('[data-module="links"]')).not.toBeNull();
    expect(html.querySelector('[data-module="showcase"]')).not.toBeNull();
  });

  it('renders the modules in the member’s stored order, not the registry order', async () => {
    const html = await visitor();
    const order = Array.from(html.querySelectorAll('[data-module]')).map((node) =>
      node.getAttribute('data-module'),
    );

    // Membership is not the claim — sequence is. STORED_ROWS deliberately puts
    // links first, where the registry seeds showcase first.
    expect(order).toEqual(RENDERED_ORDER);
    expect(order[0]).not.toBe('showcase');
  });
});

describe('A2 — a flag-held module is absent for the visitor and locked for the owner', () => {
  it('gives the visitor no metrics node and no metrics number', async () => {
    const html = await visitor();

    expect(html.querySelector('[data-module="metrics"]')).toBeNull();
    expect(html.textContent).not.toContain('Tirakoobka');
    // The counts themselves, by value: 31 posts / 7 asks / 128 connections.
    expect(html.textContent).not.toMatch(/\b(31|128)\b/);
    expect(html.innerHTML).not.toMatch(/metrics|ametrics/i);
  });

  it('shows the owner the same module as a locked card (frame 10a)', async () => {
    const html = await owner();
    const card = html.querySelector('[data-module="metrics"]');

    // Present, dashed, chipped, and with an eye that is visibly refused. This
    // is what makes the visitor's omission a decision rather than a bug.
    expect(card).not.toBeNull();
    expect(card?.className).toContain('xidig-amodule--locked');
    expect(html.querySelector('.xidig-amodule__flag')?.textContent).toBe('Booqdayaasha: damsan');

    const eye = html.querySelector('.xidig-amodule__eye');
    expect(eye?.getAttribute('aria-pressed')).toBe('false');
    expect(eye?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps the owner’s own hidden module off their page too', async () => {
    // The manager is where a hidden module lives; the profile shows the owner
    // what a visitor meets, so "hidden" reads the same from both seats.
    const html = await owner();
    expect(html.querySelector('[data-module="looking_for"]')).toBeNull();
    expect(html.textContent).not.toContain('Waxaan raadinayaa');
  });
});

describe('the trailing note states the rule the page just followed (10c)', () => {
  it('tells the visitor whose order this is, and that there are no follower counts', async () => {
    const html = await visitor();
    // Direct child of the column — a module's own footnote lives inside a card.
    const note = html.querySelector('.xidig-aniga__modules > .xidig-card__meta');
    expect(note?.textContent).toContain('Hodan Cabdi');
    expect(note?.textContent).toContain('Tiro raacayaal ma jirto');
  });

  it('is not shown to the owner — it describes what visitors get', async () => {
    const html = await owner();
    expect(html.textContent).not.toContain('Tiro raacayaal ma jirto');
  });
});
