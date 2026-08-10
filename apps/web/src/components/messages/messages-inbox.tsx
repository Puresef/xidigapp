'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet, apiPost } from '@/lib/api-client';
import type { InboxItem } from '@/lib/dm/views';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import { createClient } from '@/lib/supabase-browser';

import { Avatar } from '../media/avatar';
import { EmptyState } from '../empty-state';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Fariimo inbox (6a mobile / 6d desktop rail). Requests sit INLINE above the
 * chats — never a hidden second inbox — but carry their own grammar: accent
 * left rail, "Codsi salaan" chip, the sender's ONE message, and Aqbal/Diid
 * right on the card. Declining removes the card and nothing else happens
 * anywhere (f5: silent). Accepted threads render as plain rows: unread rows
 * lead with weight + the accent time + a count chip; verified members wear
 * the trust ring on the disc.
 *
 * No polling: the Realtime subscription on `conversations`/`messages`
 * re-syncs the list (RLS scopes the stream to the caller).
 */

interface InboxResponse {
  conversations: InboxItem[];
  nextCursor: string | null;
}

function isVerified(item: InboxItem): boolean {
  return (
    item.other?.verificationStatus === 'community_verified' ||
    item.other?.verificationStatus === 'identity_verified'
  );
}

export function MessagesInbox({
  meId,
  initial,
  prefs,
  activeId,
  compact = false,
}: {
  meId: string;
  initial: InboxResponse;
  /** Viewer Lite prefs (SSR page passes them) — text-only Lite keeps initials. */
  prefs?: LitePrefs | undefined;
  /** The open conversation (6d two-pane rail) — its row is marked current. */
  activeId?: string | undefined;
  /** Rail presentation: tighter rows, clamped previews. */
  compact?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>(initial.conversations);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [declineNotice, setDeclineNotice] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const requestsHeadingRef = useRef<HTMLHeadingElement | null>(null);

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

  useEffect(() => {
    // ONE binding + a trailing debounce (review #18): every message send
    // already bumps conversations.updated_at via the phase-3 touch trigger,
    // so a messages binding would double-fire — and bursts of events must
    // collapse into a single dm_inbox refetch.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void refetch();
      }, 400);
    };
    const supabase = createClient();
    const channel = supabase
      .channel('inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        scheduleRefetch,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  /** Aqbal from the card: accept, then step into the open thread. Diid:
   * remove the card — no toast, no counter, no trace (the silence IS the
   * feedback; the sender never learns either way). */
  async function respond(conversationId: string, action: 'accept' | 'decline') {
    if (respondingId) return;
    setRespondingId(conversationId);
    setError(null);
    try {
      await apiPost<{ status: string }>(`/api/conversations/${conversationId}/respond`, {
        action,
      });
      if (action === 'accept') {
        router.push(`/messages/${conversationId}`);
      } else {
        setItems((current) => current.filter((c) => c.conversationId !== conversationId));
        // RECIPIENT-side confirmation only (the silent-decline contract
        // governs what the SENDER observes): announce + reseat focus so the
        // vanishing card doesn't strand keyboard/SR users (review #15).
        setDeclineNotice(true);
        setTimeout(() => requestsHeadingRef.current?.focus(), 0);
      }
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setRespondingId(null);
    }
  }

  const requests = useMemo(
    () => items.filter((c) => c.status === 'pending' && !c.isInitiator),
    [items],
  );
  const chats = useMemo(
    () => items.filter((c) => !(c.status === 'pending' && !c.isInitiator)),
    [items],
  );

  const empty = requests.length === 0 && chats.length === 0;

  return (
    <section
      aria-label={t('nav.messages')}
      className={compact ? 'xidig-dm-inboxwrap xidig-dm-inboxwrap--rail' : 'xidig-dm-inboxwrap'}
    >
      {error ? <PlainErrorBanner error={error} /> : null}
      <p role="status" className="xidig-visually-hidden">
        {declineNotice ? t('messages.declinedByYou') : ''}
      </p>

      {empty ? (
        <>
          <EmptyState
            titleKey="messages.emptyTitle"
            messageKey="messages.empty"
            action={
              <Link className="xidig-button xidig-button--primary" href="/plaza">
                {t('messages.emptyCta')}
              </Link>
            }
          />
          <p className="xidig-dm-inbox__footnote">{t('messages.emptyFootnote')}</p>
        </>
      ) : (
        <>
          {requests.length > 0 ? (
            <>
              <h2 className="xidig-dm-section" tabIndex={-1} ref={requestsHeadingRef}>
                <span>
                  {t('messages.requestsHeading')} · {requests.length}
                </span>
              </h2>
              <ul className="xidig-dm-requests" aria-label={t('messages.requestsHeading')}>
                {requests.map((c) => {
                  const name = c.other?.displayName || c.other?.handle || '—';
                  return (
                    <li key={c.conversationId}>
                      <article className="xidig-dm-reqcard">
                        <div className="xidig-byline">
                          <Avatar
                            name={name}
                            handle={c.other?.handle ?? ''}
                            src={c.other?.avatarThumbUrl}
                            blurhash={c.other?.avatarBlurhash}
                            size={38}
                            prefs={prefs}
                          />
                          <span className="xidig-dm-reqcard__id">
                            <span className="xidig-dm-reqcard__toprow">
                              <Link
                                className="xidig-dm-reqcard__name"
                                href={`/messages/${c.conversationId}`}
                              >
                                {name}
                              </Link>
                              <span className="xidig-tag xidig-dm-reqcard__tag">
                                {t('messages.requestTag')}
                              </span>
                              <span className="xidig-dm-reqcard__spacer" />
                              {c.lastMessage?.at ? (
                                <time suppressHydrationWarning className="xidig-card__meta" dateTime={c.lastMessage.at}>
                                  {formatRelativeTime(new Date(c.lastMessage.at), locale)}
                                </time>
                              ) : null}
                            </span>
                          </span>
                        </div>
                        {c.lastMessage?.body ? (
                          <p className="xidig-dm-reqcard__message">{c.lastMessage.body}</p>
                        ) : c.lastMessage?.voice ? (
                          <p className="xidig-dm-reqcard__message">
                            <em>{t('messages.voiceNote')}</em>
                          </p>
                        ) : null}
                        <div className="xidig-dm-reqcard__actions">
                          <button
                            type="button"
                            className="xidig-button xidig-button--primary"
                            disabled={respondingId !== null}
                            onClick={() => void respond(c.conversationId, 'accept')}
                          >
                            {t('action.accept')}
                          </button>
                          <button
                            type="button"
                            className="xidig-button xidig-button--secondary"
                            disabled={respondingId !== null}
                            onClick={() => void respond(c.conversationId, 'decline')}
                          >
                            {t('action.decline')}
                          </button>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
              <p className="xidig-dm-inbox__footnote">{t('messages.requestsFootnote')}</p>
            </>
          ) : null}

          {chats.length > 0 ? (
            <h2 className="xidig-dm-section">
              <span>{t('messages.chatsHeading')}</span>
            </h2>
          ) : null}
          <ul className="xidig-dm-inbox">
            {chats.map((c) => {
              const name = c.other?.displayName || c.other?.handle || '—';
              const mine = c.lastMessage?.senderUserId === meId;
              const unread = c.unreadCount > 0;
              const previewText = c.lastMessage?.deleted
                ? t('messages.messageRemoved')
                : c.lastMessage?.voice && !c.lastMessage.body
                  ? t('messages.voiceNote')
                  : (c.lastMessage?.body ?? t('messages.noPreview'));
              return (
                <li key={c.conversationId}>
                  <Link
                    className={`xidig-dm-row${unread ? ' xidig-dm-row--unread' : ''}${
                      activeId === c.conversationId ? ' xidig-dm-row--active' : ''
                    }`}
                    href={`/messages/${c.conversationId}`}
                    aria-current={activeId === c.conversationId ? 'page' : undefined}
                  >
                    <span
                      className={
                        isVerified(c) ? 'xidig-dm-row__disc xidig-dm-row__disc--verified' : 'xidig-dm-row__disc'
                      }
                    >
                      <Avatar
                        name={name}
                        handle={c.other?.handle ?? ''}
                        src={c.other?.avatarThumbUrl}
                        blurhash={c.other?.avatarBlurhash}
                        size={38}
                        prefs={prefs}
                      />
                    </span>
                    <span className="xidig-dm-row__main">
                      <span className="xidig-dm-row__toprow">
                        <span className="xidig-dm-row__name">{name}</span>
                        {c.lastMessage?.at ? (
                          <time suppressHydrationWarning className="xidig-dm-row__time" dateTime={c.lastMessage.at}>
                            {formatRelativeTime(new Date(c.lastMessage.at), locale)}
                          </time>
                        ) : null}
                      </span>
                      <span className="xidig-dm-row__bottomrow">
                        <span className="xidig-dm-row__preview">
                          {mine ? `${t('messages.you')}: ` : ''}
                          {previewText}
                        </span>
                        {unread ? (
                          // ARIA prohibits naming a generic span — the count
                          // joins the link's name via hidden text instead
                          // (review #16).
                          <span className="xidig-nav__badge" aria-hidden="true">
                            {c.unreadCount}
                          </span>
                        ) : null}
                        {unread ? (
                          <span className="xidig-visually-hidden">
                            {t('messages.unreadCount', { count: c.unreadCount })}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {nextCursor ? (
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
        </>
      )}
    </section>
  );
}
