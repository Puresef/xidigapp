// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { RsvpButtons } from './rsvp-buttons';

/**
 * Review fix 2 (Munaasabado Task 6 detail-page review — privacy). The detail
 * page re-homes the show-publicly checkbox beneath the attendee wall
 * (ShowPubliclyToggle) and passes withShowPublicly={false} here so the
 * choice is made in exactly one place. Before the fix, the Going/Interested
 * verb handlers still sent this component's INTERNAL `showPublicly` state —
 * which goes stale the moment the external toggle changes it, because
 * `router.refresh()` only updates props, never this component's own state.
 * An opted-out member clicking a verb was silently getting re-publicized.
 *
 * The fix: when withShowPublicly is false, verb PUTs read the fresh,
 * server-confirmed value straight off the `rsvp` prop (never the internal
 * state), defaulting to `true` — the zod/DB default — only for a genuinely
 * first RSVP. The field is never omitted from the payload, since an
 * omission would hit the same zod default and could flip an opted-out
 * member on an EXISTING rsvp too.
 *
 * Live-DOM suite, SOMALI dictionary — harness idiom from
 * cancel-event-button.test.tsx / checkin-list.test.tsx.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPut = vi.fn();
const apiDelete = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiPut: (...args: unknown[]) => apiPut(...args),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiRequestError: class extends Error {},
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => refresh() }),
  usePathname: () => '/events/shir-london',
}));

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPut.mockReset();
  apiPut.mockResolvedValue({ event: null });
  apiDelete.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mount(props: {
  slug: string;
  rsvp: { status: 'going' | 'interested'; showPublicly?: boolean } | null;
  isFull: boolean;
  presentation?: 'card' | 'detail';
  withShowPublicly?: boolean;
}) {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="so">
        <RsvpButtons {...props} />
      </LocaleProvider>,
    ),
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

function checkbox(): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!found) throw new Error('checkbox not found');
  return found;
}

describe('RsvpButtons — withShowPublicly={false} (detail page, checkbox lives elsewhere)', () => {
  it('clicking Going PUTs the FRESH rsvp.showPublicly, never the (unmounted) internal state', async () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'interested', showPublicly: false },
      isFull: false,
      withShowPublicly: false,
    });

    await act(async () => {
      buttonByText('Waan imanayaa').click();
    });

    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'going',
      showPublicly: false,
    });
  });

  it('clicking Interested also carries the opted-out value forward', async () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'going', showPublicly: false },
      isFull: false,
      withShowPublicly: false,
    });

    await act(async () => {
      buttonByText('Waan xiiseynayaa').click();
    });

    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'interested',
      showPublicly: false,
    });
  });

  it('no checkbox is rendered here — the wall re-homes it', () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'interested', showPublicly: false },
      isFull: false,
      withShowPublicly: false,
    });

    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('a genuinely first RSVP (no prior rsvp) defaults to true — never omitted from the payload', async () => {
    mount({
      slug: 'shir-london',
      rsvp: null,
      isFull: false,
      withShowPublicly: false,
    });

    await act(async () => {
      buttonByText('Waan imanayaa').click();
    });

    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'going',
      showPublicly: true,
    });
    const [, body] = apiPut.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(body, 'showPublicly')).toBe(true);
  });
});

describe('RsvpButtons — card verb (final-review fix 1: never override a stored opt-out)', () => {
  it('an existing opted-out RSVP keeps showPublicly: false when the card verb confirms going', async () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'interested', showPublicly: false },
      isFull: false,
      presentation: 'card',
    });

    await act(async () => {
      buttonByText('Waan imanayaa').click();
    });

    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'going',
      showPublicly: false,
    });
  });

  it('a genuinely first RSVP takes the named-wall default (true)', async () => {
    mount({ slug: 'shir-london', rsvp: null, isFull: false, presentation: 'card' });

    await act(async () => {
      buttonByText('Waan imanayaa').click();
    });

    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'going',
      showPublicly: true,
    });
  });

  it('an OFFLINE failure queues the intent with the same resolved opt-out, never a default', async () => {
    // A non-ApiRequestError failure while navigator.onLine is false takes the
    // enqueue path — the parked intent must carry the member's stored choice.
    apiPut.mockRejectedValue(new TypeError('Failed to fetch'));
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    try {
      mount({
        slug: 'shir-london',
        rsvp: { status: 'interested', showPublicly: false },
        isFull: false,
        presentation: 'card',
      });

      await act(async () => {
        buttonByText('Waan imanayaa').click();
      });

      const queued = JSON.parse(
        window.localStorage.getItem('xidig_event_rsvp_queue') ?? '[]',
      ) as Array<Record<string, unknown>>;
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        slug: 'shir-london',
        action: 'rsvp',
        status: 'going',
        showPublicly: false,
      });
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('RsvpButtons — aria-pressed reflects the verb state (final-review fix 8)', () => {
  it('detail verbs: the active status is pressed, the other is not', () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'going', showPublicly: true },
      isFull: false,
      withShowPublicly: false,
    });

    expect(buttonByText('Waan imanayaa').getAttribute('aria-pressed')).toBe('true');
    expect(buttonByText('Waan xiiseynayaa').getAttribute('aria-pressed')).toBe('false');
  });

  it('detail verbs with no RSVP: both unpressed', () => {
    mount({ slug: 'shir-london', rsvp: null, isFull: false, withShowPublicly: false });

    expect(buttonByText('Waan imanayaa').getAttribute('aria-pressed')).toBe('false');
    expect(buttonByText('Waan xiiseynayaa').getAttribute('aria-pressed')).toBe('false');
  });

  it('the unconfirmed card verb is explicitly unpressed (the confirmed state already asserts true)', () => {
    mount({ slug: 'shir-london', rsvp: null, isFull: false, presentation: 'card' });

    expect(buttonByText('Waan imanayaa').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('RsvpButtons — withShowPublicly={true} (checkbox owns the value here, unchanged)', () => {
  it('toggling the checkbox is the source of truth Going/Interested forward, not the rsvp prop', async () => {
    mount({
      slug: 'shir-london',
      rsvp: { status: 'interested', showPublicly: false },
      isFull: false,
      withShowPublicly: true,
    });

    // Flip the checkbox on — an existing rsvp persists it immediately.
    await act(async () => {
      checkbox().click();
    });
    expect(apiPut).toHaveBeenLastCalledWith('/api/events/shir-london/rsvp', {
      status: 'interested',
      showPublicly: true,
    });

    apiPut.mockClear();

    // The stale `rsvp` prop still says showPublicly: false, but the verb
    // must forward the checkbox's current (checked) state in this mode.
    await act(async () => {
      buttonByText('Waan imanayaa').click();
    });
    expect(apiPut).toHaveBeenCalledWith('/api/events/shir-london/rsvp', {
      status: 'going',
      showPublicly: true,
    });
  });
});
