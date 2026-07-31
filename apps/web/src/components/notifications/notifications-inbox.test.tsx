// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

/**
 * Realtime refetch error normalization (Task 9): a refetch that fails WITHOUT
 * a PlainError payload (offline / proxy / TypeError) must still surface the
 * generic server_error banner — previously the else branch was missing and
 * the failure was silently swallowed (messages-inbox already had it).
 */

const apiGet = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiGet: (...args: unknown[]) => apiGet(...args),
  apiPost: vi.fn().mockResolvedValue({}),
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
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mountInbox() {
  root = createRoot(container);
  act(() => {
    root!.render(
      <LocaleProvider initialLocale="en">
        <NotificationsInbox initial={{ bundles: [], unreadCount: 0, nextCursor: null }} />
      </LocaleProvider>,
    );
  });
}

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
