// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';
import { WORK_ORG_MODES } from '@/lib/maal/constants';
import type { VentureIndexRow } from '@/lib/maal/views';

import { MaalIndexList } from './index-list';

/**
 * The Maal index list — frame 7a, rendered against the SOMALI dictionary
 * because the frames ARE the Somali copy.
 *
 * **Ruling 4 is the headline test here.** A Koox (`space_mode = 'club'`) is a
 * social space and must never appear on the Maal index. `listVentureIndex`
 * enforces that in the query, and this component enforces it again at its own
 * boundary — so the assertion is ABSENCE from the DOM, not a hidden node: a
 * club that renders with `display: none` is still listed, still in the page
 * source, still copied by a screen reader that ignores CSS, and still a social
 * space filed among work organisations.
 *
 * The rest of the file locks the row anatomy that carries the design's honesty
 * rules: the per-join-mode verbs (deliberately four different words), and the
 * demoted row wearing the Warshad badge plus its own timeout sentence rather
 * than a badge that pretends the stage never happened.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/capital',
}));

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const row = (overrides: Partial<VentureIndexRow> = {}): VentureIndexRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Suuq-Card',
  slug: 'suuq-card',
  mode: 'venture',
  premise: 'Lacag-bixin qiimo jaban oo loogu talagalay ganacsiyada yaryar ee Soomaalida.',
  opener: {
    user_id: '22222222-2222-4222-8222-222222222222',
    display_name: 'Hodan Cabdi',
    handle: 'hodan',
    avatar_thumb_url: null,
    avatar_blurhash: null,
  },
  openerCity: 'London',
  sprint: null,
  lastActivityAt: '2026-08-10T09:00:00Z',
  isDormant: false,
  demoted: false,
  memberCount: 6,
  memberPreview: [],
  memberOverflow: 3,
  openSeats: 2,
  openSeatNames: ['Naqshad', 'Suuqgeyn'],
  openToAnyone: false,
  viewerRelation: 'member',
  action: 'open',
  ...overrides,
});

const list = (rows: VentureIndexRow[]) =>
  mount(
    createElement(MaalIndexList, {
      rows,
      prefs: LITE_BUNDLES.everything,
      locale: 'so',
    }),
  );

describe('MaalIndexList — ruling 4: Koox is never on the Maal index', () => {
  it('excludes a club from the query itself (nothing to render in the first place)', () => {
    expect(WORK_ORG_MODES).not.toContain('club');
  });

  it('renders NO node for a club handed to it — absent, not hidden', async () => {
    const host = await list([
      row(),
      row({
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Kooxda Kubadda Hargeysa',
        slug: 'kooxda-kubadda',
        mode: 'club',
      }),
      row({
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Gaadiidka Bulshada',
        slug: 'gaadiidka-bulshada',
        mode: 'lab',
        action: 'join',
        openToAnyone: true,
        openSeats: 0,
        openSeatNames: [],
      }),
    ]);

    // The two work organisations are there…
    expect(host.textContent).toContain('Suuq-Card');
    expect(host.textContent).toContain('Gaadiidka Bulshada');
    // …and the club is nowhere in the DOM: no text, no link, no row.
    expect(host.textContent).not.toContain('Kooxda Kubadda Hargeysa');
    expect(host.innerHTML).not.toContain('kooxda-kubadda');
    expect(host.querySelectorAll('.xidig-maal-row')).toHaveLength(2);
  });
});

describe('MaalIndexList — the row anatomy', () => {
  it('speaks a different verb per join mode (the inconsistency is the design)', async () => {
    const host = await list([
      row({ id: 'a1', slug: 'a1', name: 'Mid', action: 'open' }),
      row({ id: 'a2', slug: 'a2', name: 'Laba', action: 'request' }),
      row({ id: 'a3', slug: 'a3', name: 'Saddex', action: 'join' }),
      row({ id: 'a4', slug: 'a4', name: 'Afar', action: 'view' }),
    ]);
    const verbs = [...host.querySelectorAll('.xidig-maal-row__action')].map((cell) =>
      cell.textContent?.trim(),
    );
    expect(verbs).toEqual(['Fur', 'Codso', 'Ku biir', 'Fiiri']);
  });

  it('a demoted venture is a Warshad wearing its history, not a Maal', async () => {
    const host = await list([
      row({
        name: 'Tolka',
        slug: 'tolka',
        mode: 'lab',
        demoted: true,
        premise: 'Dhar-tolid iyo tababar Hargeysa.',
        action: 'view',
      }),
    ]);
    const stage = host.querySelector('.xidig-maal-row__stage')?.textContent ?? '';
    expect(stage).toContain('Warshad');
    expect(stage).toContain('Dib loo celiyay Maal-nimada');
    // The timeout explanation is its OWN sentence, never glued onto the
    // space's own one-liner.
    const premises = [...host.querySelectorAll('.xidig-maal-row__premise')].map(
      (node) => node.textContent,
    );
    expect(premises).toHaveLength(2);
    expect(premises[0]).toBe('Dhar-tolid iyo tababar Hargeysa.');
    expect(premises[1]).toContain('Waqti-dhaaf awgeed');
  });

  it('states the open-work cell for a screen reader even when it renders "—"', async () => {
    const host = await list([row({ openSeats: 0, openSeatNames: [], openToAnyone: false })]);
    const seats = host.querySelector('.xidig-maal-row__seats');
    expect(seats?.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(seats?.querySelector('.xidig-visually-hidden')?.textContent).toBe(
      'Shaqo furan ma jirto',
    );
  });
});
