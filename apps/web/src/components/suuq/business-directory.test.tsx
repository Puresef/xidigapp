// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { BusinessDirectory } from './business-directory';

/**
 * Task 10 live-filtering contract: text inputs debounce ~300ms, sheet
 * selects apply immediately, and — the critical bit — `applied` stays in
 * sync so load-more pages the LIVE filter set, never a stale one. Driven
 * through real DOM events with fake timers; fetch is stubbed.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/suuq',
}));

const listing = {
  id: 'L1',
  owner_user_id: null,
  business_name: 'Hodan Café',
  category_id: 'cat-1',
  short_description: 'Coffee',
  address: null,
  landmark: null,
  latitude: null,
  longitude: null,
  city: 'Hargeisa',
  country: 'Somaliland',
  contact_links: [{ type: 'whatsapp', value: '+252 63 123 4567' }],
  verification_status: 'verified',
  status: 'published',
  created_at: '2026-07-01T00:00:00Z',
  source: 'member',
  opening_hours: null,
  price_range: 2,
  primary_photo_url: null,
  primary_photo_thumb_url: null,
  primary_photo_blurhash: null,
  primary_photo_alt: null,
  photo_count: 0,
  bookmarked: true,
};

/** React's controlled inputs dedupe against their own value tracker — go
 *  through the NATIVE setter so the dispatched event registers as a change. */
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string, eventType: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(eventType, { bubbles: true }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('BusinessDirectory (Task 10)', () => {
  it('debounces text, applies selects immediately, and load-more pages the live filters', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify({ data: { listings: [listing], nextCursor: 'CUR1' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <LocaleProvider initialLocale="en">
          <BusinessDirectory categories={[{ id: 'cat-1', slug: 'cafe', name: 'Café & food' }]} />
        </LocaleProvider>,
      );
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Boot fetch + card upgrades: category chip, `city · country`, the
    // channel-nameless contact CTA, and API-hydrated save state.
    expect(calls).toHaveLength(1);
    expect(host.textContent).toContain('Hodan Café');
    expect(host.textContent).toContain('Café & food');
    expect(host.textContent).toContain('Hargeisa · Somaliland');
    expect(host.textContent).toContain('Message directly');
    expect(host.textContent).not.toContain('WhatsApp');
    expect(host.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('true');

    // Typing does NOT fetch immediately…
    const search = host.querySelector<HTMLInputElement>('#biz-q')!;
    await act(async () => {
      setValue(search, 'ca', 'input');
    });
    expect(calls).toHaveLength(1);
    // …but does after the ~300ms debounce, as a page-1 reset.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(310);
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('q=ca');
    expect(calls[1]).not.toContain('cursor=');

    // CRITICAL: load-more pages the filter set on screen — q=ca + cursor.
    const loadMore = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Load more',
    )!;
    await act(async () => {
      loadMore.click();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('q=ca');
    expect(calls[2]).toContain('cursor=CUR1');

    // Filters sheet: opens as a dialog, disclosure caption present, select
    // applies IMMEDIATELY (no debounce) as a fresh page-1 reset, and the bar
    // button badge counts the active sheet filter.
    const filtersButton = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Filters'),
    )!;
    await act(async () => {
      filtersButton.click();
    });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('already loaded');
    await act(async () => {
      setValue(document.querySelector<HTMLSelectElement>('#biz-category')!, 'cat-1', 'change');
    });
    expect(calls).toHaveLength(4);
    expect(calls[3]).toContain('category=cat-1');
    expect(calls[3]).toContain('q=ca');
    expect(calls[3]).not.toContain('cursor=');
    expect(host.textContent).toContain('Filters · 1');
  });
});
