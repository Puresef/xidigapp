// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { EventForm, type EventFormOptions } from './event-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

/**
 * Regression: the /events/new timezone hydration mismatch. The form rendered
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` as text, so SSR emitted
 * the SERVER's zone (UTC in production) while the browser hydrated with the
 * user's — a guaranteed text mismatch for any non-server-zone visitor. Same
 * headless overlay-equivalent technique as relative-time-hydration.test.tsx:
 * render to string under a stubbed server timezone, hydrate under the real
 * one, require zero recoverable hydration errors.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A zone no real box runs in, so it always differs from the test runtime's.
const SERVER_TZ = 'Etc/GMT+12';

const options: EventFormOptions = {
  isModOrAdmin: false,
  labs: [],
  listings: [],
  categories: [{ slug: 'community', name: 'Community' }],
};

const ui = (): ReactElement =>
  createElement(LocaleProvider, {
    initialLocale: 'en' as const,
    children: createElement(EventForm, { options }),
  });

/** Render like a server whose runtime resolves a different timezone. */
function renderOnServerInZone(element: ReactElement): string {
  const original = Intl.DateTimeFormat;
  const stub = function (
    locale?: string | string[],
    opts?: Intl.DateTimeFormatOptions,
  ) {
    const real = new original(locale, opts);
    return {
      format: real.format.bind(real),
      formatToParts: real.formatToParts.bind(real),
      resolvedOptions: () => ({ ...real.resolvedOptions(), timeZone: SERVER_TZ }),
    };
  } as unknown as typeof Intl.DateTimeFormat;
  (stub as { supportedLocalesOf?: unknown }).supportedLocalesOf =
    original.supportedLocalesOf.bind(original);
  (Intl as { DateTimeFormat?: unknown }).DateTimeFormat = stub;
  try {
    return renderToString(element);
  } finally {
    (Intl as { DateTimeFormat?: unknown }).DateTimeFormat = original;
  }
}

describe('EventForm timezone hint survives server/client timezone divergence', () => {
  it('never SSRs the server zone, hydrates cleanly, then shows the browser zone', async () => {
    const element = ui();
    const html = renderOnServerInZone(element);
    expect(html).not.toContain(SERVER_TZ);

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const recoverable: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, element, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    expect(recoverable).toEqual([]);

    // After mount the hint must show the real (browser) zone — the fix is
    // "resolve after mount", not "never show the timezone".
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    expect(container.textContent).toContain(browserZone);
    container.remove();
  });
});
