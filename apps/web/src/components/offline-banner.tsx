'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

/**
 * Offline read banner (E2 s4): when the connection drops, the content on
 * screen IS the cache — say so plainly and promise that queued writes wait.
 * Renders nothing while online; pairs with the queued-reply grammar
 * (QueuedReplies) which owns the per-item chips.
 */
export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <p className="xidig-offline-note" role="status">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 9.2a14.6 14.6 0 0 1 19 0M5.8 12.6a10 10 0 0 1 12.4 0M9.1 16a5.2 5.2 0 0 1 5.8 0" />
        <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
        <path d="M4 4l16 16" />
      </svg>
      {t('state.offlineCached')}
    </p>
  );
}
