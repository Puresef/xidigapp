// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type { TaskView, VentureBoard as VentureBoardModel } from '@/lib/maal/views';

import { VentureBoard } from './venture-board';

/**
 * The work board — frame 7c, in Somali because the frames are the Somali copy.
 *
 * Two rules, both of which the code has to MEAN rather than merely display:
 *
 *  1. **hours are self-logged.** The meter says "Toddobaadkan waxaad
 *     diiwaangelisay {n} saac" — you LOGGED — and it counts the viewer's own
 *     hours only. Nothing on this board observes anybody;
 *  2. **recusal renders as an absence.** On a card assigned to you, the
 *     Marag-fur and Ansixi controls are not disabled — they are not in the DOM.
 *     The API refuses the same move (`error.taskRecusal`), so the missing
 *     button is the courtesy and the server is the rule.
 */

vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getLocale: async () => 'so', getT: async () => createTranslator('so') };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/labs/suuq-card',
}));

async function mount(element: ReactElement): Promise<HTMLElement> {
  const stream = await renderToReadableStream(
    createElement(LocaleProvider, { initialLocale: 'so', children: element }),
  );
  const host = document.createElement('div');
  host.innerHTML = await new Response(stream).text();
  return host;
}

const ME = 'u-hodan';

const task = (overrides: Partial<TaskView> = {}): TaskView => ({
  id: 't1',
  title: 'Isku xir Stripe Connect',
  status: 'submitted',
  workstream: { id: 'ws-1', name: 'Nidaamka' },
  assignee: {
    user_id: ME,
    display_name: 'Hodan Cabdi',
    handle: 'hodan',
    avatar_thumb_url: null,
    avatar_blurhash: null,
  },
  hours: 12.5,
  attested: false,
  updatedAt: '2026-08-12T00:00:00Z',
  ...overrides,
});

const board = (columns: Partial<VentureBoardModel['columns']> = {}): VentureBoardModel =>
  ({
    columns: { planned: [], inProgress: [], attestation: [], done: [], ...columns },
    counts: {
      planned: columns.planned?.length ?? 0,
      inProgress: columns.inProgress?.length ?? 0,
      attestation: columns.attestation?.length ?? 0,
      done: columns.done?.length ?? 0,
    },
    workstreams: [{ id: 'ws-1', name: 'Nidaamka', status: 'active' }],
    workstreamId: null,
    viewerHoursThisWeek: 6.5,
    viewer: {
      userId: ME,
      relation: 'lead',
      isMember: true,
      isLead: true,
      isMod: false,
      canManage: true,
      canContribute: true,
      canReadLedger: true,
      canReadHours: true,
    },
    ...({} as Record<string, never>),
  }) as unknown as VentureBoardModel;

const render = (model: VentureBoardModel) =>
  mount(
    createElement(VentureBoard, {
      board: model,
      slug: 'suuq-card',
      labId: 'lab-1',
      locale: 'so',
      prefs: LITE_BUNDLES.everything,
    }),
  );

describe('the four columns', () => {
  it('names all four with their counts', async () => {
    const host = await render(board({ attestation: [task()] }));
    const heads = [...host.querySelectorAll('.xidig-board__column-head')].map(
      (node) => node.textContent,
    );
    expect(heads).toEqual(['Qorshe0', 'Socda0', 'Marag & ansixin1', 'Dhammaystiran0']);
  });

  it('puts the earned guul star on an attested card and nowhere else', async () => {
    const host = await render(
      board({
        done: [task({ id: 't-done', status: 'verified', attested: true })],
        planned: [task({ id: 't-open', status: 'open', assignee: null, attested: false })],
      }),
    );
    const cards = [...host.querySelectorAll('.xidig-task')];
    const starred = cards.filter((card) => card.querySelector('.xidig-task__star') !== null);
    expect(starred).toHaveLength(1);
    expect(starred[0]!.textContent).toContain('Isku xir Stripe Connect');
  });

  it('draws an unassigned card as a dashed empty chair, with a name for AT', async () => {
    const host = await render(
      board({ planned: [task({ status: 'open', assignee: null, hours: 0 })] }),
    );
    const chair = host.querySelector('.xidig-task__unassigned');
    expect(chair).not.toBeNull();
    expect(chair!.getAttribute('aria-label')).toBe("Mas'uul lama magacaabin");
  });
});

describe('hours are self-logged, never observed', () => {
  it('says "you logged", and offers the logger as a control the member presses', async () => {
    const host = await render(board());
    expect(host.querySelector('.xidig-board__week')?.textContent).toBe(
      'Toddobaadkan waxaad diiwaangelisay 6.5 saac',
    );
    expect(host.textContent).toContain('Diiwaangeli wax-ku-darsi');
  });
});

describe('recusal is an absence, not a disabled button', () => {
  it('offers NO witness control on a card the viewer is assigned to', async () => {
    const host = await render(board({ attestation: [task({ status: 'submitted' })] }));
    const card = host.querySelector('.xidig-task');
    // Not disabled — not there.
    expect(card!.textContent).not.toContain('Marag-fur');
    expect(card!.querySelector('.xidig-task__actions button')).toBeNull();
  });

  it('offers the witness control on someone ELSE’s submitted card', async () => {
    const host = await render(
      board({
        attestation: [
          task({
            status: 'submitted',
            assignee: {
              user_id: 'u-deeqa',
              display_name: 'Deeqa Axmed',
              handle: 'deeqa',
              avatar_thumb_url: null,
              avatar_blurhash: null,
            },
          }),
        ],
      }),
    );
    expect(host.querySelector('.xidig-task__actions')?.textContent).toBe('Marag-fur');
  });

  it('offers NO approve control on the viewer’s own witnessed card, even as the lead', async () => {
    const host = await render(board({ attestation: [task({ status: 'attested' })] }));
    expect(host.querySelector('.xidig-task')!.textContent).not.toContain('Ansixi');
  });

  it('lets a lead approve someone else’s witnessed card', async () => {
    const host = await render(
      board({
        attestation: [
          task({
            status: 'attested',
            assignee: {
              user_id: 'u-deeqa',
              display_name: 'Deeqa Axmed',
              handle: 'deeqa',
              avatar_thumb_url: null,
              avatar_blurhash: null,
            },
          }),
        ],
      }),
    );
    expect(host.querySelector('.xidig-task__actions')?.textContent).toBe('Ansixi');
  });

  it('never lets a plain member approve, own card or not', async () => {
    const model = board({
      attestation: [
        task({
          status: 'attested',
          assignee: {
            user_id: 'u-deeqa',
            display_name: 'Deeqa Axmed',
            handle: 'deeqa',
            avatar_thumb_url: null,
            avatar_blurhash: null,
          },
        }),
      ],
    });
    const host = await render({
      ...model,
      viewer: { ...model.viewer, isLead: false, canManage: false, relation: 'member' },
    } as VentureBoardModel);
    expect(host.querySelector('.xidig-task__actions')).toBeNull();
  });
});
