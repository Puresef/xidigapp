// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { AuthorRef } from '@/lib/plaza/views';

import { CodsiTimeline } from './codsi-timeline';
import { HelperStrip } from './helper-strip';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

/**
 * Regression: the so-locale SSR/hydration mismatch. A server whose ICU lacks
 * Somali CLDR silently emits ENGLISH from Intl.RelativeTimeFormat('so') (no
 * throw), while the browser's full ICU emits Somali — so every SSR'd time
 * node hydration-mismatched under 'so'. This test performs the exact check
 * the dev overlay performs, headlessly: render to string under an
 * English-only Intl (the small-icu server), hydrate under the real Intl (the
 * browser), and require zero recoverable hydration errors. Passing requires
 * relative time to be dictionary-owned, not ICU-owned.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const helper: AuthorRef = {
  display_name: 'Deeqa Axmed',
  handle: 'deeqa',
  location_city: 'London',
  avatar_thumb_url: null,
  avatar_blurhash: null,
  verification_status: 'identity_verified',
};

// Weeks-old fixtures: bucket-stable across the ms between SSR and hydration,
// so any mismatch this test sees is locale data, not clock drift.
const CREATED_AT = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
const HELPED_AT = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const FULFILLED_AT = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const inSomali = (element: ReactElement) =>
  createElement(LocaleProvider, { initialLocale: 'so' as const, children: element });

/** Render like a server whose ICU only has English relative-time data. */
function renderOnEnglishOnlyServer(element: ReactElement): string {
  const original = Intl.RelativeTimeFormat;
  const englishOnly = function (
    _locale?: string | string[],
    options?: Intl.RelativeTimeFormatOptions,
  ) {
    return new original('en', options);
  } as unknown as typeof Intl.RelativeTimeFormat;
  (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = englishOnly;
  try {
    return renderToString(element);
  } finally {
    (Intl as { RelativeTimeFormat?: unknown }).RelativeTimeFormat = original;
  }
}

async function hydrateAndCollectErrors(html: string, element: ReactElement): Promise<unknown[]> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  container.innerHTML = html;
  const recoverable: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, element, {
      onRecoverableError: (error) => recoverable.push(error),
    });
  });
  container.remove();
  return recoverable;
}

describe('so-locale relative time survives an English-only server ICU', () => {
  it('CodsiTimeline: Somali SSR, zero hydration errors', async () => {
    const ui = inSomali(
      createElement(CodsiTimeline, {
        askStatus: 'fulfilled' as const,
        createdAt: CREATED_AT,
        helper,
        helpedAt: HELPED_AT,
        fulfilledAt: FULFILLED_AT,
      }),
    );

    const html = renderOnEnglishOnlyServer(ui);
    expect(html).toContain('ka hor');
    expect(html).not.toMatch(/\d+ (?:weeks?|days?|hours?) ago/);

    expect(await hydrateAndCollectErrors(html, ui)).toEqual([]);
  });

  it('HelperStrip: Somali SSR, zero hydration errors', async () => {
    const ui = inSomali(
      createElement(HelperStrip, {
        helper,
        askerName: 'Cali',
        isAsker: false,
        helpedAt: HELPED_AT,
      }),
    );

    const html = renderOnEnglishOnlyServer(ui);
    expect(html).toContain('ka hor');
    expect(html).not.toMatch(/\d+ (?:weeks?|days?|hours?) ago/);

    expect(await hydrateAndCollectErrors(html, ui)).toEqual([]);
  });
});
