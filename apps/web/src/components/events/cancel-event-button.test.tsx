// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { CancelEventButton } from './cancel-event-button';

/**
 * Cancel confirms via the house Dialog (Munaasabado Task 6, ruling 18):
 * cancelling an event is irreversible — the record stays up, dimmed and
 * tagged — so the confirm is the shared Dialog, never window.confirm.
 * Live-DOM suite (the dialog portals to body) in the SOMALI dictionary,
 * same idiom as owner-controls.test.tsx.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiDelete = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/api-client', () => ({
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
  apiDelete.mockReset();
  apiDelete.mockResolvedValue({ cancelled: true });
  refresh.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.style.overflow = '';
});

function mount() {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="so">
        <CancelEventButton slug="shir-london" />
      </LocaleProvider>,
    ),
  );
}

function trigger(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button');
  if (!found) throw new Error('trigger button not found');
  return found;
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function dialogButtonByText(text: string): HTMLButtonElement {
  const panel = dialog();
  if (!panel) throw new Error('dialog is not open');
  const found = [...panel.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`dialog button "${text}" not found`);
  return found as HTMLButtonElement;
}

describe('CancelEventButton — Dialog confirm, never window.confirm', () => {
  it('the trigger opens the house Dialog with the SO title + consequence body', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mount();

    expect(trigger().textContent).toBe('Jooji munaasabadda');
    act(() => trigger().click());

    expect(confirmSpy).not.toHaveBeenCalled();
    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Jooji munaasabadda');
    expect(panel!.textContent).toContain(
      'Ma joojinaysaa munaasabaddan? Qof kasta oo ka qaybgalay waa loo sheegi doonaa.',
    );
    expect(apiDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('backing out closes the dialog and fires nothing', () => {
    mount();
    act(() => trigger().click());
    act(() => dialogButtonByText('Ka noqo').click());

    expect(dialog()).toBeNull();
    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('confirming runs the DELETE and refreshes', async () => {
    mount();
    act(() => trigger().click());

    await act(async () => {
      dialogButtonByText('Jooji munaasabadda').click();
    });

    expect(apiDelete).toHaveBeenCalledWith('/api/events/shir-london');
    expect(refresh).toHaveBeenCalled();
  });

  it('review fix 3: a DELETE failure renders the error banner INSIDE the dialog, not behind it', async () => {
    apiDelete.mockRejectedValueOnce(new Error('offline'));
    mount();
    act(() => trigger().click());

    await act(async () => {
      dialogButtonByText('Jooji munaasabadda').click();
    });

    const panel = dialog();
    expect(panel).not.toBeNull();
    // The generic §27 server-error copy (ApiRequestError-only banner falls
    // back to it for a bare Error) must show up WITHIN the dialog panel —
    // previously it rendered as a sibling of the Dialog, portalled behind it.
    expect(panel!.querySelector('[role="alert"]')).not.toBeNull();
    expect(panel!.textContent).toContain(
      'Khalad ayaa dhankeenna ka dhacay. Si toos ah ayaa naloo ogeysiiyay — daqiiqad ka dib mar kale isku day.',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
