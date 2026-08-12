// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { EventCardItem } from '@/lib/events/views';
import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { EventCard } from './event-card';

/**
 * EventCard — frame 9a + the e5/e6 state family (Munaasabado dispatch,
 * Task 5). SSR-rendered against the SOMALI dictionary, because the frames
 * ARE the Somali copy: a card that renders the right structure with the
 * wrong sentence fails here, exactly like a card with the right sentence in
 * the wrong structure.
 *
 * Structural rules under test, each load-bearing for the honesty design:
 *
 *  - ended and cancelled events carry NO RSVP control in the DOM — absence
 *    is structural, not disabled styling (a past event is a record, not an
 *    invitation);
 *  - capacity is a fact ("boos ma banna"), never urgency: the full state is
 *    a disabled verb plus the release rule, no waitlist;
 *  - the attendee stack is capped at three discs no matter what the loader
 *    hands over — the card teases the named wall, it never becomes one.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/events',
}));

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const item = (overrides: Partial<EventCardItem> = {}): EventCardItem => ({
  slug: 'shir-london',
  title: 'Shir-madasha Xidig London',
  startsAt: '2026-08-15T13:00:00Z',
  endsAt: '2026-08-15T16:00:00Z',
  timezone: 'Europe/London',
  mode: 'in_person',
  venueName: 'Whitechapel, London',
  status: 'published',
  capacity: 30,
  coverUrl: null,
  coverThumbUrl: null,
  coverBlurhash: null,
  host: { kind: 'lab', name: 'Ganacsi Yaryar 101', href: '/labs/ganacsi-yaryar-101' },
  goingCount: 14,
  attendedCount: null,
  attendeeSample: [
    { displayName: 'Cali Maxamed', handle: 'cali' },
    { displayName: 'Deeqa Axmed', handle: 'deeqa' },
    { displayName: 'Faysal Hirsi', handle: 'faysal' },
  ],
  viewerRsvp: null,
  isPast: false,
  isFull: false,
  ...overrides,
});

const prefs = LITE_BUNDLES.everything;

const card = (
  overrides: Partial<EventCardItem> = {},
  variant?: 'default' | 'past' | 'cancelled',
): ReactElement =>
  createElement(EventCard, {
    item: item(overrides),
    prefs,
    locale: 'so',
    ...(variant ? { variant } : {}),
  });

describe('default upcoming card (frame 9a)', () => {
  it('offers the single verb and states capacity as confirmed seats', async () => {
    const html = await mount(card());

    const rsvp = html.querySelector('.xidig-event-card__rsvp button');
    expect(rsvp?.textContent).toBe('Waan imanayaa');
    expect(rsvp?.hasAttribute('disabled')).toBe(false);
    expect(html.textContent).toContain('14 / 30 boos la xaqiijiyay');
  });
});

describe('confirmed viewer — the secondary verb, checked and calendared', () => {
  it('renders the confirmed state with aria-pressed and a working calendar link', async () => {
    const html = await mount(card({ viewerRsvp: { status: 'going', showPublicly: true } }));

    const confirmed = html.querySelector('.xidig-event-card__confirmed');
    expect(confirmed).not.toBeNull();
    expect(confirmed?.textContent).toContain('Waad xaqiijisay');
    expect(confirmed?.getAttribute('aria-pressed')).toBe('true');

    const calendarLink = html.querySelector('.xidig-event-card__calendar');
    expect(calendarLink?.getAttribute('href')).toBe('/events/shir-london/calendar.ics');
  });
});

describe('capacity full (e5) — a fact with the release rule, not a waitlist', () => {
  it('disables the verb, says no seats are free, and states the release rule', async () => {
    const html = await mount(card({ goingCount: 30, isFull: true }));

    const rsvp = html.querySelector('.xidig-event-card__rsvp button');
    expect(rsvp).not.toBeNull();
    expect(rsvp?.hasAttribute('disabled')).toBe(true);
    expect(html.textContent).toContain('boos ma banna');
    expect(html.textContent).toContain(
      'Haddii qof ka noqdo, booska isla markiiba wuu furmayaa. Liis sugitaan ma jiro — mudnaan lama iibsado.',
    );
  });
});

describe('past card — a record, never an invitation', () => {
  it('reports what actually happened and renders NO RSVP control at all', async () => {
    // viewerRsvp deliberately 'going': absence must be a structural decision
    // about pastness, never an accident of a fixture with no RSVP to show.
    const html = await mount(
      card(
        { isPast: true, attendedCount: 21, viewerRsvp: { status: 'going', showPublicly: true } },
        'past',
      ),
    );

    expect(html.textContent).toContain('21 qof ayaa yimid');
    expect(html.textContent).toContain('Sawirrada iyo warbixinta');
    expect(html.querySelectorAll('button')).toHaveLength(0);
    expect(html.textContent).not.toContain('Waan imanayaa');
  });
});

describe('cancelled card (e6) — dimmed record, past truth never deleted', () => {
  it('strikes the title, tags the cancellation, and offers no RSVP', async () => {
    const html = await mount(
      card(
        { status: 'cancelled', viewerRsvp: { status: 'going', showPublicly: true } },
        'cancelled',
      ),
    );

    expect(html.querySelector('.xidig-event-card--cancelled')).not.toBeNull();
    const tag = html.querySelector('.xidig-event-card--cancelled .xidig-tag');
    expect(tag?.textContent).toBe('La baajiyay');
    expect(html.querySelectorAll('button')).toHaveLength(0);
    expect(html.textContent).not.toContain('Waan imanayaa');
  });
});

describe('unlimited capacity — stated, never implied', () => {
  it('says there is no seat limit instead of inventing a denominator', async () => {
    const html = await mount(card({ capacity: null, goingCount: 8, attendeeSample: [] }));

    expect(html.textContent).toContain('8 la xaqiijiyay');
    expect(html.textContent).toContain('boos aan xadidnayn');
  });
});

describe('honesty: the stack teases, it does not enumerate', () => {
  it('renders at most three avatar discs even when the loader hands over more', async () => {
    const html = await mount(
      card({
        attendeeSample: [
          { displayName: 'Cali Maxamed', handle: 'cali' },
          { displayName: 'Deeqa Axmed', handle: 'deeqa' },
          { displayName: 'Faysal Hirsi', handle: 'faysal' },
          { displayName: 'Ayaan Warsame', handle: 'ayaan' },
          { displayName: 'Hodan Cabdi', handle: 'hodan' },
        ],
      }),
    );

    expect(html.querySelectorAll('.xidig-event-card__stack .xidig-avatar')).toHaveLength(3);
  });
});

describe('date block layout — visual elements stack via display: contents', () => {
  it('wraps day and month in a date-visual span with aria-hidden, preserving grid layout', async () => {
    const html = await mount(card());

    const dateVisual = html.querySelector('.xidig-event-card__date-visual');
    expect(dateVisual).not.toBeNull();
    expect(dateVisual?.getAttribute('aria-hidden')).toBe('true');

    const day = dateVisual?.querySelector('.xidig-event-card__day');
    const month = dateVisual?.querySelector('.xidig-event-card__month');
    expect(day).not.toBeNull();
    expect(month).not.toBeNull();
  });
});
