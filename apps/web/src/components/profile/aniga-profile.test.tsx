// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { createTranslator, formatDate } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { resolveModuleStates } from '@/lib/aniga/modules';
import type { AnigaView } from '@/lib/aniga/view';
import { LITE_BUNDLES, type LitePrefs } from '@/lib/lite/prefs';
import type { ProfileView } from '@/lib/profile-view';

import { AnigaPrivateStats } from './aniga-private-stats';
import { AnigaProfile } from './aniga-profile';
import { ModuleManager } from './module-manager';

/**
 * The ASSEMBLED surface — the page a member actually meets, not a component in
 * isolation.
 *
 * Every rule below already has a unit test somewhere: `publishedModules()`
 * returns a short array, `MetricsModule` returns null without metrics,
 * `AnigaPrivateStats` returns null without stats. None of those tests can fail
 * if the shell renders the wrong projection, forwards the wrong viewer, or
 * mounts the private block in the shareable column. That gap is what this file
 * closes: one render of the real `AnigaProfile` with the real rail, then the
 * acceptance criteria read off the resulting DOM.
 *
 * The fixture is built so the assertions can fail:
 *  - the hidden module (`looking_for`) carries REAL content, so absence is a
 *    decision rather than an empty render;
 *  - the flag-held module carries REAL numbers, so a leak would be visible;
 *  - stored order is deliberately NOT registry order, so a renderer that
 *    re-sorts breaks here;
 *  - every count is distinct and non-zero, so no leak hides behind a "0" and
 *    no two numbers can cover for each other.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

const t = createTranslator('so');

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = '2024-03-04T00:00:00Z';

/** Distinct, non-zero, and none of them a substring of another. */
const FOLLOWERS = 128;
const VOUCHES = 37;
const CONTRIBUTION = 42;
const HELPER_SCORE = 19;
const METRICS = { posts: 31, asksHelped: 7, connections: 96 };

const COVER_URL = 'https://cdn.test/hodan-cover.jpg';
const SHOWCASE_URL = 'https://cdn.test/hodan-guul.jpg';

/** Every number a visitor must never meet, as a word-boundary alternation. */
const FORBIDDEN_NUMBERS = new RegExp(
  `\\b(${[FOLLOWERS, VOUCHES, CONTRIBUTION, HELPER_SCORE, METRICS.posts, METRICS.connections].join(
    '|',
  )})\\b`,
);

function baseView(): ProfileView {
  return {
    profile: {
      user_id: OWNER_ID,
      display_name: 'Hodan Cabdi',
      handle: 'hodan',
      bio: 'Injineer software oo London deggan.',
      location_city: 'London',
      location_country: 'UK',
      skills: ['Amniga xogta'],
      // Non-empty on purpose: lanes are owner-only, and a fixture with none
      // would let that rule pass without ever being exercised.
      lanes: ['tech', 'ganacsi'],
      links: [{ label: 'GitHub', url: 'https://github.com/hodan' }],
      contact_options: {},
      verification_status: 'identity_verified',
      created_at: CREATED_AT,
    },
    badges: [],
    counts: { followers: FOLLOWERS, vouches: VOUCHES },
    reputation: { contribution: CONTRIBUTION, helper: HELPER_SCORE },
    media: {
      avatarUrl: null,
      avatarThumbUrl: null,
      avatarBlurhash: null,
      coverUrl: COVER_URL,
      coverThumbUrl: null,
      coverBlurhash: null,
    },
    openTo: [],
    pins: [],
    isAi: false,
  } as ProfileView;
}

/**
 * Stored order, and it is NOT the seeded one: links before skills before
 * showcase. `looking_for` is hidden by the member; `metrics` is held by the
 * platform flag (absent from `flags`, which reads as off).
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

/** The modules carrying content for a VISITOR, in stored order. */
const VISITOR_ORDER = ['links', 'skills', 'showcase'];

function anigaView(viewer: 'owner' | 'member'): AnigaView {
  const isOwner = viewer === 'owner';
  return {
    base: baseView(),
    headline: 'Injineer software',
    modules: resolveModuleStates(STORED_ROWS, { profile_metrics_module: false }),
    showcase: [
      {
        position: 1,
        entityType: 'post',
        entityId: 'post-1',
        href: '/p/post-1',
        sourceKind: 'guul',
        title: 'Guul kowaad',
        mediaUrl: SHOWCASE_URL,
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
    // The hidden module is NOT empty: a visitor would meet these tags if the
    // projection leaked. An empty hidden module would prove nothing.
    lookingFor: {
      slugs: ['collaborators'],
      matches: isOwner
        ? [
            {
              href: '/labs/suuq-card',
              title: 'Suuq-Card',
              reason: 'Ku habboon xirfaddaada',
              memberCount: 6,
            },
          ]
        : [],
    },
    helper: [],
    mutuals: null,
    suuq: null,
    // Deliberately NON-null for the visitor too. `getAnigaView` already nulls
    // this out for anyone but the owner while the flag is off, so handing the
    // shell the numbers anyway is the leak the second line of defence exists
    // for: the projection drops the flag-held module, and the module refuses
    // to render for a non-owner. A fixture that nulled it would be asserting
    // that null renders nothing.
    metrics: METRICS,
    privateStats: isOwner ? { ...METRICS, cachedAt: null } : null,
    ownerFacts: null,
  };
}

function page(viewer: 'owner' | 'member', prefs: LitePrefs = LITE_BUNDLES.everything) {
  const view = anigaView(viewer);
  return mount(
    createElement(AnigaProfile, {
      view,
      viewer,
      prefs,
      // The real rail, not a stand-in: the owner's private block and the
      // manager are page-level composition, and composing them wrongly is
      // precisely the failure a component test cannot see.
      rail:
        viewer === 'owner'
          ? createElement(
              'div',
              null,
              createElement(ModuleManager, { modules: view.modules, presentation: 'rail' }),
              createElement(AnigaPrivateStats, { stats: view.privateStats, variant: 'rail' }),
            )
          : null,
    }),
  );
}

const tenure = t('profile.memberSince', {
  date: formatDate(new Date(CREATED_AT), 'so'),
});

/**
 * The column's trailing note (10c) says "Tiro raacayaal ma jirto" — there are
 * no follower counts. It is the only sanctioned use of that vocabulary on a
 * visitor's page, so it comes out before the vocabulary sweep; every other
 * occurrence is a leak.
 */
function withoutVisitorNote(html: HTMLElement): string {
  const note = t('profile.visitorOrderNote', { name: 'Hodan Cabdi' });
  return (html.textContent ?? '').split(note).join('');
}

describe('assembled page — A2: an owner-hidden module leaves no trace', () => {
  it('renders no node, no attribute and no text for the hidden module', async () => {
    const html = await page('member');

    expect(html.querySelector('[data-module="looking_for"]')).toBeNull();
    expect(html.textContent).not.toContain('Waxaan raadinayaa');

    // Any node referencing it AT ALL — id, class, data-*, aria-*, href. This
    // is what separates "absent" from "hidden": a display:none card or an
    // aria-hidden wrapper would survive the two checks above and die here.
    const referencing = Array.from(html.querySelectorAll('*')).filter((node) =>
      Array.from(node.attributes).some(
        (attr) => /looking[_-]?for|alooking/i.test(attr.value) || /looking/i.test(attr.name),
      ),
    );
    expect(referencing.map((node) => node.outerHTML)).toEqual([]);

    // Serialized markup too, comments included — a React placeholder or a
    // commented-out card is caught here.
    expect(html.innerHTML).not.toMatch(/looking[_-]?for|alooking|raadinayaa/i);
  });

  it('still renders the published modules — so the absence above is not vacuous', async () => {
    const html = await page('member');

    expect(html.querySelector('[data-module="skills"]')).not.toBeNull();
    expect(html.querySelector('[data-module="links"]')).not.toBeNull();
    expect(html.querySelector('[data-module="showcase"]')).not.toBeNull();
    expect(html.textContent).toContain('Xirfadaha');
    expect(html.textContent).toContain('Amniga xogta');
  });

  it('renders them in the member’s stored order, not the registry order', async () => {
    const html = await page('member');
    const order = Array.from(html.querySelectorAll('[data-module]')).map((node) =>
      node.getAttribute('data-module'),
    );

    // Sequence is the claim, not membership: STORED_ROWS puts links first
    // where the registry seeds showcase first.
    expect(order).toEqual(VISITOR_ORDER);
    expect(order[0]).not.toBe('showcase');
  });

  it('gives the visitor no metrics module and none of its numbers', async () => {
    const html = await page('member');

    expect(html.querySelector('[data-module="metrics"]')).toBeNull();
    expect(html.textContent).not.toContain('Tirakoobka');
    expect(html.innerHTML).not.toMatch(/metrics|ametrics/i);
  });
});

describe('assembled page — A1: no follower, vouch or reputation count reaches a visitor', () => {
  it('carries no count text, no count node and no bare integer', async () => {
    const html = await page('member');

    expect(html.textContent).not.toContain(t('profile.followersCount', { count: FOLLOWERS }));
    expect(html.textContent).not.toContain(t('profile.vouchesCount', { count: VOUCHES }));
    expect(html.textContent).not.toContain(
      t('reputation.contributionChip', { count: CONTRIBUTION }),
    );
    expect(html.textContent).not.toContain(t('reputation.helperChip', { count: HELPER_SCORE }));
    // The vocabulary, not just the assembled sentence — a re-worded key or a
    // hand-built "128 · 37" line dies here too. The 10c trailing note is cut
    // first: it is the sentence that PROMISES there are no follower counts, so
    // it is the one place the word belongs.
    expect(withoutVisitorNote(html)).not.toMatch(/raace|raacayaal|dammaanad|follower|vouch/i);
    // And the bare integers anywhere in the markup: an attribute, a comment or
    // a node styled out of sight still ships the number.
    expect(html.innerHTML).not.toMatch(FORBIDDEN_NUMBERS);
  });

  it('leaves no reputation-score node behind either — not an emptied one', async () => {
    const html = await page('member');

    expect(html.textContent).not.toContain(t('reputation.scoresSection'));
    // A chip row whose chips were removed is still a chip row promising a
    // score; the row itself must be gone.
    const chipRows = Array.from(html.querySelectorAll('.xidig-chip-row'));
    for (const row of chipRows) {
      expect(row.textContent).not.toMatch(FORBIDDEN_NUMBERS);
    }
  });

  it('keeps tenure — a fact about joining is not a score', async () => {
    const html = await page('member');
    const row = html.querySelector('.xidig-profile__counts');

    expect(html.textContent).toContain(tenure);
    // Absence is the point: not two blank spans, not a hidden pair. One child,
    // and it is the joining fact.
    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(1);
    expect(row?.children[0]?.textContent).toBe(tenure);
  });

  it('shows the visitor no lanes — they are how you get found, not what you display', async () => {
    const html = await page('member');

    expect(html.textContent).not.toContain(t('profile.lanesLabel'));
    for (const lane of ['tech', 'ganacsi']) {
      expect(html.textContent).not.toContain(lane);
    }
  });

  it('never mounts the owner’s private block in the shareable column', async () => {
    const html = await page('member');

    expect(html.querySelector('.xidig-aniga__rail')).toBeNull();
    expect(html.querySelector('.xidig-aprivate')).toBeNull();
    expect(html.textContent).not.toContain(t('profile.privateStatsTitle'));
  });
});

describe('assembled page — the owner’s seat', () => {
  it('shows the flag-held module as a locked card with a refused eye (10a)', async () => {
    const html = await page('owner');
    const card = html.querySelector('[data-module="metrics"]');

    expect(card).not.toBeNull();
    expect(card?.className).toContain('xidig-amodule--locked');
    expect(html.querySelector('.xidig-amodule__flag')?.textContent).toBe(
      t('profile.moduleVisitorsOff'),
    );

    const eye = card?.querySelector('.xidig-amodule__eye');
    expect(eye?.getAttribute('aria-pressed')).toBe('false');
    expect(eye?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps lanes out of the shareable column — they moved to the rail’s Xogta card', async () => {
    const html = await page('owner');

    // Ruled 11 Aug. Lanes are still owner-only and still confirmed back to the
    // member, but as a labelled <dl> row in `AnigaFacts` (see
    // aniga-facts.test.tsx), not as chips: a `.xidig-tag` here is the
    // typography of attested evidence, and these chips sat as adjacent
    // siblings to the reputation chips in identical markup.
    expect(html.textContent).not.toContain(t('profile.lanesLabel'));
    // Chip text, not a substring sweep: "ganacsi" is also an ordinary Somali
    // word, and the owner's empty-Suuq invitation uses it.
    const chips = Array.from(html.querySelectorAll('.xidig-tag')).map((node) => node.textContent);
    for (const lane of ['tech', 'ganacsi']) {
      expect(chips).not.toContain(lane);
    }
  });

  it('renders the private stats in the rail, with their real numbers', async () => {
    const html = await page('owner');
    const block = html.querySelector('.xidig-aniga__rail .xidig-aprivate');

    expect(block).not.toBeNull();
    expect(block?.textContent).toContain(t('profile.privateStatsTitle'));
    expect(block?.textContent).toContain(String(METRICS.connections));
    expect(block?.textContent).toContain(t('profile.privateStatsNote'));
  });

  it('renders the module manager beside the column, not inside it', async () => {
    const html = await page('owner');

    expect(html.querySelector('.xidig-aniga__rail .xidig-amanager--rail')).not.toBeNull();
    expect(html.querySelector('.xidig-aniga__modules .xidig-amanager')).toBeNull();
    expect(html.textContent).toContain(t('profile.managerTitle'));
  });

  it('brings the counts back — which is what makes the visitor pass a decision', async () => {
    const html = await page('owner');
    const row = html.querySelector('.xidig-profile__counts');

    expect(Array.from(row?.children ?? []).map((node) => node.textContent)).toEqual([
      t('profile.followersCount', { count: FOLLOWERS }),
      t('profile.vouchesCount', { count: VOUCHES }),
      tenure,
    ]);
    expect(html.textContent).toContain(t('reputation.contributionChip', { count: CONTRIBUTION }));
    expect(html.textContent).toContain(t('reputation.helperChip', { count: HELPER_SCORE }));
  });
});

describe('assembled page — A15: Lite defers bytes, never features', () => {
  it('routes the cover and the showcase image through MediaSlot', async () => {
    const html = await page('member');
    const cover = html.querySelector('.xidig-aniga__cover');

    expect(cover?.className).toContain('xidig-media-slot');
    // No raw <img> anywhere: every pixel on this page must be deferrable, and
    // one hand-rolled tag is all it takes to bill a Lite reader for it.
    for (const img of Array.from(html.querySelectorAll('img'))) {
      expect(img.closest('.xidig-media-slot')).not.toBeNull();
    }
    expect(html.querySelector(`img[src="${COVER_URL}"]`)).not.toBeNull();
    expect(html.querySelector(`img[src="${SHOWCASE_URL}"]`)).not.toBeNull();
  });

  it('keeps every slot and every module in Lite — only the bytes wait', async () => {
    const lite = await page('member', LITE_BUNDLES.essentials);

    // The bytes are gone…
    expect(lite.querySelector(`img[src="${COVER_URL}"]`)).toBeNull();
    expect(lite.querySelector(`img[src="${SHOWCASE_URL}"]`)).toBeNull();
    // …the slots are not, and each says what it costs and offers to load it.
    expect(lite.querySelector('.xidig-aniga__cover.xidig-media-slot')).not.toBeNull();
    expect(lite.querySelectorAll('.xidig-media-slot').length).toBe(2);
    expect(lite.querySelectorAll('.xidig-media-slot__show').length).toBe(2);
    expect(lite.textContent).toContain(t('lite.show'));
    // …and the feature set is identical: same modules, same order.
    expect(
      Array.from(lite.querySelectorAll('[data-module]')).map((node) =>
        node.getAttribute('data-module'),
      ),
    ).toEqual(VISITOR_ORDER);
  });
});
