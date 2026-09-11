// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { BetaSettings, type WaitlistEntry } from './beta-settings';

/**
 * Retained content — the admin waitlist row for a deleted account says so and
 * shows no contact; a live member's row is unchanged. Server HTML hydrates
 * cleanly in both states (the label is a pure function of the projected row).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/lib/api-client', () => ({
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  ApiRequestError: class extends Error {},
}));

const ENTRIES: WaitlistEntry[] = [
  {
    id: 'w-deleted',
    email: null,
    phone: null,
    status: 'joined',
    created_at: '2026-07-01T00:00:00Z',
    contactHidden: 'account_deleted',
  },
  {
    id: 'w-unmatched',
    email: null,
    phone: null,
    status: 'joined',
    created_at: '2026-07-01T00:00:00Z',
    contactHidden: 'no_matching_account',
  },
  {
    id: 'w-live',
    email: 'here@example.com',
    phone: null,
    status: 'joined',
    created_at: '2026-07-01T00:00:00Z',
    contactHidden: null,
  },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container?.remove();
});

describe('BetaSettings waitlist rows', () => {
  it('labels withheld contact truthfully and hydrates without a mismatch', () => {
    const tree = (
      <LocaleProvider initialLocale="en">
        <BetaSettings initialMode="waitlist" entries={ENTRIES} />
      </LocaleProvider>
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(tree);
    const recoverable: unknown[] = [];
    act(() => {
      root = hydrateRoot(container!, tree, { onRecoverableError: (e) => recoverable.push(e) });
    });
    expect(recoverable).toEqual([]);

    const rows = [...container.querySelectorAll('.xidig-invite-list__item')].map(
      (li) => li.textContent ?? '',
    );
    expect(rows[0]).toContain('account deleted — contact hidden');
    expect(rows[1]).toContain('no current account holds this contact');
    expect(rows[2]).toContain('here@example.com');
  });
});
