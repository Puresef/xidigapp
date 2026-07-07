'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { MessageView, Participant } from '@/lib/dm/views';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';
import { ConversationMenu } from './conversation-menu';

/**
 * 1:1 conversation thread (§13). Message delivery is Supabase Realtime
 * (postgres_changes on `messages` filtered by conversation_id) — NO polling.
 * Handles the request-to-chat states (accept/decline / pending / declined /
 * blocked), keyset "load older" history, mark-as-read on open + on inbound
 * message, and offline/error states. Low-bandwidth-safe: plain text bubbles.
 */

type Status = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface ConversationHeader {
  id: string;
  status: Status;
  isInitiator: boolean;
  other: Participant | null;
}

function dedupeAppend(list: MessageView[], incoming: MessageView): MessageView[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function rowToView(row: Record<string, unknown>, meId: string): MessageView {
  const deleted = row.deleted_at !== null && row.deleted_at !== undefined;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderUserId: String(row.sender_user_id),
    body: deleted ? '' : String(row.body ?? ''),
    isMine: row.sender_user_id === meId,
    deleted,
    createdAt: String(row.created_at),
  };
}

export function ConversationView({
  meId,
  initialHeader,
  initialMessages,
  initialNextCursor,
}: {
  meId: string;
  initialHeader: ConversationHeader;
  initialMessages: MessageView[];
  initialNextCursor: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [header, setHeader] = useState<ConversationHeader>(initialHeader);
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [offline, setOffline] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Set before a "load older" prepend so the auto-scroll effect skips once —
  // prepending history must not yank the reader down to the newest message.
  const skipScrollRef = useRef(false);

  const markRead = useCallback(() => {
    void apiPost(`/api/conversations/${header.id}/read`).catch(() => {});
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('xidig:badges'));
  }, [header.id]);

  // Mark read on open.
  useEffect(() => {
    markRead();
  }, [markRead]);

  // Keep the newest message in view as the thread grows — but NOT when the
  // growth came from prepending older history ("load older").
  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Offline awareness (§ platform errors).
  useEffect(() => {
    const update = () => setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Realtime: new messages + status changes for THIS conversation only.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation:${header.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${header.id}`,
        },
        (payload) => {
          const view = rowToView(payload.new as Record<string, unknown>, meId);
          setMessages((current) => dedupeAppend(current, view));
          if (!view.isMine) markRead();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${header.id}`,
        },
        (payload) => {
          const next = (payload.new as { status?: Status }).status;
          if (next) setHeader((h) => ({ ...h, status: next }));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [header.id, meId, markRead]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingOlder(true);
    try {
      const page = await apiGet<{ messages: MessageView[]; nextCursor: string | null }>(
        `/api/conversations/${header.id}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      );
      skipScrollRef.current = true; // prepend history without scrolling to bottom
      setMessages((current) => [...page.messages, ...current]);
      setNextCursor(page.nextCursor);
    } catch {
      // leave the thread as-is; a hard failure surfaces on the next send
    } finally {
      setLoadingOlder(false);
    }
  }, [header.id, nextCursor]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiPost<{ message: MessageView }>(
        `/api/conversations/${header.id}/messages`,
        { body },
      );
      setMessages((current) => dedupeAppend(current, res.message));
      setDraft('');
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: t('messages.sendFailed') });
    } finally {
      setSending(false);
    }
  }

  async function respond(action: 'accept' | 'decline') {
    setError(null);
    try {
      const res = await apiPost<{ status: Status }>(
        `/api/conversations/${header.id}/respond`,
        { action },
      );
      setHeader((h) => ({ ...h, status: res.status }));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  const name = header.other?.displayName || header.other?.handle || '—';
  const canCompose = header.status === 'accepted';
  const isIncomingRequest = header.status === 'pending' && !header.isInitiator;
  const isPendingSent = header.status === 'pending' && header.isInitiator;

  return (
    <section className="xidig-dm" aria-label={name}>
      <header className="xidig-dm-header">
        <div>
          {header.other ? (
            <a className="xidig-dm-header__name" href={`/u/${header.other.handle ?? ''}`}>
              {name}
            </a>
          ) : (
            <span className="xidig-dm-header__name">{name}</span>
          )}
        </div>
        {header.other ? (
          <ConversationMenu
            targetUserId={header.other.userId}
            targetName={name}
            onBlocked={() => setHeader((h) => ({ ...h, status: 'blocked' }))}
          />
        ) : null}
      </header>

      {offline ? <Banner kind="error">{t('messages.offline')}</Banner> : null}
      {error ? <PlainErrorBanner error={error} /> : null}

      <div className="xidig-dm-thread">
        {nextCursor ? (
          <p className="xidig-dm-thread__older">
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {t('messages.loadOlder')}
            </button>
          </p>
        ) : (
          <p className="xidig-card__meta xidig-dm-thread__start">{t('messages.historyStart')}</p>
        )}

        <ul className="xidig-dm-msglist">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`xidig-dm-msg ${m.isMine ? 'xidig-dm-msg--mine' : 'xidig-dm-msg--theirs'}`}
            >
              <span className="xidig-dm-msg__body">
                {m.deleted ? <em>{t('messages.messageRemoved')}</em> : m.body}
              </span>
              <time className="xidig-dm-msg__meta" dateTime={m.createdAt}>
                {formatRelativeTime(new Date(m.createdAt), locale)}
              </time>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      {isIncomingRequest ? (
        <div className="xidig-dm-request">
          <p className="xidig-card__body">{t('messages.requestExplainer', { name })}</p>
          <div className="xidig-profile__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              onClick={() => void respond('accept')}
            >
              {t('action.accept')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => void respond('decline')}
            >
              {t('action.decline')}
            </button>
          </div>
        </div>
      ) : null}

      {isPendingSent ? (
        <Banner kind="notice">
          <strong>{t('messages.pendingSentTitle')}</strong> {t('messages.pendingSentBody', { name })}
        </Banner>
      ) : null}

      {header.status === 'declined' ? (
        <Banner kind="notice">{t('messages.declinedNotice')}</Banner>
      ) : null}

      {header.status === 'blocked' ? (
        <Banner kind="notice">{t('messages.blockedNotice')}</Banner>
      ) : null}

      {canCompose ? (
        <form
          className="xidig-dm-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            className="xidig-field__input"
            rows={2}
            value={draft}
            disabled={offline}
            placeholder={t('messages.composerPlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            className="xidig-button xidig-button--primary"
            disabled={sending || offline || draft.trim().length === 0}
          >
            {t('action.send')}
          </button>
        </form>
      ) : null}
    </section>
  );
}
