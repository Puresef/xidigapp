// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { NotificationBundle } from '@/lib/notifications/bundle';

/**
 * Realtime refetch error normalization (Task 9): a refetch that fails WITHOUT
 * a PlainError payload (offline / proxy / TypeError) must still surface the
 * generic server_error banner — previously the else branch was missing and
 * the failure was silently swallowed (messages-inbox already had it).
 *
 * Task 7 adds the e7 Digniino reminder row: bespoke meta line + inline
 * "Fiiri" / "Ka noqo RSVP" actions, the latter wired to a real DELETE + the
 * same refetch the realtime subscription already drives.
 */

const apiGet = vi.fn();
const apiDelete = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: vi.fn().mockResolvedValue({}),
  apiDelete: (...args: unknown[]) => apiDelete(...args),
  ApiRequestError: class MockApiRequestError extends Error {
    plain: { code: string; message: string };
    constructor() {
      super('api error');
      this.plain = { code: 'server_error', message: '' };
    }
  },
}));

// Capture the realtime callbacks so the test can simulate a postgres_changes
// event (the only trigger for refetch — the inbox never fetches on mount).
const realtimeHandlers: Array<() => void> = [];

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => {
    const channel = {
      on: (_event: string, _filter: unknown, callback: () => void) => {
        realtimeHandlers.push(callback);
        return channel;
      },
      subscribe: () => channel,
    };
    return {
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
    };
  },
}));

import { NotificationsInbox } from './notifications-inbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  realtimeHandlers.length = 0;
  apiGet.mockReset();
  apiDelete.mockReset();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mountInbox(bundles: NotificationBundle[] = []) {
  root = createRoot(container);
  act(() => {
    root!.render(
      <LocaleProvider initialLocale="en">
        <NotificationsInbox initial={{ bundles, unreadCount: bundles.length, nextCursor: null }} />
      </LocaleProvider>,
    );
  });
}

// Task 4's send-time snapshot payload, going/confirmed with a capacity —
// same fixture instant/timezone as present.test.ts (Saturday 14:00 local).
const reminderBundle: NotificationBundle = {
  id: 'rb1',
  type: 'event_reminder',
  count: 1,
  actors: [],
  actorCount: 0,
  latestAt: '2026-08-11T00:00:00Z',
  unread: true,
  entityType: 'event',
  entityId: 'e1',
  notificationIds: ['n1'],
  payload: {
    eventSlug: 'shir-madasha-london',
    title: 'Shir-madasha Xidig London',
    startsAt: '2026-08-15T13:00:00Z',
    timezone: 'Europe/London',
    going: 14,
    capacity: 30,
    status: 'going',
  },
};

describe('NotificationsInbox refetch failure', () => {
  it('non-PlainError failures normalize to the server_error banner', async () => {
    apiGet.mockRejectedValue(new TypeError('fetch failed'));
    mountInbox();

    // SSR-hydrated empty inbox — the genuine empty state, no banner yet.
    expect(container.textContent).not.toContain('Something went wrong on our end');

    // A realtime event triggers the refetch, which fails without a payload.
    await act(async () => {
      for (const handler of realtimeHandlers) handler();
    });

    // error.server fallback copy (PlainErrorBanner renders it for message: '').
    expect(container.textContent).toContain('Something went wrong on our end');
  });
});

describe('NotificationsInbox event_reminder row (Task 7)', () => {
  it('renders the meta line + Fiiri/Ka noqo RSVP actions, and cancels via DELETE + refetch', async () => {
    apiDelete.mockResolvedValue({});
    apiGet.mockResolvedValue({ bundles: [], unreadCount: 0, nextCursor: null });

    mountInbox([reminderBundle]);

    expect(container.textContent).toContain('3 days away: Shir-madasha Xidig London');
    expect(container.textContent).toContain("you're confirmed");
    expect(container.textContent).toContain('14/30');
    expect(container.textContent).toContain('View'); // action.view (en)

    const cancelButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel RSVP'),
    );
    expect(cancelButton).toBeTruthy();

    await act(async () => {
      cancelButton!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiDelete).toHaveBeenCalledWith('/api/events/shir-madasha-london/rsvp');
    // The unrsvp action reuses the SAME refetch the realtime subscription
    // drives — apiGet is called again after the DELETE resolves.
    expect(apiGet).toHaveBeenCalled();
  });
});
