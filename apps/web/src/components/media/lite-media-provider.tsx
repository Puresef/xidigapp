'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Page-level coordination for Lite MediaSlots (§22, Phase 4.5). Each deferred
 * slot registers itself so the page can show "N hidden — Show all" once
 * (components/media/lite-show-all.tsx); "Show all" reveals every slot on the
 * page in one tap. The context is OPTIONAL — a MediaSlot without a provider
 * still works standalone (its own Show button + session memory).
 *
 * Mount once per media-heavy page (plaza feed, post detail, listing detail,
 * profile), wrapping the content that contains the slots.
 */

export interface LiteMediaContextValue {
  /** Srcs revealed via context (kept so duplicate slots of one src stay in sync). */
  revealed: ReadonlySet<string>;
  reveal: (src: string) => void;
  /** One-tap "show everything on this page". */
  revealAll: () => void;
  showAll: boolean;
  /** Currently deferred (registered, unrevealed) slot count. */
  hiddenCount: number;
  /** MediaSlot lifecycle plumbing — slots call these, UI never does. */
  registerHidden: (slotId: string) => void;
  unregisterHidden: (slotId: string) => void;
}

export const LiteMediaContext = createContext<LiteMediaContextValue | null>(null);

export function useLiteMedia(): LiteMediaContextValue | null {
  return useContext(LiteMediaContext);
}

export function LiteMediaProvider({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const reveal = useCallback((src: string) => {
    setRevealed((current) => {
      if (current.has(src)) return current;
      const next = new Set(current);
      next.add(src);
      return next;
    });
  }, []);

  const revealAll = useCallback(() => setShowAll(true), []);

  const registerHidden = useCallback((slotId: string) => {
    setHiddenIds((current) => {
      if (current.has(slotId)) return current;
      const next = new Set(current);
      next.add(slotId);
      return next;
    });
  }, []);

  const unregisterHidden = useCallback((slotId: string) => {
    setHiddenIds((current) => {
      if (!current.has(slotId)) return current;
      const next = new Set(current);
      next.delete(slotId);
      return next;
    });
  }, []);

  const value = useMemo<LiteMediaContextValue>(
    () => ({
      revealed,
      reveal,
      revealAll,
      showAll,
      hiddenCount: hiddenIds.size,
      registerHidden,
      unregisterHidden,
    }),
    [revealed, reveal, revealAll, showAll, hiddenIds, registerHidden, unregisterHidden],
  );

  return <LiteMediaContext.Provider value={value}>{children}</LiteMediaContext.Provider>;
}
