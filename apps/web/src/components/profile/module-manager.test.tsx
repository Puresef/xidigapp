// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@xidig/i18n';
import { LocaleProvider } from '@xidig/i18n/react';

import { resolveModuleStates, type AnigaModuleState } from '@/lib/aniga/modules';

import { ModuleManager } from './module-manager';

/**
 * Module manager (spec §1, frames 10e/10b, state v7).
 *
 * The suite is organised around the four things that would still be wrong if
 * the manager merely looked right:
 *
 *  1. **Reorder without a mouse.** Every row can move with buttons alone, so
 *     the assertions never dispatch a drag event. A regression that made drag
 *     the only path would leave these green only if the buttons survived.
 *  2. **The flag row is refused.** No toggle exists for it, the payload never
 *     claims it is visible, and a 409 rolls the arrangement back instead of
 *     leaving a module on screen looking enabled.
 *  3. **Copy law** (ruling 7, endorsed 9 Aug): the locked row states a system
 *     fact in BOTH locales — never "coming soon", never a countdown.
 *  4. **Offline is a chip, not a spinner** — and the queued write can be taken
 *     back, which is the whole reason the chip exists.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
let online = true;

/** The default set: 8 modules, metrics flag-locked, `looking_for` switched off
 *  by the owner (the frames' own demo case). */
function fixture(): AnigaModuleState[] {
  return resolveModuleStates([{ module_id: 'looking_for', position: 4, visible: false }], {});
}

function okResponse(modules: AnigaModuleState[]) {
  return { ok: true, json: async () => ({ data: { modules } }) };
}

function errorResponse(code: string, message: string) {
  return { ok: false, json: async () => ({ error: { code, message } }) };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  online = true;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  // The route reads back rather than echoes, and the manager adopts that
  // answer — so the default stub resolves the payload exactly as the route
  // would. A stub that replied with the ORIGINAL set would silently undo every
  // save and hide a whole class of bug.
  fetchMock = vi.fn(async (_path: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as {
      modules: { moduleId: string; position: number; visible: boolean }[];
    };
    return okResponse(
      resolveModuleStates(
        sent.modules.map((module) => ({
          module_id: module.moduleId,
          position: module.position,
          visible: module.visible,
        })),
        {},
      ),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
});

function mount(ui: ReactNode, locale: Locale = 'so') {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>));
}

async function click(node: Element | null) {
  expect(node).not.toBeNull();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Rows live in a portal for the sheet, so every query starts at the document. */
function rows() {
  return [...document.querySelectorAll<HTMLLIElement>('[data-module-row]')];
}

function rowOrder() {
  return rows().map((row) => row.dataset.moduleRow);
}

function row(moduleId: string) {
  return document.querySelector<HTMLLIElement>(`[data-module-row="${moduleId}"]`);
}

function control(moduleId: string, selector: string) {
  return row(moduleId)!.querySelector<HTMLButtonElement>(selector);
}

function eye(moduleId: string) {
  return control(moduleId, '.xidig-amanager__eye');
}

function sentPayload(callIndex = 0) {
  const [, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(String(init.body)) as {
    modules: { moduleId: string; position: number; visible: boolean }[];
  };
}

async function openSheet() {
  const trigger = document.querySelector<HTMLButtonElement>('.xidig-amanager__trigger')!;
  trigger.focus();
  await click(trigger);
}

describe('the rail card (10b) — the arrangement in the owner’s order', () => {
  it('lists every module once, in stored order, with the owner’s own wording', () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);

    expect(rowOrder()).toEqual([
      'showcase',
      'skills',
      'links',
      'looking_for',
      'spaces',
      'helper',
      'suuq',
      'metrics',
    ]);
    // Warshadaha AAN doortay — the manager is owner-only chrome, so Spaces
    // takes the first-person label, not the visitor's.
    expect(row('spaces')?.textContent).toContain('Warshadaha aan doortay');
    // The rail keeps the short skills label; 320px has no room for the sheet's.
    expect(row('skills')?.querySelector('.xidig-amanager__label')?.textContent).toBe('Xirfadaha');
    expect(document.querySelector('.xidig-amanager__title')?.textContent).toBe('Qaybaha bogga');
    expect(document.querySelector('.xidig-amanager__hint')?.textContent).toBe('Jiid · dami');
  });

  it('saves the moment a switch moves — the card promises no Save button', async () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);
    expect(document.querySelector('.xidig-amanager__save')).toBeNull();

    await click(eye('showcase'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/me/profile/modules');
    expect(init.method).toBe('PUT');
    expect(document.querySelector('.xidig-amanager__note')?.textContent).toContain(
      'Isbeddelku wuu degdegaa',
    );
  });
});

describe('the mobile sheet (10e) — the house Dialog, opened by the frames’ button', () => {
  it('opens on "Habee qaybaha" and traps + returns focus like every other overlay', async () => {
    mount(<ModuleManager modules={fixture()} presentation="sheet" />);
    const trigger = document.querySelector<HTMLButtonElement>('.xidig-amanager__trigger')!;
    expect(trigger.textContent).toContain('Habee qaybaha');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await openSheet();

    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.className).toContain('xidig-amanager--sheet');
    expect(document.activeElement).toBe(panel);
    expect(document.querySelector('.xidig-amanager__hint')?.textContent).toBe(
      'Jiid si aad u kala horraysiiso',
    );
    expect(document.querySelector('.xidig-amanager__save')?.textContent).toBe('Kaydi habaynta');
    expect(document.querySelector('.xidig-amanager__note')?.textContent).toContain(
      'Booqdayaashu waxay arkaan kaliya qaybaha aad shidday',
    );

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('holds the edits until "Kaydi habaynta" — a phone reorder is not eight requests', async () => {
    mount(<ModuleManager modules={fixture()} presentation="sheet" />);
    await openSheet();

    await click(eye('links'));
    await click(control('showcase', '.xidig-amanager__move[aria-label*="Hoos"]'));
    expect(fetchMock).not.toHaveBeenCalled();

    await click(document.querySelector('.xidig-amanager__save'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const sent = sentPayload();
    expect(sent.modules.map((module) => module.moduleId).slice(0, 2)).toEqual([
      'skills',
      'showcase',
    ]);
    expect(sent.modules.find((module) => module.moduleId === 'links')?.visible).toBe(false);
    expect(document.querySelector('.xidig-amanager__saved')?.textContent).toBe(
      'Habayntii waa la kaydiyay.',
    );
  });

  it('uses the fuller skills label the sheet has room for', async () => {
    mount(<ModuleManager modules={fixture()} presentation="sheet" />);
    await openSheet();
    expect(row('skills')?.querySelector('.xidig-amanager__label')?.textContent).toBe(
      'Xirfadaha iyo marag-furka',
    );
  });
});

describe('reordering is operable without a pointer', () => {
  it('moves a row with the buttons alone — no drag event is ever dispatched', async () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);

    await click(control('skills', '.xidig-amanager__move[aria-label*="Kor"]'));
    expect(rowOrder().slice(0, 2)).toEqual(['skills', 'showcase']);

    await click(control('skills', '.xidig-amanager__move[aria-label*="Hoos"]'));
    expect(rowOrder().slice(0, 2)).toEqual(['showcase', 'skills']);
  });

  it('names the row in every control, so eight identical buttons stay distinguishable', () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);

    const labels = rows().flatMap((node) =>
      [...node.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')),
    );
    expect(new Set(labels).size).toBe(labels.length);
    expect(
      control('showcase', '.xidig-amanager__move[aria-label*="Kor"]')?.getAttribute('aria-label'),
    ).toBe('Kor u qaad Bandhig');
    expect(eye('showcase')?.getAttribute('aria-label')).toBe('Qaybta Bandhig waa muuqataa');
    expect(eye('looking_for')?.getAttribute('aria-label')).toBe(
      'Qaybta Waxaan raadinayaa waa qarsoon tahay',
    );
  });

  it('disables only the ends, so the list has no dead middle', () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);
    expect(control('showcase', '.xidig-amanager__move[aria-label*="Kor"]')?.disabled).toBe(true);
    expect(control('showcase', '.xidig-amanager__move[aria-label*="Hoos"]')?.disabled).toBe(false);
    expect(control('metrics', '.xidig-amanager__move[aria-label*="Hoos"]')?.disabled).toBe(true);
    expect(control('metrics', '.xidig-amanager__move[aria-label*="Kor"]')?.disabled).toBe(false);
  });

  it('lets the newest save win when two overlap', async () => {
    // The rail fires a save per change, so a slow first response can land after
    // a fast second one. The rows must end up where the member left them.
    const release: Array<() => void> = [];
    fetchMock.mockImplementation((_path: string, init: RequestInit) => {
      const sent = JSON.parse(String(init.body)) as {
        modules: { moduleId: string; position: number; visible: boolean }[];
      };
      const response = okResponse(
        resolveModuleStates(
          sent.modules.map((module) => ({
            module_id: module.moduleId,
            position: module.position,
            visible: module.visible,
          })),
          {},
        ),
      );
      return new Promise((resolve) => release.push(() => resolve(response)));
    });

    mount(<ModuleManager modules={fixture()} presentation="rail" />);
    await click(control('showcase', '.xidig-amanager__move[aria-label*="Hoos"]'));
    await click(control('showcase', '.xidig-amanager__move[aria-label*="Hoos"]'));

    await act(async () => release[1]!());
    await act(async () => release[0]!());

    expect(rowOrder().slice(0, 3)).toEqual(['skills', 'links', 'showcase']);
  });

  it('renumbers positions from the array, contiguous and 1-based', async () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);
    await click(control('metrics', '.xidig-amanager__move[aria-label*="Kor"]'));

    const sent = sentPayload();
    expect(sent.modules.map((module) => module.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sent.modules[6]?.moduleId).toBe('metrics');
  });
});

describe('the flag row — visible, locked, and genuinely refused', () => {
  it('offers no switch at all, and says who decided', () => {
    mount(<ModuleManager modules={fixture()} presentation="rail" />);

    const locked = row('metrics')!;
    expect(locked.className).toContain('xidig-amanager__row--locked');
    expect(locked.querySelector('.xidig-amanager__eye')).toBeNull();
    expect(locked.querySelector('[aria-pressed]')).toBeNull();
    expect(locked.querySelector('.xidig-amanager__flag')?.textContent).toBe('Damsan');
    expect(locked.querySelector('.xidig-amanager__sub')?.textContent).toBe(
      'Calaamad guud — damsan',
    );
    // Order is still the owner's — only publication is the platform's.
    expect(locked.querySelector('.xidig-amanager__move')).not.toBeNull();
  });

  it('spells the decision out in the sheet, where there is room for the sentence', async () => {
    mount(<ModuleManager modules={fixture()} presentation="sheet" />);
    await openSheet();
    expect(row('metrics')?.querySelector('.xidig-amanager__sub')?.textContent).toBe(
      'Damsan calaamad guud — go’aan madal, ma aha dejin adiga kuu taal',
    );
  });

  it('never claims the module is visible, even when a stale row says it was', async () => {
    // The flag flipped OFF after a save that had it on: the stored row still
    // reads visible=true. Sending that back would 409 the entire arrangement
    // and strand the manager, so the payload reports the truth — it is hidden.
    const stale = resolveModuleStates([{ module_id: 'metrics', position: 8, visible: true }], {});
    expect(stale.find((module) => module.id === 'metrics')?.visible).toBe(true);

    mount(<ModuleManager modules={stale} presentation="rail" />);
    await click(eye('showcase'));

    expect(sentPayload().modules.find((module) => module.moduleId === 'metrics')?.visible).toBe(
      false,
    );
    expect(row('metrics')?.querySelector('.xidig-amanager__eye')).toBeNull();
  });

  it('rolls back and says so when the server refuses (409 module_flag_disabled)', async () => {
    fetchMock.mockImplementation(async () =>
      errorResponse(
        'module_flag_disabled',
        'Qaybtaas waxaa damiyay calaamad guud — halkan lagama shidi karo.',
      ),
    );
    const changes: AnigaModuleState[][] = [];
    mount(
      <ModuleManager
        modules={fixture()}
        presentation="rail"
        onChange={(next) => changes.push(next)}
      />,
    );

    await click(control('metrics', '.xidig-amanager__move[aria-label*="Kor"]'));

    // The server's own §27 sentence, verbatim.
    expect(document.querySelector('.xidig-banner--error')?.textContent).toContain(
      'halkan lagama shidi karo',
    );
    // And the arrangement it refused is gone from the screen AND from the page.
    expect(rowOrder().at(-1)).toBe('metrics');
    expect(
      changes
        .at(-1)
        ?.map((module) => module.id)
        .at(-1),
    ).toBe('metrics');
    expect(row('metrics')?.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('falls back to the manager’s own sentence when the failure carried no copy', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, json: async () => ({}) }));
    mount(<ModuleManager modules={fixture()} presentation="rail" />);

    await click(eye('showcase'));

    expect(document.querySelector('.xidig-banner--error')?.textContent).toBe(
      'Habayntu ma kaydsan. Isku day mar kale.',
    );
    expect(eye('showcase')?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('copy law — the locked row is system state, never a teaser', () => {
  /** Anything that turns "we decided this is off" into "wait for it". */
  const PROMOTIONAL =
    /coming soon|\bsoon\b|stay tuned|dhow?aan|sug|launch|beta|preview|new feature|cusub/i;

  it('states the decision in both locales, on both surfaces, without selling a future', async () => {
    const rendered: Record<string, string> = {};
    for (const presentation of ['sheet', 'rail'] as const) {
      for (const locale of ['so', 'en'] as const) {
        mount(<ModuleManager modules={fixture()} presentation={presentation} />, locale);
        if (presentation === 'sheet') await openSheet();
        const copy = row('metrics')?.textContent ?? '';
        rendered[`${presentation}:${locale}`] = copy;
        const where = `${presentation}/${locale}`;

        expect(copy, where).not.toMatch(PROMOTIONAL);
        expect(copy, where).not.toMatch(/\d/); // no countdown, no tier, no ETA
        expect(copy, where).not.toContain('!');

        act(() => root!.unmount());
        root = null;
      }
    }

    // Both locales really rendered — otherwise the English passes above would
    // be asserting on Somali copy and proving nothing.
    expect(rendered['sheet:so']).not.toBe(rendered['sheet:en']);
    // The sheet has room to name the decider; the rail states the same fact
    // in the words a 320px column allows.
    expect(rendered['sheet:so']).toContain('go’aan madal');
    expect(rendered['sheet:en']).toContain('platform decision');
    expect(rendered['rail:so']).toContain('Calaamad guud — damsan');
    expect(rendered['rail:en']).toContain('Platform flag — off');
  });
});

describe('offline (v7) — the arrangement applies here and waits for the wire', () => {
  it('queues with a chip, not a spinner, and keeps the new order on screen', async () => {
    online = false;
    const changes: AnigaModuleState[][] = [];
    mount(
      <ModuleManager
        modules={fixture()}
        presentation="rail"
        onChange={(next) => changes.push(next)}
      />,
    );

    await click(control('helper', '.xidig-amanager__move[aria-label*="Kor"]'));

    expect(fetchMock).not.toHaveBeenCalled();
    const queue = document.querySelector('.xidig-amanager__queue')!;
    expect(queue.getAttribute('role')).toBe('status');
    expect(queue.querySelector('.xidig-amanager__queue-chip')?.textContent).toContain(
      'Habayntu waa kaydsan tahay',
    );
    expect(queue.textContent).toContain('Waxay baxaysaa marka internetku soo noqdo');
    expect(queue.querySelector('.xidig-amanager__queue-cancel')?.textContent).toBe('Tirtir');
    expect(queue.querySelector('.xidig-amanager__queue-note')?.textContent).toContain(
      'booqdayaashu waxay arkaan marka ay baxdo',
    );
    // No spinner anywhere: nothing is in flight to spin about.
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
    expect(document.querySelector('.xidig-loading-flap')).toBeNull();

    // Optimistic locally — the page already shows the new arrangement.
    expect(rowOrder().slice(4, 6)).toEqual(['helper', 'spaces']);
    expect(
      changes
        .at(-1)
        ?.map((module) => module.id)
        .slice(4, 6),
    ).toEqual(['helper', 'spaces']);
  });

  it('sends the queued arrangement when the connection comes back', async () => {
    online = false;
    mount(<ModuleManager modules={fixture()} presentation="rail" />);
    await click(control('helper', '.xidig-amanager__move[aria-label*="Kor"]'));

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentPayload().modules[4]?.moduleId).toBe('helper');
    expect(document.querySelector('.xidig-amanager__queue')).toBeNull();
  });

  it('takes the queued write back on "Tirtir" — and the page goes back with it', async () => {
    online = false;
    const changes: AnigaModuleState[][] = [];
    mount(
      <ModuleManager
        modules={fixture()}
        presentation="rail"
        onChange={(next) => changes.push(next)}
      />,
    );
    await click(control('helper', '.xidig-amanager__move[aria-label*="Kor"]'));

    await click(document.querySelector('.xidig-amanager__queue-cancel'));

    expect(document.querySelector('.xidig-amanager__queue')).toBeNull();
    expect(rowOrder().slice(4, 6)).toEqual(['spaces', 'helper']);
    expect(
      changes
        .at(-1)
        ?.map((module) => module.id)
        .slice(4, 6),
    ).toEqual(['spaces', 'helper']);

    // Nothing is left waiting, so reconnecting sends nothing.
    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces the queued set when the member keeps editing, rather than stacking sends', async () => {
    online = false;
    mount(<ModuleManager modules={fixture()} presentation="sheet" />);
    await openSheet();

    await click(document.querySelector('.xidig-amanager__save'));
    await click(eye('links'));
    expect(document.querySelector('.xidig-amanager__queue')).not.toBeNull();

    online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentPayload().modules.find((module) => module.moduleId === 'links')?.visible).toBe(
      false,
    );
  });
});
