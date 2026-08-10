// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { OwnerControls } from './owner-controls';

/**
 * Ruling 8 follow-up (9 Aug): Calaamadee is terminal, and the house rule is
 * that irreversible actions confirm via Dialog. Reopen is a walk-back —
 * reversible by definition — so it fires directly. Live-DOM suite (the
 * dialog portals to body; static markup can't see it).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiPost = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiPost: (...args: unknown[]) => apiPost(...args),
  ApiRequestError: class extends Error {},
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  apiPost.mockReset();
  apiPost.mockResolvedValue({ post: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.style.overflow = '';
});

function mount(askStatus: 'open' | 'in_progress') {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="en">
        <OwnerControls postId="p1" askStatus={askStatus} isAsker />
      </LocaleProvider>,
    ),
  );
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`button "${text}" not found`);
  return found as HTMLButtonElement;
}

describe('OwnerControls — Calaamadee confirms, reopen does not', () => {
  it('the terminal action opens the confirm dialog instead of firing the API', () => {
    mount('open');
    act(() => buttonByText('Mark as solved').click());
    expect(apiPost).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('this can’t be undone');
  });

  it('backing out fires nothing and closes the dialog', () => {
    mount('open');
    act(() => buttonByText('Mark as solved').click());
    act(() => buttonByText('Cancel').click());
    expect(apiPost).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('this can’t be undone');
  });

  it('confirming fires the fulfil transition', () => {
    mount('open');
    act(() => buttonByText('Mark as solved').click());
    act(() => buttonByText('Yes, mark it solved').click());
    expect(apiPost).toHaveBeenCalledWith('/api/posts/p1/ask', { action: 'fulfill' });
  });

  it('reopen is a reversible walk-back — it fires directly, no dialog', () => {
    mount('in_progress');
    act(() => buttonByText('Reopen it').click());
    expect(apiPost).toHaveBeenCalledWith('/api/posts/p1/ask', { action: 'reopen' });
  });
});
