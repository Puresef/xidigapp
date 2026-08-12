// @vitest-environment jsdom
import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server.browser';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';
import type { VentureOverview as VentureOverviewModel } from '@/lib/maal/views';

import { VentureOverview } from './venture-overview';
import { spaceTabs } from './venture-tabs';

/**
 * The venture overview — frames 7b (member/lead) and 7e (non-member).
 *
 * **7e is the headline.** "Shaqada, faylalka, iyo diiwaanka wax-ku-darsiga
 * waxay u furan yihiin xubnaha kaliya" is a promise the page makes to a
 * stranger, and a promise it has to keep by ABSENCE: no work board, no
 * artifacts, no ledger, and no tab advertising any of them. A disabled tab
 * would show a stranger the door to a room and then lock it in front of them,
 * which is a worse answer than not mentioning the room. So the assertions here
 * are absence from the DOM, not `disabled` attributes — a hidden node is still
 * listed, still in the page source, still read by anything that ignores CSS.
 *
 * The other two rules: a decision shows a tally only after it CLOSED (never a
 * running count on a live vote — the Phase 5 poll lesson), and the visibility
 * switches say whose choice they are.
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

const author = (name: string, id: string) => ({
  user_id: id,
  display_name: name,
  handle: name.toLowerCase(),
  avatar_thumb_url: null,
  avatar_blurhash: null,
});

const HODAN = author('Hodan Cabdi', 'u-hodan');

const overview = (overrides: Partial<VentureOverviewModel> = {}): VentureOverviewModel =>
  ({
    lab: {
      id: 'lab-1',
      name: 'Suuq-Card',
      slug: 'suuq-card',
      lead_user_id: 'u-hodan',
      updated_at: '2026-08-06T00:00:00Z',
    },
    viewer: {
      userId: 'u-hodan',
      relation: 'lead',
      isMember: true,
      isLead: true,
      isMod: false,
      canManage: true,
      canContribute: true,
      canReadLedger: true,
      canReadHours: true,
    },
    charter: {
      problem: 'Kharashka kaarku waa qaali',
      hypothesis: null,
      success: null,
      completedAt: null,
      updatedAt: '2026-08-06T00:00:00Z',
    },
    goal: {
      statement: 'Waxaan dhisaynaa nidaam lacag-bixin',
      unit: 'ganacsi firfircoon',
      target: 40,
      progress: 23,
      ratio: 0.575,
    },
    workstreams: [
      {
        id: 'ws-1',
        name: 'Nidaamka lacag-bixinta',
        status: 'active',
        position: 0,
        owner: HODAN,
        taskCount: 11,
        openTaskCount: 4,
      },
      {
        id: 'ws-2',
        name: 'Naqshad',
        status: 'waiting',
        position: 1,
        owner: null,
        taskCount: 5,
        openTaskCount: 5,
      },
    ],
    decisions: [
      {
        id: 'd1',
        title: 'Tijaabada 3aad waxay isticmaalaysaa Stripe Connect',
        decision: 'Adyen waa qaali',
        decidedAt: '2026-08-08T00:00:00Z',
        author: HODAN,
        tally: null,
      },
    ],
    applications: [],
    members: [
      { user: HODAN, role: 'lead', specialization: null, joinedAt: '2026-01-01T00:00:00Z' },
    ],
    memberCount: 6,
    visibility: { publicPage: true, ledgerOpenToMembers: true, hoursLeadsOnly: false },
    capitalNeed: null,
    isDormant: false,
    demotion: null,
    ...overrides,
  }) as unknown as VentureOverviewModel;

const render = (model: VentureOverviewModel) =>
  mount(
    createElement(VentureOverview, {
      overview: model,
      slug: 'suuq-card',
      labId: 'lab-1',
      locale: 'so',
      prefs: LITE_BUNDLES.everything,
    }),
  );

const stranger = (model: VentureOverviewModel = overview()): VentureOverviewModel =>
  ({
    ...model,
    viewer: {
      ...model.viewer,
      relation: 'none',
      isMember: false,
      isLead: false,
      isMod: false,
      canManage: false,
      canContribute: false,
      canReadLedger: false,
      canReadHours: false,
    },
  }) as VentureOverviewModel;

describe('7e — the non-member view: absent, not disabled', () => {
  it('renders the charter, the goal, the open seats and the roster', async () => {
    const host = await render(stranger());
    expect(host.textContent).toContain('Axdiga');
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(host.textContent).toContain('Boosas furan');
    expect(host.textContent).toContain('Xubno · 6');
    expect(host.textContent).toContain('Waxa dadweynahu arkaan');
  });

  it('has NO work board, NO workstream table and NO ledger anywhere in the DOM', async () => {
    const host = await render(stranger());
    // Not hidden. Not disabled. Not present.
    expect(host.querySelector('.xidig-board')).toBeNull();
    expect(host.querySelector('.xidig-ledger')).toBeNull();
    expect(host.querySelector('.xidig-ledger-table')).toBeNull();
    expect(host.querySelector('.xidig-ws-table')).toBeNull();
    // And no lead-only rails leak through either.
    expect(host.querySelector('.xidig-vis-switch')).toBeNull();
    expect(host.querySelector('.xidig-venture__applications')).toBeNull();
  });

  it('says out loud where the wall is', async () => {
    const host = await render(stranger());
    const card = [...host.querySelectorAll('.xidig-venture__card')].find((node) =>
      node.textContent?.includes('Waxa dadweynahu arkaan'),
    );
    expect(card!.textContent).toContain('u furan yihiin xubnaha kaliya');
    expect(card!.textContent).toContain('xubnaha ayaa taas doortay');
  });

  it('offers Codso from the seat itself, and explains who reviews it', async () => {
    const host = await render(stranger());
    const seats = [...host.querySelectorAll('.xidig-venture__seat')];
    expect(seats.length).toBeGreaterThan(0);
    expect(seats[0]!.querySelector('button')?.textContent).toBe('Codso');
    expect(host.textContent).toContain('Hoggaamiyayaashu ayaa eegaya codsiga');
  });

  it('the tab row itself drops work, files, the ledger and capital for a stranger', () => {
    const memberTabs = spaceTabs({ isVenture: true, isMember: true });
    const strangerTabs = spaceTabs({ isVenture: true, isMember: false });

    expect(memberTabs).toContain('work');
    expect(memberTabs).toContain('ledger');
    expect(memberTabs).toContain('capital');
    expect(memberTabs).toContain('artifacts');

    for (const gated of ['work', 'ledger', 'capital', 'artifacts']) {
      expect(strangerTabs, `"${gated}" must not be offered to a non-member`).not.toContain(gated);
    }
    // The overview is always reachable — 7e is a page, not a wall.
    expect(strangerTabs[0]).toBe('overview');
  });

  it('folds the ledger tab away when the members voted it to leads only', () => {
    // A plain member of a leads-only ledger: getVentureLedger answers 403, so
    // the tab must not be offered either. Absent, not disabled — the absence
    // IS the members' own decision, not an error to walk into.
    const tabs = spaceTabs({ isVenture: true, isMember: true, canReadLedger: false });
    expect(tabs).not.toContain('ledger');
    // Everything else they may use stays.
    expect(tabs).toContain('work');
    expect(tabs).toContain('capital');
  });

  it('leaves a Koox and a Warshad tab row exactly as it was', () => {
    expect(spaceTabs({ isVenture: false, isMember: true })).toEqual([
      'overview',
      'updates',
      'artifacts',
      'decisions',
      'members',
      'history',
    ]);
  });
});

describe('7b — the member/lead workspace', () => {
  it('renders an unowned workstream as an OPEN SEAT, not a blank cell', async () => {
    const host = await render(overview());
    const rows = [...host.querySelectorAll('.xidig-ws-row')];
    expect(rows).toHaveLength(2);
    expect(rows[1]!.textContent).toContain('Boos furan');
    expect(rows[1]!.querySelector('.xidig-ws-row__seat-disc')).not.toBeNull();
    expect(rows[1]!.textContent).toContain('Sugaya');
  });

  it('shows NO tally on a decision that has not closed', async () => {
    const host = await render(overview());
    const meta = host.querySelector('.xidig-venture__decision-meta')?.textContent ?? '';
    expect(meta).toContain('Hodan Cabdi');
    // No count of any kind — a running tally changes how people vote.
    expect(meta).not.toContain('raacay');
    expect(meta).not.toContain('diiday');
  });

  it('shows a post-close tally when there is one', async () => {
    const model = overview();
    const host = await render({
      ...model,
      decisions: [{ ...model.decisions[0]!, tally: { agreed: 5, rejected: 1 } }],
    } as VentureOverviewModel);
    expect(host.querySelector('.xidig-venture__decision-meta')?.textContent).toContain(
      '5 xubin oo raacay, 1 diiday',
    );
  });

  it('states whose choice the visibility switches are', async () => {
    const host = await render(overview());
    const switches = [...host.querySelectorAll('.xidig-vis-switch')];
    // The two the venture actually owns; the public page links to Settings,
    // which is the one place that writes labs.visibility.
    expect(switches).toHaveLength(2);
    expect(switches[0]!.getAttribute('role')).toBe('switch');
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('.xidig-vis-footer')?.textContent).toContain('Xubnaha ayaa doortay');
    expect(host.querySelector('.xidig-vis-footer')?.textContent).toContain('Xidig ma dooranayo');
  });

  it('offers Aqbal and Diid on a membership application', async () => {
    const host = await render(
      overview({
        applications: [
          {
            userId: 'u-faysal',
            applicant: author('Faysal Hirsi', 'u-faysal'),
            skill: 'Naqshadeeye',
            requestedWorkstream: { id: 'ws-2', name: 'Naqshadda' },
            requestedAt: '2026-08-10T00:00:00Z',
          },
        ],
      } as Partial<VentureOverviewModel>),
    );
    const application = host.querySelector('.xidig-venture__application');
    expect(application!.textContent).toContain('Faysal Hirsi');
    expect(application!.textContent).toContain('wuxuu codsanaya qaybta Naqshadda');
    const verbs = [...application!.querySelectorAll('button')].map((node) => node.textContent);
    expect(verbs).toEqual(['Aqbal', 'Diid']);
  });

  it('carries the dormant-capital rail card as a door, not a dead end', async () => {
    const host = await render(overview());
    const card = [...host.querySelectorAll('.xidig-venture__card--dashed')].find((node) =>
      node.textContent?.includes('Maalgashi — hurdo'),
    );
    expect(card).toBeDefined();
    expect(card!.textContent).toContain('Lacag ma dhaqaaqi karto');
    expect(card!.querySelector('a')?.getAttribute('href')).toBe('/labs/suuq-card?tab=capital');
  });
});
