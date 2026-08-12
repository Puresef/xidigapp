// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator, formatDate, type Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { resolveModuleStates } from '@/lib/aniga/modules';
import type { AnigaView } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type { ProfileView } from '@/lib/profile-view';

import { AnigaProfile } from './aniga-profile';

/**
 * Acceptance A1 — a visitor's profile DOM carries NO follower or vouch count.
 *
 * Retargeted at `AnigaProfile` when the v3 shell replaced `ProfileViewCard`:
 * A1 is locked against whatever actually ships on /u/[handle], never against a
 * component the pages no longer mount. The fixture keeps the module payload
 * empty on purpose — this file is about the header chrome, and the assembled
 * module column has its own test (aniga-profile.test.tsx).
 *
 * The rule is structural on purpose. A count that is merely styled away still
 * ships in the HTML, and a profile that quietly transports the number is a
 * profile that ranks people — it just does it out of sight, where nobody can
 * argue with it. So this asserts on the rendered tree: no text, no node, and
 * not the bare integers either (an aria-label or a data attribute carrying
 * "128" is the same leak wearing a different hat).
 *
 * Three things keep it honest:
 *
 *  1. **The owner pass must find them.** Otherwise a card that renders nothing
 *     at all would pass, and the test would be guarding an accident.
 *  2. **Tenure survives.** "Xubin ilaa …" is a fact about joining, not a
 *     score, and stripping it would be collateral damage — the visitor loses
 *     the one honest piece of context the header gives them.
 *  3. **Both locales.** The dictionary is where a count could come back: an
 *     English fallback leaking into a Somali render is exactly how this kind
 *     of regression has arrived before.
 */

const state = vi.hoisted(() => ({ locale: 'so' as Locale }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return {
    getLocale: async () => state.locale,
    getT: async () => createTranslator(state.locale),
  };
});

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: state.locale, children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const FOLLOWERS = 128;
const VOUCHES = 37;
const CREATED_AT = '2024-03-04T00:00:00Z';

function view(): ProfileView {
  return {
    profile: {
      user_id: '11111111-1111-4111-8111-111111111111',
      display_name: 'Hodan Cabdi',
      handle: 'hodan',
      bio: 'Injineer software',
      location_city: 'London',
      location_country: 'UK',
      skills: [],
      lanes: [],
      links: [],
      contact_options: {},
      verification_status: 'unverified',
      created_at: CREATED_AT,
    },
    badges: [],
    // Non-zero on purpose: a zero would render as "0" and hide a leak behind a
    // number nobody notices.
    counts: { followers: FOLLOWERS, vouches: VOUCHES },
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

/** The header chrome under test, with no module content to distract from it. */
function anigaView(): AnigaView {
  return {
    base: view(),
    headline: null,
    modules: resolveModuleStates([], {}),
    showcase: [],
    skills: [],
    links: [],
    lookingFor: { slugs: [], matches: [] },
    helper: [],
    mutuals: null,
    suuq: null,
    metrics: null,
    privateStats: null,
    ownerFacts: null,
  };
}

const card = (viewer: 'owner' | 'member' | 'anon') =>
  mount(
    createElement(AnigaProfile, {
      view: anigaView(),
      viewer,
      prefs: LITE_BUNDLES.everything,
    }),
  );

/**
 * The module column's trailing note (10c) reads "Tiro raacayaal ma jirto" —
 * there are no follower counts. It is the one sanctioned use of that
 * vocabulary on a visitor's page, so it comes out before the sweep below;
 * every other occurrence is a leak.
 */
function withoutVisitorNote(html: HTMLElement, locale: Locale): string {
  const note = createTranslator(locale)('profile.visitorOrderNote', { name: 'Hodan Cabdi' });
  return (html.textContent ?? '').split(note).join('');
}

/** The exact strings the dictionary would render for this fixture. */
function countStrings(locale: Locale) {
  const t = createTranslator(locale);
  return {
    followers: t('profile.followersCount', { count: FOLLOWERS }),
    vouches: t('profile.vouchesCount', { count: VOUCHES }),
    since: t('profile.memberSince', { date: formatDate(new Date(CREATED_AT), locale) }),
  };
}

beforeEach(() => {
  state.locale = 'so';
});

describe('A1 — the visitor DOM carries no follower or vouch count', () => {
  it.each(['member', 'anon'] as const)('renders none of it for a %s viewer', async (viewer) => {
    const html = await card(viewer);
    const copy = countStrings('so');

    expect(html.textContent).not.toContain(copy.followers);
    expect(html.textContent).not.toContain(copy.vouches);
    // The vocabulary, not just the assembled sentence — a re-worded key or a
    // hand-built "128 · 37" line dies here too.
    expect(withoutVisitorNote(html, 'so')).not.toMatch(/raace|raacayaal|dammaanad|follower|vouch/i);
    // And the bare integers, anywhere in the markup: attribute, comment, or
    // a node styled out of sight still counts as shipping the number.
    expect(html.innerHTML).not.toMatch(new RegExp(`\\b(${FOLLOWERS}|${VOUCHES})\\b`));
  });

  it('leaves the counts row holding tenure alone — no emptied-out count nodes', async () => {
    const html = await card('member');
    const row = html.querySelector('.xidig-profile__counts');

    // Absence is the point: not two blank spans, not a hidden pair. One child,
    // and it is the joining fact.
    expect(row).not.toBeNull();
    expect(row?.children).toHaveLength(1);
    expect(row?.children[0]?.textContent).toBe(countStrings('so').since);
  });

  it('holds in English too — a fallback string is how a count comes back', async () => {
    state.locale = 'en';
    const html = await card('member');
    const copy = countStrings('en');

    expect(html.textContent).not.toContain(copy.followers);
    expect(html.textContent).not.toContain(copy.vouches);
    expect(html.textContent).toContain(copy.since);
  });
});

describe('A1 — the owner still sees their own tallies', () => {
  it('renders both counts, so the visitor assertions are not vacuous', async () => {
    const html = await card('owner');
    const copy = countStrings('so');
    const row = html.querySelector('.xidig-profile__counts');

    expect(html.textContent).toContain(copy.followers);
    expect(html.textContent).toContain(copy.vouches);
    // Followers, vouches, tenure — in that order, in the owner's own row.
    expect(Array.from(row?.children ?? []).map((node) => node.textContent)).toEqual([
      copy.followers,
      copy.vouches,
      copy.since,
    ]);
  });
});

describe('A1 — tenure is not collateral damage', () => {
  it.each(['member', 'anon'] as const)('shows "member since" to a %s viewer', async (viewer) => {
    const html = await card(viewer);
    const { since } = countStrings('so');

    expect(html.textContent).toContain(since);
    // A date, not a duration or a rank — the fact is when they joined.
    expect(since).toContain('2024');
  });
});
