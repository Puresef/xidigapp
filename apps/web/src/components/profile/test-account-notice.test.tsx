// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderToReadableStream } from 'react-dom/server.browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator, type Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { resolveModuleStates } from '@/lib/aniga/modules';
import type { AnigaView } from '@/lib/aniga/view';
import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type { ProfileView } from '@/lib/profile-view';

import { AnigaProfile, TestAccountNotice } from './aniga-profile';

/**
 * Test-account quarantine (users.is_test) on the profile shell.
 *
 * The projection already strips a test account (testAccountProfileView /
 * testAccountAnigaView) and the /u/ page returns the notice before mounting
 * the shell. This file locks the THIRD line: `AnigaProfile` itself, handed a
 * test account's view that still carries every trust signal — as if some
 * future caller skipped the strip — renders the notice and nothing else. No
 * founding-member (or any) badge, no verification chip or ring, no counts,
 * no reputation, no modules, and neither the caller's actions nor its rail.
 *
 * Both locales, because the dictionary is where copy regressions arrive.
 */

const state = vi.hoisted(() => ({ locale: 'en' as Locale }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator: translator } = await import('@xidig/i18n');
  return {
    getLocale: async () => state.locale,
    getT: async () => translator(state.locale),
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
const CONTRIBUTION = 42;
const HELPER_SCORE = 19;
const ENDORSERS = 23;

/** A test account's base that was NOT stripped: every trust signal present. */
function unstrippedTestBase(): ProfileView {
  return {
    profile: {
      user_id: '11111111-1111-4111-8111-111111111111',
      display_name: 'Ayaan Dev',
      handle: 'ayaan_dev',
      bio: 'Senior engineer',
      location_city: 'Hargeisa',
      location_country: 'Somaliland',
      skills: ['react'],
      lanes: ['tech'],
      links: [],
      contact_options: { email: 'ayaan@example.com' },
      verification_status: 'identity_verified',
      created_at: '2024-03-04T00:00:00Z',
    },
    badges: [
      {
        badge_id: 'b-founding',
        awarded_at: '2024-03-05T00:00:00Z',
        context: null,
        tier: null,
        badge_definitions: {
          slug: 'founding-member',
          name: 'Founding Member',
          description: null,
          badge_class: 'tenure',
        },
      },
      {
        badge_id: 'b-top',
        awarded_at: '2024-03-06T00:00:00Z',
        context: null,
        tier: null,
        badge_definitions: {
          slug: 'top-helper',
          name: 'Top Helper',
          description: null,
          badge_class: 'earned',
        },
      },
    ],
    counts: { followers: FOLLOWERS, vouches: VOUCHES },
    reputation: { contribution: CONTRIBUTION, helper: HELPER_SCORE },
    media: {
      avatarUrl: null,
      avatarThumbUrl: null,
      avatarBlurhash: null,
      coverUrl: 'https://cdn.test/cover.jpg',
      coverThumbUrl: null,
      coverBlurhash: null,
    },
    openTo: ['collaborators'],
    pins: [],
    isAi: false,
    isTest: true,
  };
}

function testView(): AnigaView {
  return {
    base: unstrippedTestBase(),
    headline: 'Injineer software',
    modules: resolveModuleStates([], {}),
    showcase: [],
    skills: [{ skill: 'react', endorsers: ENDORSERS, rank: 1, endorsedByViewer: false }],
    links: [],
    lookingFor: { slugs: ['collaborators'], matches: [] },
    helper: [],
    mutuals: null,
    suuq: null,
    metrics: { posts: 31, asksHelped: 7, connections: 96 },
    privateStats: { posts: 31, asksHelped: 7, connections: 96, cachedAt: null },
    ownerFacts: null,
  };
}

function shell(viewer: 'owner' | 'member'): Promise<HTMLElement> {
  return mount(
    createElement(AnigaProfile, {
      view: testView(),
      viewer,
      prefs: LITE_BUNDLES.everything,
      actions: createElement('button', { type: 'button' }, 'SENTINEL_ACTION'),
      rail: createElement('aside', null, 'SENTINEL_RAIL'),
    }),
  );
}

beforeEach(() => {
  state.locale = 'en';
});

describe.each(['en', 'so'] as const)('AnigaProfile with a test account (%s)', (locale) => {
  const t = createTranslator(locale);

  it.each(['member', 'owner'] as const)(
    'renders the notice and none of the profile for a %s',
    async (viewer) => {
      state.locale = locale;
      const html = await shell(viewer);
      const text = html.textContent ?? '';

      // The notice: title, the seeded-style chip with its tooltip, the body.
      expect(html.querySelector('h1')?.textContent).toBe(t('profile.testAccountTitle'));
      const chip = html.querySelector('.xidig-tag.xidig-tag--seeded');
      expect(chip?.textContent).toBe(t('content.testAccount'));
      expect(chip?.getAttribute('title')).toBe(t('content.testAccountTooltip'));
      expect(text).toContain(t('profile.testAccountBody'));

      // No badge — founding-member included — and no verification chip/ring.
      expect(text).not.toContain(t('profile.badgeFoundingMember'));
      expect(text).not.toContain(t('profile.badgeTopHelper'));
      expect(text).not.toContain(t('profile.verifStatusIdentity'));
      expect(html.querySelector('.xidig-aniga__badges')).toBeNull();
      expect(html.querySelector('.xidig-tag--trust')).toBeNull();
      expect(html.querySelector('.xidig-aniga__check')).toBeNull();
      expect(html.querySelector('.xidig-aniga__avatar--verified')).toBeNull();

      // No counts, reputation, endorsement depth or metrics — not even bare.
      expect(html.querySelector('.xidig-profile__counts')).toBeNull();
      expect(html.innerHTML).not.toMatch(
        new RegExp(
          `\\b(${[FOLLOWERS, VOUCHES, CONTRIBUTION, HELPER_SCORE, ENDORSERS, 31, 96].join('|')})\\b`,
        ),
      );

      // No modules, no profile content, no caller-supplied controls or rail.
      expect(html.querySelector('[data-module]')).toBeNull();
      expect(html.querySelector('.xidig-aniga__modules')).toBeNull();
      expect(text).not.toContain('Ayaan Dev');
      expect(text).not.toContain('Senior engineer');
      expect(text).not.toContain('Hargeisa');
      expect(html.innerHTML).not.toContain('ayaan@example.com');
      expect(html.innerHTML).not.toContain('cdn.test/cover.jpg');
      expect(text).not.toContain('SENTINEL_');
    },
  );
});

describe('the same view without the flag — the control case', () => {
  it('renders the badges, verification and owner counts the guard withholds', async () => {
    const view = testView();
    view.base = { ...view.base, isTest: false };
    const html = await mount(
      createElement(AnigaProfile, { view, viewer: 'owner', prefs: LITE_BUNDLES.everything }),
    );
    const t = createTranslator('en');

    expect(html.textContent).toContain(t('profile.badgeFoundingMember'));
    expect(html.textContent).toContain(t('profile.verifStatusIdentity'));
    expect(html.querySelector('.xidig-profile__counts')?.textContent).toContain(String(FOLLOWERS));
    expect(html.textContent).not.toContain(t('profile.testAccountTitle'));
  });
});

describe('TestAccountNotice', () => {
  it('is synchronous static markup: title, chip with tooltip, body', () => {
    const t = createTranslator('en');
    const html = renderToStaticMarkup(createElement(TestAccountNotice, { t }));

    expect(html).toContain(`<h1 class="xidig-auth__title">${t('profile.testAccountTitle')}</h1>`);
    expect(html).toContain(
      `<span class="xidig-tag xidig-tag--seeded" title="${t('content.testAccountTooltip')}">${t('content.testAccount')}</span>`,
    );
    expect(html).toContain('class="xidig-card__meta"');
  });
});
