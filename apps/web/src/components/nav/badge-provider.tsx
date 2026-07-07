'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { apiGet } from '@/lib/api-client';
import { createClient } from '@/lib/supabase-browser';

/**
 * Single source of the header's live unread counts (§22/§26). Both the Messages
 * tab (AppNav) and the Notifications bell read from here, so the summary is
 * fetched ONCE — not once per consumer. Counts seed from
 * /api/notifications/summary and stay current over Realtime (a new notification
 * row for the caller, RLS-scoped) plus the `xidig:badges` window event surfaces
 * dispatch after marking things read.
 */

interface Badges {
  messages: number;
  notifications: number;
  signedIn: boolean;
}

const BadgeContext = createContext<Badges>({ messages: 0, notifications: 0, signedIn: false });

export function useBadges(): Badges {
  return useContext(BadgeContext);
}

interface Summary {
  notifications: number;
  messages: number;
}

export function BadgeProvider({
  initialSignedIn,
  children,
}: {
  initialSignedIn: boolean;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<Summary>({ notifications: 0, messages: 0 });
  const [signedIn, setSignedIn] = useState(initialSignedIn);

  const refresh = useCallback(async () => {
    try {
      const summary = await apiGet<Summary>('/api/notifications/summary');
      setCounts({ notifications: summary.notifications, messages: summary.messages });
      setSignedIn(true);
    } catch {
      // 401 when signed out — no badges, no realtime.
      setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-sync when a surface marks things read.
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener('xidig:badges', handler);
    return () => window.removeEventListener('xidig:badges', handler);
  }, [refresh]);

  // Live badge updates: a new notification for me (RLS-scoped) bumps the count.
  useEffect(() => {
    if (!signedIn) return;
    const supabase = createClient();
    const channel = supabase
      .channel('nav-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [signedIn, refresh]);

  return (
    <BadgeContext.Provider value={{ messages: counts.messages, notifications: counts.notifications, signedIn }}>
      {children}
    </BadgeContext.Provider>
  );
}
