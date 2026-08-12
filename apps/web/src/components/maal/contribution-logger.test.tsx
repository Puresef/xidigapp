// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { ApiRequestError } from '@/lib/api-client';
import { CONTRIBUTION_QUEUE_KEY, CONTRIBUTION_QUEUE_TTL_MS } from '@/lib/maal/contribution-queue';

import { MaalContributionLogger } from './contribution-logger';

/**
 * The self-log (frame 7c) and state m5 — live DOM, SOMALI dictionary, the
 * harness idiom from events/rsvp-buttons.test.tsx.
 *
 * Two things are load-bearing enough to be locked here:
 *
 *  1. **The unit of money.** The ledger stores and renders `money` in CENTS
 *     (`WORK_QUANTITY_*`, `money_cents`, `maal.eventMoney`), and a member types
 *     whole currency units. The conversion happens exactly once, at submit, and
 *     the same converted value is what the OFFLINE queue parks — otherwise a
 *     replayed log would append a different number than the live one. This is
 *     the worst possible place for a unit to be ambiguous: `work_events` is
 *     append-only, so "$500 recorded as $5.00" is permanent and can only be
 *     answered by a public reversal event. The field says its unit and echoes
 *     the exact figure it will append, and these tests assert both.
 *
 *  2. **A queued log that never made it in says so.** `flushContributionQueue`
 *     reports `refused` (the server answered no) and `expired` (aged past the
 *     TTL, never sent) alongside `sent`. Dropping either on the floor loses a
 *     member's work silently on a LEDGER, so both surface, in their own words —
 *     refused says the server declined it, expired says it was never sent and
 *     has to be entered again.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPost = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/api-client', () => {
  // Declared inside the factory: vi.mock is hoisted above the module body.
  class ApiRequestError extends Error {
    constructor(public readonly plain: { code: string; message: string }) {
      super(plain.message);
    }
  }
  return { apiPost: (...args: unknown[]) => apiPost(...args), ApiRequestError };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => refresh() }),
  usePathname: () => '/labs/suuq-card',
}));

const LAB_ID = '11111111-1111-4111-8111-111111111111';
const TASK = { id: '22222222-2222-4222-8222-222222222222', title: 'Isku xir Stripe Connect' };

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ contribution: null });
  refresh.mockReset();
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = '';
});

function mount() {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="so">
        <MaalContributionLogger labId={LAB_ID} tasks={[TASK]} />
      </LocaleProvider>,
    ),
  );
}

/** React's controlled inputs dedupe against their own value tracker — go
 *  through the NATIVE setter so the dispatched event registers as a change. */
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value);
  act(() => {
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', {
        bubbles: true,
      }),
    );
  });
}

/** The sheet portals to <body>, so every form query starts there. */
function inDialog<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(`.xidig-modal__panel ${selector}`);
  if (!found) throw new Error(`"${selector}" not found in the dialog`);
  return found;
}

function buttonByText(text: string, scope: ParentNode = document.body): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

function openSheet() {
  act(() => buttonByText('Diiwaangeli wax-ku-darsi', container).click());
}

/** Fill the sheet and submit it. `amount` is what the MEMBER types. */
async function log(type: string, amount: string) {
  openSheet();
  const selects = [...document.querySelectorAll<HTMLSelectElement>('.xidig-modal__panel select')];
  // [0] = the task, [1] = the type.
  setValue(selects[1]!, type);
  setValue(inDialog<HTMLInputElement>('input[type="number"]'), amount);
  await act(async () => {
    buttonByText('Diiwaangeli', document.querySelector('.xidig-modal__panel')!).click();
  });
}

function postedBody(): Record<string, unknown> {
  const [, body] = apiPost.mock.calls[0] as [string, Record<string, unknown>];
  return body;
}

describe('money is entered in whole units and recorded in cents', () => {
  it('POSTs $500 as 50000 — one conversion, at the boundary', async () => {
    mount();

    await log('money', '500');

    expect(apiPost).toHaveBeenCalledWith(`/api/labs/${LAB_ID}/contributions`, expect.anything());
    expect(postedBody()).toMatchObject({ type: 'money', quantity: 50_000 });
  });

  it('rounds to whole cents rather than sending a fraction of one', async () => {
    mount();

    await log('money', '12.345');

    expect(postedBody()).toMatchObject({ quantity: 1235 });
  });

  it('leaves every other type alone — 3 hours is 3, not 300', async () => {
    mount();

    await log('hours', '3');

    expect(postedBody()).toMatchObject({ type: 'hours', quantity: 3 });
  });

  it('parks the SAME converted value offline, so a replay appends what the live send would have', async () => {
    apiPost.mockRejectedValue(new TypeError('Failed to fetch'));
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      mount();

      await log('money', '500');

      const queued = JSON.parse(
        window.localStorage.getItem(CONTRIBUTION_QUEUE_KEY) ?? '[]',
      ) as Array<Record<string, unknown>>;
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ type: 'money', quantity: 50_000 });
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('says its unit and echoes what will be recorded — only for money', () => {
    mount();
    openSheet();

    // Hours (the default): a bare count, no currency anywhere near it.
    const label = () => inDialog('.xidig-field:has(input[type="number"]) .xidig-field__label');
    expect(label().textContent).toBe('Inta');
    expect(document.querySelector('.xidig-modal__panel .xidig-field__hint')).toBeNull();

    const selects = [...document.querySelectorAll<HTMLSelectElement>('.xidig-modal__panel select')];
    setValue(selects[1]!, 'money');

    // The label carries the currency the amount is read in…
    expect(label().textContent).toContain('USD');
    const hint = inDialog('.xidig-field__hint');
    expect(hint.textContent).toContain('ma aha senti');
    // …and the input points at it.
    expect(
      inDialog<HTMLInputElement>('input[type="number"]').getAttribute('aria-describedby'),
    ).toBe(hint.id);

    // Typing 500 echoes $500, never $5.00 — the guard sits BEFORE the append.
    setValue(inDialog<HTMLInputElement>('input[type="number"]'), '500');
    const echo = inDialog('.xidig-field__hint').textContent ?? '';
    expect(echo).toContain('Waxaa loo diiwaangelinayaa');
    expect(echo).toContain('500');
    expect(echo).not.toContain('5.00');
  });
});

describe('a queued log that never made it in', () => {
  /** One entry parked for this venture, as the offline path would leave it. */
  function park(queuedAt: number) {
    window.localStorage.setItem(
      CONTRIBUTION_QUEUE_KEY,
      JSON.stringify([
        {
          id: 'log-1',
          labId: LAB_ID,
          type: 'hours',
          quantity: 3,
          taskId: TASK.id,
          note: null,
          occurredAt: '2026-08-11T09:30:00.000Z',
          label: TASK.title,
          queuedAt,
        },
      ]),
    );
  }

  it('says the server declined it — and does not offer a retry', async () => {
    park(Date.now() - 60_000);
    apiPost.mockRejectedValue(
      new ApiRequestError({ code: 'forbidden', message: 'Diiwaanku waa xiran' }),
    );

    await act(async () => mount());

    const notice = container.querySelector('.xidig-maal-queue--lost');
    expect(notice, 'a refused log must not disappear in silence').not.toBeNull();
    expect(notice!.textContent).toContain('server-ku wuu diiday');
    // The entry is gone from the queue — the server already answered it.
    expect(JSON.parse(window.localStorage.getItem(CONTRIBUTION_QUEUE_KEY) ?? '[]')).toHaveLength(0);
    expect(container.querySelector('.xidig-maal-queue__list')).toBeNull();
  });

  it('says an aged-out log was never sent and has to be entered again', async () => {
    park(Date.now() - CONTRIBUTION_QUEUE_TTL_MS - 1_000);

    await act(async () => mount());

    const notice = container.querySelector('.xidig-maal-queue--lost');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Mar kale geli');
    // Never sent: an expired entry is dropped at flush, not replayed.
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('dismisses on request, and a clean flush never raises it at all', async () => {
    park(Date.now() - 60_000);
    apiPost.mockRejectedValue(
      new ApiRequestError({ code: 'forbidden', message: 'Diiwaanku waa xiran' }),
    );

    await act(async () => mount());
    await act(async () => {
      buttonByText('Iska dhaaf', container).click();
    });
    expect(container.querySelector('.xidig-maal-queue--lost')).toBeNull();

    if (root) act(() => root!.unmount());
    root = null;
    apiPost.mockReset();
    apiPost.mockResolvedValue({ contribution: null });
    park(Date.now() - 60_000);

    await act(async () => mount());

    expect(container.querySelector('.xidig-maal-queue--lost')).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });
});
