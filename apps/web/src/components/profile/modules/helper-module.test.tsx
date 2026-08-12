// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import type { AnigaHelperEntry } from '@/lib/aniga/view';

import { HelperModule } from './helper-module';

/**
 * Caawimo (spec §3.7).
 *
 * The module makes one claim — "Qofka codsiga leh ayaa xaqiijiyay" — and
 * every assertion here is about whether a row can still be read as evidence:
 *
 *  1. **No asker, no row.** The crediting member IS the attestation, so an
 *     entry without one is a self-report and must not reach the DOM wearing a
 *     trust chip. Type-level non-nullability is not the lock; this is.
 *  2. **The time comes from the dictionary.** `Intl.RelativeTimeFormat` falls
 *     back to English silently and broke so-locale hydration once already, so
 *     the Somali string is asserted rather than the presence of a `<time>`.
 *  3. **Nothing is aggregated.** No helper score, no total, no streak — only
 *     facts an outsider could go and check.
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

const DAY = 24 * 60 * 60 * 1000;
const threeDaysAgo = () => new Date(Date.now() - 3 * DAY).toISOString();

const CREDITED: AnigaHelperEntry = {
  postId: 'post-1',
  title: 'Xisaabiye af-Soomaali ah oo yaqaan canshuuraha ganacsiga yaryar',
  resolvedAt: threeDaysAgo(),
  creditedBy: {
    displayName: 'Cali Maxamed',
    handle: 'cali',
    avatarUrl: null,
    city: 'Minneapolis',
  },
};

describe('a credited resolution renders as four checkable facts', () => {
  it('shows the trust chip, the age, the ask and the asker', async () => {
    const html = await mount(
      createElement(HelperModule, {
        entries: [CREDITED],
        viewer: 'member' as const,
        displayName: 'Deeqa',
      }),
    );

    // Earned milestone — the one chip on this row allowed to wear orange.
    const chip = html.querySelector('.xidig-ahelper__chip');
    expect(chip?.className).toContain('xidig-tag--trust');
    expect(chip?.textContent).toContain('La xaliyay');

    // The ask is a link, so the claim can be opened and checked.
    expect(html.querySelector<HTMLAnchorElement>('.xidig-ahelper__row')?.getAttribute('href')).toBe(
      '/p/post-1',
    );
    expect(html.querySelector('.xidig-ahelper__title')?.textContent).toBe(CREDITED.title);

    // One key carries name AND city — never two translated fragments joined.
    expect(html.querySelector('.xidig-ahelper__credit')?.textContent).toContain(
      'Cali Maxamed ayaa xaqiijiyay · Minneapolis',
    );
  });

  it('takes its relative time from the dictionary, not Intl', async () => {
    const html = await mount(
      createElement(HelperModule, {
        entries: [CREDITED],
        viewer: 'member' as const,
        displayName: 'Deeqa',
      }),
    );
    const time = html.querySelector('.xidig-ahelper__time');
    // The so dictionary's time.daysAgo. Intl would silently emit English here.
    expect(time?.textContent).toBe('3 maalmood ka hor');
    expect(time?.getAttribute('datetime')).toBe(CREDITED.resolvedAt);
  });

  it('states who attested it, in the footnote, to every viewer', async () => {
    for (const viewer of ['owner', 'member', 'anon'] as const) {
      const html = await mount(
        createElement(HelperModule, {
          entries: [CREDITED],
          viewer,
          displayName: 'Deeqa',
        }),
      );
      expect(html.querySelector('.xidig-amodule__note')?.textContent, viewer).toBe(
        'Codsiyada Deeqa caawisay oo la xaliyay. Qofka codsiga leh ayaa xaqiijiyay — ma aha wax la iska sheegtay.',
      );
    }
  });

  it('aggregates nothing — the only figures are the ages of the rows', async () => {
    const html = await mount(
      createElement(HelperModule, {
        entries: [CREDITED, { ...CREDITED, postId: 'post-2', title: 'Akoon ganacsi' }],
        viewer: 'anon' as const,
        displayName: 'Deeqa',
      }),
    );
    const copy = (html.textContent ?? '').replace(/3 maalmood ka hor/g, '');
    // No "×2", no score, no total: a count here would be a claim the rows
    // cannot substantiate individually.
    expect(copy).not.toMatch(/\d/);
  });
});

describe('an uncredited resolution is not a resolution', () => {
  it('drops an entry whose asker did not resolve', async () => {
    const orphan = { ...CREDITED, postId: 'post-orphan', creditedBy: null };
    const html = await mount(
      createElement(HelperModule, {
        // The projection promises an asker; the row is what is being guarded.
        entries: [CREDITED, orphan as unknown as AnigaHelperEntry],
        viewer: 'member' as const,
        displayName: 'Deeqa',
      }),
    );

    expect(html.querySelectorAll('.xidig-ahelper__item')).toHaveLength(1);
    expect(html.querySelector('a[href="/p/post-orphan"]')).toBeNull();
    // Not merely unlinked: no trust chip was minted for it either.
    expect(html.querySelectorAll('.xidig-ahelper__chip')).toHaveLength(1);
  });

  it('drops an asker with a blank name — an anonymous credit is no credit', async () => {
    const blank: AnigaHelperEntry = {
      ...CREDITED,
      postId: 'post-blank',
      creditedBy: { ...CREDITED.creditedBy, displayName: '  ' },
    };
    const html = await mount(
      createElement(HelperModule, {
        entries: [blank],
        viewer: 'member' as const,
        displayName: 'Deeqa',
      }),
    );
    expect(html.children).toHaveLength(0);
  });

  it('renders no module at all when nothing was credited — owner included', async () => {
    for (const viewer of ['owner', 'member', 'anon'] as const) {
      const html = await mount(
        createElement(HelperModule, { entries: [], viewer, displayName: 'Deeqa' }),
      );
      // A "0 asks helped" card is the zeroed counter a2 refuses to draw.
      expect(html.querySelector('[data-module="helper"]'), viewer).toBeNull();
      expect(html.children, viewer).toHaveLength(0);
      expect(html.textContent, viewer).toBe('');
    }
  });
});

describe('owner chrome stays on the owner side of the shell', () => {
  it('gives a visitor no drag handle and no eye', async () => {
    const html = await mount(
      createElement(HelperModule, {
        entries: [CREDITED],
        viewer: 'member' as const,
        displayName: 'Deeqa',
      }),
    );
    expect(html.querySelector('.xidig-amodule__grip')).toBeNull();
    expect(html.querySelector('.xidig-amodule__eye')).toBeNull();
  });
});
