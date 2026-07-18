'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { InboxItem } from '@/lib/dm/views';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { ButtonTabs } from '../button-tabs';
import { EmptyState } from '../empty-state';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Conversation list (§13 inbox). Two tabs — Chats and incoming Requests. No
 * polling: a Supabase Realtime subscription to `conversations` (RLS limits the
 * stream to the caller's own rows) re-fetches on any change, so new messages,
 * new requests, and read-state all keep the list live. Low-bandwidth-safe:
 * text only, explicit load-more.
 */

interface InboxResponse {
  conversations: InboxItem[];
  nextCursor: string | null;
}

type Tab = 'chats' | 'requests';

export function MessagesInbox({ meId, initial }: { meId: string; initial: InboxResponse }) {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState<InboxItem[]>(initial.conversations);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [tab, setTab] = useState<Tab>('chats');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const refetch = useCallback(async () => {
    try {
      const page = await apiGet<InboxResponse>('/api/conversations');
      setItems(page.conversations);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setPending(true);
    try {
      const page = await apiGet<InboxResponse>(
        `/api/conversations?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((current) => [...current, ...page.conversations]);
      setNextCursor(page.nextCursor);
    } catch {
      // keep what we have; the top-level error banner covers hard failures
    } finally {
      setPending(false);
    }
  }, [nextCursor]);

  // Realtime: any change to one of my conversations (new message bumps
  // updated_at; a request/accept flips status) re-syncs the list. RLS scopes
  // the stream to me, so no client-side ownership filter is needed.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        void refetch();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        void refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  const requests = useMemo(
    () => items.filter((c) => c.status === 'pending' && !c.isInitiator),
    [items],
  );
  const chats = useMemo(
    () => items.filter((c) => !(c.status === 'pending' && !c.isInitiator)),
    [items],
  );
  const shown = tab === 'requests' ? requests : chats;

  return (
    <section aria-label={t('nav.messages')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      <ButtonTabs<Tab>
        label={t('nav.messages')}
        idBase="inbox"
        panelId="inbox-panel"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'chats', label: t('messages.tabChats') },
          {
            value: 'requests',
            label: (
              <>
                {t('messages.tabRequests')}
                {requests.length > 0 ? (
                  <span className="xidig-dm-badge">{requests.length}</span>
                ) : null}
              </>
            ),
          },
        ]}
      />

      <div role="tabpanel" id="inbox-panel" aria-labelledby={`inbox-tab-${tab}`}>
      {shown.length === 0 ? (
        tab === 'requests' ? (
          <EmptyState messageKey="messages.emptyRequests" />
        ) : (
          <EmptyState
            messageKey="messages.empty"
            action={
              <Link className="xidig-button xidig-button--primary" href="/suuq">
                {t('messages.emptyCta')}
              </Link>
            }
          />
        )
      ) : (
        <ul className="xidig-dm-inbox">
          {shown.map((c) => {
            const name = c.other?.displayName || c.other?.handle || '—';
            const mine = c.lastMessage?.senderUserId === meId;
            const previewText = c.lastMessage?.deleted
              ? t('messages.messageRemoved')
              : (c.lastMessage?.body ?? t('messages.noPreview'));
            return (
              <li key={c.conversationId}>
                <Link className="xidig-dm-row" href={`/messages/${c.conversationId}`}>
                  <span className="xidig-dm-row__main">
                    <span className="xidig-dm-row__name">{name}</span>
                    <span className="xidig-dm-row__preview">
                      {mine ? `${t('messages.you')}: ` : ''}
                      {previewText}
                    </span>
                  </span>
                  <span className="xidig-dm-row__side">
                    {c.lastMessage?.at ? (
                      <time className="xidig-card__meta" dateTime={c.lastMessage.at}>
                        {formatRelativeTime(new Date(c.lastMessage.at), locale)}
                      </time>
                    ) : null}
                    {c.unreadCount > 0 ? (
                      <span className="xidig-dm-badge" aria-label={t('messages.unreadCount', { count: c.unreadCount })}>
                        {c.unreadCount}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tab === 'chats' && nextCursor ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void loadMore()}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : null}
      </div>
    </section>
  );
}
