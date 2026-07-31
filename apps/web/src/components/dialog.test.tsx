// @vitest-environment jsdom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { AttestationModal } from './capital/attestation-modal';
import { VentureFundModal } from './capital/venture-fund-modal';
import { Dialog } from './dialog';

/**
 * Dialog primitive contract (Task 4, 31 Jul): focus trap wraps at the edges,
 * Escape closes WITHOUT leaking to page-level key handlers, focus returns to
 * the invoker, backdrop dismissal is prop-controllable, and the body scroll
 * lock releases on close. First live-DOM component suite in the repo (the
 * rest are static-markup): jsdom does not implement real Tab navigation, so
 * the trap is asserted at its edge branches (where the component itself moves
 * focus); mid-list Tab is the browser's job and stays untested here.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.style.overflow = '';
});

function mount(ui: ReactNode) {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>));
}

/** Trigger button + controlled Dialog — the real invoker/return-focus shape. */
function Harness({
  closeOnBackdrop,
  presentation,
  bareContent = false,
}: {
  closeOnBackdrop?: boolean;
  presentation?: 'modal' | 'sheet';
  bareContent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" id="invoker" onClick={() => setOpen(true)}>
        open
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Trap test"
        {...(closeOnBackdrop === undefined ? {} : { closeOnBackdrop })}
        {...(presentation === undefined ? {} : { presentation })}
      >
        {bareContent ? (
          <p>static text only</p>
        ) : (
          <>
            <input id="field" />
            <button type="button" id="okay">
              okay
            </button>
          </>
        )}
      </Dialog>
    </>
  );
}

function openDialog() {
  const invoker = document.getElementById('invoker')!;
  invoker.focus();
  act(() => {
    invoker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');
const backdrop = () => document.querySelector<HTMLElement>('.xidig-modal');

describe('Dialog', () => {
  it('renders nothing until open, then portals an aria-wired panel to <body>', () => {
    mount(<Harness />);
    expect(panel()).toBeNull();

    openDialog();
    const dlg = panel()!;
    expect(dlg).not.toBeNull();
    // Portaled: the overlay is a direct child of <body>, not of the app tree.
    expect(backdrop()!.parentElement).toBe(document.body);
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dlg.getAttribute('aria-labelledby')!;
    const heading = document.getElementById(labelledBy)!;
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toBe('Trap test');
    // The corner close button carries the i18n name.
    expect(dlg.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it('moves focus onto the panel on open and locks body scroll', () => {
    mount(<Harness />);
    expect(document.body.style.overflow).toBe('');
    openDialog();
    expect(document.activeElement).toBe(panel());
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('wraps Tab at the last focusable and Shift+Tab at the first', () => {
    mount(<Harness />);
    openDialog();
    const closeBtn = panel()!.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    const okay = document.getElementById('okay')!;

    // Forward from the LAST control wraps to the first (the corner close).
    okay.focus();
    pressKey('Tab');
    expect(document.activeElement).toBe(closeBtn);

    // Backward from the FIRST control wraps to the last.
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(okay);
  });

  it('routes Tab from the panel anchor itself into the list (both directions)', () => {
    mount(<Harness />);
    openDialog();
    const closeBtn = panel()!.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    const okay = document.getElementById('okay')!;

    expect(document.activeElement).toBe(panel());
    pressKey('Tab');
    expect(document.activeElement).toBe(closeBtn);

    panel()!.focus();
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(okay);
  });

  it('keeps focus inside when the content has no focusables of its own', () => {
    mount(<Harness bareContent />);
    openDialog();
    const closeBtn = panel()!.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    // Only focusable is the corner close: Tab wraps onto itself.
    pressKey('Tab');
    expect(document.activeElement).toBe(closeBtn);
    pressKey('Tab');
    expect(document.activeElement).toBe(closeBtn);
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('Escape closes, returns focus to the invoker, and releases the scroll lock', () => {
    mount(<Harness />);
    openDialog();
    expect(panel()).not.toBeNull();

    pressKey('Escape');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('invoker'));
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape never reaches page-level key handlers; other keys pass through', () => {
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);
    try {
      mount(<Harness />);
      openDialog();

      pressKey('a');
      expect(pageHandler).toHaveBeenCalledTimes(1); // ordinary keys still bubble
      expect(panel()).not.toBeNull();

      pressKey('Escape');
      expect(panel()).toBeNull();
      expect(pageHandler).toHaveBeenCalledTimes(1); // Escape was swallowed
    } finally {
      document.removeEventListener('keydown', pageHandler);
    }
  });

  it('backdrop press closes by default; presses on the panel do not', () => {
    mount(<Harness />);
    openDialog();

    act(() => {
      panel()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(panel()).not.toBeNull();

    act(() => {
      backdrop()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(panel()).toBeNull();
  });

  it('closeOnBackdrop={false} makes the backdrop inert (Escape still works)', () => {
    mount(<Harness closeOnBackdrop={false} />);
    openDialog();

    act(() => {
      backdrop()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(panel()).not.toBeNull();

    pressKey('Escape');
    expect(panel()).toBeNull();
  });

  it('corner close button closes and returns focus to the invoker', () => {
    mount(<Harness />);
    openDialog();
    const closeBtn = panel()!.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    act(() => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('invoker'));
  });

  it('sheet presentation adds the bottom-sheet class (CSS decides per breakpoint)', () => {
    mount(<Harness presentation="sheet" />);
    openDialog();
    expect(backdrop()!.classList.contains('xidig-modal--sheet')).toBe(true);
  });
});

describe('Capital modals on the Dialog primitive', () => {
  it('AttestationModal: Escape cancels when idle, stays put while pending', () => {
    const onCancel = vi.fn();
    mount(
      <AttestationModal open pending={false} onConfirm={() => {}} onCancel={onCancel} />,
    );
    expect(panel()).not.toBeNull();
    pressKey('Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);

    act(() => root!.unmount());
    root = null;

    // Pending: Escape/backdrop/corner-X all follow the disabled Cancel button.
    mount(<AttestationModal open pending onConfirm={() => {}} onCancel={onCancel} />);
    pressKey('Escape');
    act(() => {
      backdrop()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(panel()).not.toBeNull();
  });

  it('VentureFundModal: renders titled dialog; Escape reaches onClose', () => {
    const onClose = vi.fn();
    mount(<VentureFundModal open candidateId={null} onClose={onClose} />);
    const dlg = panel()!;
    expect(dlg).not.toBeNull();
    const heading = document.getElementById(dlg.getAttribute('aria-labelledby')!)!;
    expect(heading.textContent).toBe('Xidig Venture Fund');
    // Layout hook survives the migration.
    expect(dlg.classList.contains('xidig-capital-fund')).toBe(true);
    pressKey('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
