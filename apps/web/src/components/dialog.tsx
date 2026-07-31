'use client';

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@xidig/i18n/react';

/**
 * Shared Dialog primitive (31 Jul full-quality pass) — the one modal surface
 * every overlay builds on: focus trap, Escape-closes, focus-return to the
 * invoker, aria-modal/labelledby wiring, body scroll lock, and a corner close
 * button. Presentation is CSS: `modal` centers the panel everywhere; `sheet`
 * docks it to the bottom edge on phones (≤48rem) and stays centered on
 * desktop. Hand-rolled on purpose — the repo is dependency-light.
 *
 * The trap is a keydown handler on the overlay: Tab/Shift+Tab wrap at the
 * edges, and when focus sits on the panel itself (the initial anchor) or has
 * somehow left the list, Tab re-enters at the first/last control. The corner
 * close button means the panel always holds at least one focusable, but the
 * zero-focusable branch keeps focus parked on the panel anyway.
 *
 * Escape stops BOTH the synthetic bubble and remaining native listeners on
 * the delegation node (stopImmediatePropagation), so page-level Escape
 * handlers (user-menu, popovers) never see a dialog-closing keypress.
 */

/** What the trap treats as reachable. Selector-only on purpose: visibility
 *  probing (offsetParent) is unreliable in jsdom and the dialog never renders
 *  hidden interactive content. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  presentation = 'modal',
  closeOnBackdrop = true,
  panelClassName,
  children,
}: {
  open: boolean;
  /** Called on Escape, corner close, and (when enabled) backdrop press. */
  onClose: () => void;
  /** Rendered as the dialog heading and wired to aria-labelledby. */
  title: ReactNode;
  /** `sheet` docks to the bottom edge on phones; desktop stays centered. */
  presentation?: 'modal' | 'sheet';
  closeOnBackdrop?: boolean;
  /** Extra class on the panel (layout hooks like xidig-capital-fund). */
  panelClassName?: string;
  children: ReactNode;
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);

  // Open: remember the invoker, lock body scroll, move focus into the panel.
  // Close/unmount: undo the lock and hand focus back so a keyboard user is
  // never stranded at the top of the document.
  useEffect(() => {
    if (!open) return;
    invokerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      invokerRef.current?.focus();
      invokerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    const inList = active instanceof HTMLElement && active !== panel && panel.contains(active);
    if (event.shiftKey) {
      if (!inList || active === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!inList || active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    // mousedown (not click) so a text-selection drag that ends on the
    // backdrop never dismisses; target check keeps panel presses inert.
    if (event.target !== event.currentTarget) return;
    // Suppress the browser's default focus move: an un-prevented mousedown on
    // the overlay focuses <body>, and because body is the portal parent every
    // subsequent keydown then bypasses the overlay handler — Tab walks the
    // hidden page and Escape goes dead. That matters whenever the press does
    // NOT dismiss (closeOnBackdrop={false}, or an onClose that swallows the
    // call like AttestationModal while pending); when it does dismiss, the
    // close effect hands focus back to the invoker so preventing the default
    // is moot. preventDefault on mousedown blocks only the focus change.
    event.preventDefault();
    if (closeOnBackdrop) onClose();
  }

  const dialog = (
    <div
      className={presentation === 'sheet' ? 'xidig-modal xidig-modal--sheet' : 'xidig-modal'}
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={panelClassName ? `xidig-modal__panel ${panelClassName}` : 'xidig-modal__panel'}
      >
        <button
          type="button"
          className="xidig-icon-button xidig-modal__close"
          aria-label={t('action.close')}
          onClick={onClose}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 id={titleId} className="xidig-modal__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );

  // Server-safe mount (repo pattern: app-nav): portal to <body> so the
  // overlay escapes transformed/overflow ancestors; SSR renders inline.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
