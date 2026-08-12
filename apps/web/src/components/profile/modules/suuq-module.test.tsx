// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { SuuqModule, type SuuqListingSummary } from './suuq-module';

/**
 * Suuq (spec §3.9).
 *
 * The acceptance criterion is the testimonial gate: a member quote renders
 * ONLY when its customer resolves to a linkable profile. Everything else on
 * the card is checkable — the verification chip comes from the §18 flow, the
 * listing links to its own page — so an unattributable quote would be the one
 * unfalsifiable claim on the surface, and it would be sitting next to the
 * trust chip lending it credibility it never earned.
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

const LISTING: SuuqListingSummary = {
  id: 'listing-1',
  businessName: 'Axmed & Co',
  categoryName: 'La-talin ganacsi',
  city: 'London',
  verified: true,
  photoUrl: null,
  photoThumbUrl: null,
  photoBlurhash: null,
  photoAlt: null,
  photoBytes: null,
};

const QUOTE =
  'Canshuurtayadii saddex sano ee dib u dhacsanayd — laba toddobaad ayay ku hagaajisay.';

const base = {
  viewer: 'member' as const,
  prefs: LITE_BUNDLES.everything,
  addHref: '/suuq/new',
};

describe('the testimonial requires a resolvable customer link', () => {
  it('renders quote and attribution when the customer resolves', async () => {
    const html = await mount(
      createElement(SuuqModule, {
        ...base,
        listing: LISTING,
        testimonial: {
          quote: QUOTE,
          customer: { displayName: 'Faysal Hirsi', handle: 'faysal', avatarUrl: null },
        },
      }),
    );

    expect(html.querySelector('.xidig-asuuq__quote')?.textContent).toBe(QUOTE);
    const attribution = html.querySelector<HTMLAnchorElement>('.xidig-asuuq__customer');
    // The attribution IS the link — that is what makes the quote checkable.
    expect(attribution?.getAttribute('href')).toBe('/u/faysal');
    expect(attribution?.textContent).toContain('Faysal Hirsi · macmiil la xaqiijiyay');
  });

  it('drops the whole block when the customer does not resolve', async () => {
    const html = await mount(
      createElement(SuuqModule, {
        ...base,
        listing: LISTING,
        testimonial: { quote: QUOTE, customer: null },
      }),
    );

    expect(html.querySelector('.xidig-asuuq__testimonial')).toBeNull();
    expect(html.querySelector('.xidig-asuuq__quote')).toBeNull();
    // Not merely unlinked: the words themselves never reach the DOM, so no
    // stylesheet or copy-paste can resurrect them as an anonymous claim.
    expect(html.textContent).not.toContain(QUOTE);
    expect(html.textContent).not.toContain('Markhaati xubneed');
    // The rest of the card is unharmed — the gate costs one paragraph.
    expect(html.querySelector('.xidig-asuuq__cta')?.getAttribute('href')).toBe('/l/listing-1');
  });

  it('drops it when the customer has no handle to link to', async () => {
    const html = await mount(
      createElement(SuuqModule, {
        ...base,
        listing: LISTING,
        testimonial: {
          quote: QUOTE,
          customer: { displayName: 'Faysal Hirsi', handle: '  ', avatarUrl: null },
        },
      }),
    );
    expect(html.querySelector('.xidig-asuuq__testimonial')).toBeNull();
    expect(html.querySelector('a[href^="/u/"]')).toBeNull();
  });

  it('renders no empty testimonial frame when there is no quote', async () => {
    for (const testimonial of [null, undefined, { quote: '   ', customer: null }]) {
      const html = await mount(
        createElement(SuuqModule, { ...base, listing: LISTING, testimonial }),
      );
      expect(html.querySelector('.xidig-asuuq__testimonial')).toBeNull();
    }
  });
});

describe('the chip comes from the badge canon, not from this card', () => {
  it('wears the identity check and trust orange when verified', async () => {
    const html = await mount(createElement(SuuqModule, { ...base, listing: LISTING }));
    const chip = html.querySelector('.xidig-asuuq__verified .xidig-badge-chip');
    expect(chip?.className).toContain('xidig-tag--trust');
    expect(chip?.textContent).toContain('Ganacsi Xaqiiqeysan');
  });

  it('mints no chip for an unverified listing', async () => {
    const html = await mount(
      createElement(SuuqModule, { ...base, listing: { ...LISTING, verified: false } }),
    );
    expect(html.querySelector('.xidig-asuuq__verified')).toBeNull();
    expect(html.textContent).not.toContain('Xaqiiqeysan');
  });
});

describe('no listing', () => {
  it('is an absent module for a visitor, not an empty card', async () => {
    for (const viewer of ['member', 'anon'] as const) {
      const html = await mount(createElement(SuuqModule, { ...base, viewer, listing: null }));
      expect(html.querySelector('[data-module="suuq"]'), viewer).toBeNull();
      expect(html.children, viewer).toHaveLength(0);
    }
  });

  it('is an invitation for the owner', async () => {
    const html = await mount(
      createElement(SuuqModule, { ...base, viewer: 'owner' as const, listing: null }),
    );
    expect(html.querySelector('.xidig-asuuq__empty-body')?.textContent).toContain(
      'Weli ma lihid liis Suuq ah',
    );
    expect(
      html.querySelector<HTMLAnchorElement>('.xidig-asuuq__empty a')?.getAttribute('href'),
    ).toBe('/suuq/new');
  });
});
