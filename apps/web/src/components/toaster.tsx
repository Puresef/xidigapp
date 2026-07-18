'use client';

import { useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { TOAST_EVENT, type ToastDetail } from '@/lib/toast';

/**
 * One polite live region for transient confirmations ("All caught up."),
 * mounted once with the app chrome. Anything can raise a toast via the
 * xidig:toast window event (lib/toast.ts) — same decoupled pattern as
 * xidig:badges, so page components need no context threading.
 */

const TOAST_MS = 4000;

interface ToastItem {
  id: number;
  messageKey: MessageKey;
}

export function Toaster() {
  const t = useT();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.messageKey) return;
      const id = nextId++;
      setToasts((current) => [...current, { id, messageKey: detail.messageKey }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, TOAST_MS);
      timers.add(timer);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="xidig-toaster" role="status" aria-live="polite">
      {toasts.map((item) => (
        <p key={item.id} className="xidig-toaster__toast">
          {t(item.messageKey)}
        </p>
      ))}
    </div>
  );
}
