'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { ReportControl } from '@/components/report-control';
import { SystemNotice } from '@/components/system-notice';
import { ApiRequestError, apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client';
import { presentConversationStatus } from '@/lib/dm/presentation';
import type { MessageView, Participant } from '@/lib/dm/views';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import { createClient } from '@/lib/supabase-browser';

import { Avatar } from '../media/avatar';
import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';
import { EmptyState } from '../empty-state';
import { ConversationMenu } from './conversation-menu';
import { formatVoiceDuration, VoiceNoteBubble, VoiceRecorderButton, type RecordedClip } from './voice-note';

/**
 * 1:1 conversation thread (6b + the E2 family). Realtime delivery, keyset
 * "load older", mark-as-read on open + inbound.
 *
 * The consent grammar lives here:
 *   * incoming request (6d): read-only — SystemNotice explainer, the ONE
 *     message, the sender-context card, then the decision bar (accept &
 *     reply / decline / report / block) where the composer would be;
 *   * sent request (f5): "sent" meta + a normalising notice + a closed
 *     composer — and because the server presents declined as pending to the
 *     initiator, this state IS the declined state, indistinguishable;
 *   * blocked (f4, blocker's view): anonymised chrome, history dimmed but
 *     kept (report evidence), composer replaced by a plain fact;
 *   * offline (f3): the composer stays live — sends queue with the clock
 *     chip and flush on reconnect. Send failures (f2) dim in place with
 *     per-message retry/delete; order is preserved.
 *
 * Voice notes (F2 §4): recorded via the mic button (self-recorded only),
 * parked on the composer for review, uploaded on Dir; playback streams
 * through the participant-checked signed-URL route on first tap.
 */

type Status = 'pending' | 'accepted' | 'declined' | 'blocked';

export interface ConversationHeader {
  id: string;
  status: Status;
  isInitiator: boolean;
  other: Participant | null;
  /** conversation.created_at — the f5 "sent {time}" meta. */
  createdAt?: string | undefined;
}

/** 6d — what the recipient knows about the requester (server-computed). */
export interface RequestContext {
  sharedLabName: string | null;
  repliedAskTitle: string | null;
  verified: boolean;
  memberYear: number | null;
}

/** 6b — the Codsi that started this conversation (post_offers linkage). */
export interface CodsiContext {
  postId: string;
  title: string | null;
  askStatus: string | null;
}

interface OutboxItem {
  localId: number;
  body: string;
  state: 'queued' | 'failed';
}

function dedupeAppend(list: MessageView[], incoming: MessageView): MessageView[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function rowToView(row: Record<string, unknown>, meId: string): MessageView {
  const deleted = row.deleted_at !== null && row.deleted_at !== undefined;
  const voiceUploadId =
    typeof row.voice_upload_id === 'string' && row.voice_upload_id ? row.voice_upload_id : null;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderUserId: String(row.sender_user_id),
    body: deleted ? '' : String(row.body ?? ''),
    // Realtime rows carry no duration (it lives on the upload row); the
    // bubble renders with the honest placeholder until a refresh.
    voice: !deleted && voiceUploadId ? { uploadId: voiceUploadId, durationSeconds: null } : null,
    isMine: row.sender_user_id === meId,
    deleted,
    createdAt: String(row.created_at),
  };
}

const outboxKey = (id: string) => `xidig-dm-outbox:${id}`;

function readOutbox(id: string): OutboxItem[] {
  try {
    const raw = window.localStorage.getItem(outboxKey(id));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OutboxItem =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as OutboxItem).body === 'string' &&
        typeof (item as OutboxItem).localId === 'number',
    );
  } catch {
    return [];
  }
}

function writeOutbox(id: string, items: OutboxItem[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(outboxKey(id));
    else window.localStorage.setItem(outboxKey(id), JSON.stringify(items));
  } catch {
    // Private mode — the in-memory outbox still works for this visit.
  }
}

export function ConversationView({
  meId,
  initialHeader,
  initialMessages,
  initialNextCursor,
  prefs,
  requestContext = null,
  codsiContext = null,
  blockedAt = null,
}: {
  meId: string;
  initialHeader: ConversationHeader;
  initialMessages: MessageView[];
  initialNextCursor: string | null;
  /** Viewer Lite prefs (SSR page passes them) — text-only Lite keeps initials. */
  prefs?: LitePrefs | undefined;
  /** Present only for an incoming request (6d context card). */
  requestContext?: RequestContext | null;
  /** Present when a Codsi offer opened this conversation (6b pinned card). */
  codsiContext?: CodsiContext | null;
  /** Set when the VIEWER placed the block (f4 chrome); null otherwise. */
  blockedAt?: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [header, setHeader] = useState<ConversationHeader>(initialHeader);
  const [messages, setMessages] = useState<MessageView[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [draft, setDraft] = useState('');
  const [clip, setClip] = useState<RecordedClip | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [offline, setOffline] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const skipScrollRef = useRef(false);
  const localIdRef = useRef(1);

  const markRead = useCallback(() => {
    void apiPost(`/api/conversations/${header.id}/read`).catch(() => {});
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('xidig:badges'));
  }, [header.id]);

  useEffect(() => {
    // No read signal for a request the viewer hasn't accepted — the
    // explainer promises "ma arki karo inaad akhriday" and read-state must
    // not exist before consent.
    if (header.status === 'accepted') markRead();
  }, [markRead, header.status]);

  useEffect(() => {
    setOutbox(readOutbox(initialHeader.id));
  }, [initialHeader.id]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, outbox.length]);

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
          if (!view.isMine && header.status === 'accepted') markRead();
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
          // f5: the presentation boundary applies to LIVE updates too — an
          // initiator watching the thread when the recipient declines must
          // see nothing change.
          if (next) {
            setHeader((h) => ({ ...h, status: presentConversationStatus(next, h.isInitiator) }));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [header.id, header.status, meId, markRead]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingOlder(true);
    try {
      const page = await apiGet<{ messages: MessageView[]; nextCursor: string | null }>(
        `/api/conversations/${header.id}/messages?cursor=${encodeURIComponent(nextCursor)}`,
      );
      skipScrollRef.current = true;
      setMessages((current) => [...page.messages, ...current]);
      setNextCursor(page.nextCursor);
    } catch {
      // leave the thread as-is; a hard failure surfaces on the next send
    } finally {
      setLoadingOlder(false);
    }
  }, [header.id, nextCursor]);

  function updateOutbox(next: OutboxItem[]) {
    setOutbox(next);
    writeOutbox(header.id, next);
  }

  async function postMessage(payload: { body?: string; voiceUploadId?: string }) {
    const res = await apiPost<{ message: MessageView }>(
      `/api/conversations/${header.id}/messages`,
      payload,
    );
    setMessages((current) => dedupeAppend(current, res.message));
  }

  async function uploadClip(current: RecordedClip): Promise<string> {
    const form = new FormData();
    form.append('file', new File([current.blob], 'voice-note', { type: current.blob.type }));
    form.append('durationSeconds', String(current.durationSeconds));
    const res = await fetch('/api/media/voice', { method: 'POST', body: form });
    const json = (await res.json()) as { data?: { media?: { id: string } }; error?: PlainError };
    if (!res.ok || !json.data?.media?.id) {
      throw new ApiRequestError(json.error ?? { code: 'server_error', message: '' });
    }
    return json.data.media.id;
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !clip) || sending) return;

    // f3: offline text queues instead of failing. Voice clips don't persist
    // across a reload (blobs aren't serialisable) — keep the clip parked and
    // let the member send it when the connection returns.
    if (offline) {
      if (body) {
        updateOutbox([...outbox, { localId: localIdRef.current++, body, state: 'queued' }]);
        setDraft('');
      }
      return;
    }

    setSending(true);
    setError(null);
    try {
      const voiceUploadId = clip ? await uploadClip(clip) : undefined;
      await postMessage({
        ...(body ? { body } : {}),
        ...(voiceUploadId ? { voiceUploadId } : {}),
      });
      setDraft('');
      setClip(null);
    } catch (cause) {
      if (body) {
        // f2: the message parks in place with retry/delete — never lost,
        // never pretending to be sent.
        updateOutbox([...outbox, { localId: localIdRef.current++, body, state: 'failed' }]);
        setDraft('');
      }
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError(null);
    } finally {
      setSending(false);
    }
  }

  const flushOutbox = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queued = readOutbox(header.id).filter((item) => item.state === 'queued');
    for (const item of queued) {
      try {
        const res = await apiPost<{ message: MessageView }>(
          `/api/conversations/${header.id}/messages`,
          { body: item.body },
        );
        setMessages((current) => dedupeAppend(current, res.message));
        const remaining = readOutbox(header.id).filter((entry) => entry.localId !== item.localId);
        writeOutbox(header.id, remaining);
        setOutbox(remaining);
      } catch {
        const next = readOutbox(header.id).map((entry) =>
          entry.localId === item.localId ? { ...entry, state: 'failed' as const } : entry,
        );
        writeOutbox(header.id, next);
        setOutbox(next);
        break;
      }
    }
  }, [header.id]);

  useEffect(() => {
    void flushOutbox();
    window.addEventListener('online', flushOutbox);
    return () => window.removeEventListener('online', flushOutbox);
  }, [flushOutbox]);

  async function retryOutboxItem(item: OutboxItem) {
    try {
      const res = await apiPost<{ message: MessageView }>(
        `/api/conversations/${header.id}/messages`,
        { body: item.body },
      );
      setMessages((current) => dedupeAppend(current, res.message));
      updateOutbox(outbox.filter((entry) => entry.localId !== item.localId));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  async function respond(action: 'accept' | 'decline') {
    setError(null);
    try {
      const res = await apiPost<{ status: Status }>(`/api/conversations/${header.id}/respond`, {
        action,
      });
      if (action === 'decline') {
        // Silent: the thread simply leaves the recipient's world.
        router.push('/messages');
        return;
      }
      setHeader((h) => ({ ...h, status: res.status }));
      markRead();
      setTimeout(() => composerRef.current?.focus(), 50);
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  async function blockFromDecisionBar() {
    if (!header.other) return;
    if (!window.confirm(t('messages.blockConfirm', { name }))) return;
    try {
      await apiPut(`/api/blocks/${header.other.userId}`);
      setHeader((h) => ({ ...h, status: 'blocked' }));
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  async function unblock() {
    if (!header.other) return;
    try {
      await apiDelete(`/api/blocks/${header.other.userId}`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
    }
  }

  const name = header.other?.displayName || header.other?.handle || '—';
  const blockedByMe = header.status === 'blocked' && blockedAt !== null;
  const canCompose = header.status === 'accepted';
  const isIncomingRequest = header.status === 'pending' && !header.isInitiator;
  const isPendingSent = header.status === 'pending' && header.isInitiator;
  const otherVerified =
    header.other?.verificationStatus === 'community_verified' ||
    header.other?.verificationStatus === 'identity_verified';

  return (
    <section className="xidig-dm" aria-label={blockedByMe ? t('messages.blockedHeaderName') : name}>
      {offline ? (
        <div className="xidig-dm-offlinebar" role="status">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 9.2a14.6 14.6 0 0 1 19 0M5.8 12.6a10 10 0 0 1 12.4 0M9.1 16a5.2 5.2 0 0 1 5.8 0" />
            <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none" />
            <path d="M4 4l16 16" />
          </svg>
          {t('messages.offline')}
        </div>
      ) : null}

      <header className="xidig-dm-header">
        <div className="xidig-byline">
          {blockedByMe ? (
            // f4: identity anonymised in chrome — a generic disc + label.
            <>
              <span className="xidig-dm-header__anon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8.2" r="3.4" />
                  <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
                </svg>
              </span>
              <span className="xidig-dm-header__name xidig-dm-header__name--muted">
                {t('messages.blockedHeaderName')}
              </span>
            </>
          ) : header.other ? (
            <>
              <a
                className={`xidig-byline__avatar${otherVerified ? ' xidig-dm-row__disc--verified' : ''}`}
                href={`/u/${header.other.handle ?? ''}`}
                aria-label={name}
              >
                <Avatar
                  name={name}
                  handle={header.other.handle ?? ''}
                  src={header.other.avatarThumbUrl}
                  blurhash={header.other.avatarBlurhash}
                  size={40}
                  prefs={prefs}
                />
              </a>
              <span className="xidig-dm-header__id">
                <a className="xidig-dm-header__name" href={`/u/${header.other.handle ?? ''}`}>
                  {name}
                </a>
                {isPendingSent && header.createdAt ? (
                  <span className="xidig-card__meta">
                    {t('messages.pendingSentMeta', {
                      time: formatRelativeTime(new Date(header.createdAt), locale),
                    })}
                  </span>
                ) : isIncomingRequest ? (
                  <span className="xidig-card__meta">
                    <span className="xidig-tag xidig-dm-reqcard__tag">
                      {t('messages.requestTag')}
                    </span>
                    {requestContext?.memberYear ? (
                      // String() — a year is an identifier, not a quantity;
                      // the locale formatter must not comma-group it.
                      <> {t('messages.memberSince', { year: String(requestContext.memberYear) })}</>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <span className="xidig-dm-header__name">{name}</span>
          )}
        </div>
        {header.other && !blockedByMe && !isIncomingRequest ? (
          <ConversationMenu
            targetUserId={header.other.userId}
            targetName={name}
            onBlocked={() => router.refresh()}
          />
        ) : null}
        {isIncomingRequest && header.other ? (
          <a className="xidig-dm-header__profilelink" href={`/u/${header.other.handle ?? ''}`}>
            {t('plaza.helperViewProfile')}
          </a>
        ) : null}
      </header>

      {error ? <PlainErrorBanner error={error} /> : null}

      {codsiContext ? (
        <a className="xidig-dm-codsicard" href={`/p/${codsiContext.postId}`}>
          <span className="xidig-dm-codsicard__chips">
            <span className="xidig-tag xidig-post-type xidig-post-type--ask">
              <XidigIcon name="codsi" variant="filled" size={12} tone="inherit" className="x-ic--lead" />
              {t('plaza.typeAsk')}
            </span>
            {codsiContext.askStatus === 'fulfilled' ? (
              <span className="xidig-tag xidig-tag--trust">{t('plaza.askFulfilled')}</span>
            ) : null}
            <span className="xidig-dm-codsicard__spacer" />
            <span className="xidig-card__meta">{t('plaza.helperViewProfile')}</span>
          </span>
          {codsiContext.title ? (
            <span className="xidig-dm-codsicard__title">{codsiContext.title}</span>
          ) : null}
        </a>
      ) : null}

      {isIncomingRequest ? (
        <SystemNotice tone="info" messageKey="messages.requestExplainer" params={{ name }} />
      ) : null}

      <div className={`xidig-dm-thread${blockedByMe ? ' xidig-dm-thread--dimmed' : ''}`}>
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
        ) : messages.length === 0 && canCompose ? (
          <EmptyState messageKey="messages.emptyThread" />
        ) : messages.length > 0 ? (
          <p className="xidig-card__meta xidig-dm-thread__start">{t('messages.historyStart')}</p>
        ) : null}

        <ul className="xidig-dm-msglist">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`xidig-dm-msg ${m.isMine ? 'xidig-dm-msg--mine' : 'xidig-dm-msg--theirs'}`}
            >
              {m.voice ? (
                <span className={`xidig-dm-msg__bubble xidig-dm-msg__bubble--voice`}>
                  <VoiceNoteBubble
                    conversationId={header.id}
                    uploadId={m.voice.uploadId}
                    durationSeconds={m.voice.durationSeconds}
                  />
                </span>
              ) : null}
              {m.body || m.deleted ? (
                <span className="xidig-dm-msg__bubble">
                  {m.deleted ? <em>{t('messages.messageRemoved')}</em> : m.body}
                </span>
              ) : null}
              <time suppressHydrationWarning className="xidig-dm-msg__meta" dateTime={m.createdAt}>
                {isPendingSent && m.isMine
                  ? t('messages.sentAt', {
                      time: formatRelativeTime(new Date(m.createdAt), locale),
                    })
                  : formatRelativeTime(new Date(m.createdAt), locale)}
              </time>
            </li>
          ))}
          {outbox.map((item) => (
            <li
              key={`outbox-${item.localId}`}
              className={`xidig-dm-msg xidig-dm-msg--mine xidig-dm-msg--${item.state}`}
            >
              <span className="xidig-dm-msg__bubble">{item.body}</span>
              {item.state === 'queued' ? (
                <span className="xidig-dm-msg__chip">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.6" />
                    <path d="M12 8v4.4l2.8 1.7" />
                  </svg>
                  {t('messages.queuedChip')}
                </span>
              ) : (
                <span className="xidig-dm-msg__chip xidig-dm-msg__chip--failed">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16.2h.01" />
                  </svg>
                  {t('messages.sendFailedChip')}
                  <button type="button" className="xidig-dm-msg__chipaction" onClick={() => void retryOutboxItem(item)}>
                    {t('messages.retrySend')}
                  </button>
                  <button
                    type="button"
                    className="xidig-dm-msg__chipaction xidig-dm-msg__chipaction--muted"
                    onClick={() => updateOutbox(outbox.filter((entry) => entry.localId !== item.localId))}
                  >
                    {t('action.delete')}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      {isIncomingRequest && requestContext ? (
        <div className="xidig-dm-context">
          <h2 className="xidig-dm-context__title">{t('messages.senderContextTitle', { name })}</h2>
          <dl className="xidig-dm-context__grid">
            {requestContext.sharedLabName ? (
              <>
                <dt>{t('messages.contextLabs')}</dt>
                <dd>{t('messages.contextLabsShared', { name: requestContext.sharedLabName })}</dd>
              </>
            ) : null}
            {requestContext.repliedAskTitle ? (
              <>
                <dt>{t('messages.contextPlaza')}</dt>
                <dd>{t('messages.contextRepliedYourAsk', { title: requestContext.repliedAskTitle })}</dd>
              </>
            ) : null}
            <dt>{t('messages.contextVerification')}</dt>
            <dd className={requestContext.verified ? '' : 'xidig-dm-context__muted'}>
              {requestContext.verified
                ? t('messages.contextVerified')
                : t('messages.contextNotVerified')}
            </dd>
          </dl>
        </div>
      ) : null}

      {isIncomingRequest ? (
        <div className="xidig-dm-decision">
          <div className="xidig-dm-decision__bar">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              onClick={() => void respond('accept')}
            >
              {t('messages.acceptAndReply')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => void respond('decline')}
            >
              {t('action.decline')}
            </button>
            <span className="xidig-dm-decision__spacer" />
            {header.other ? (
              <ReportControl
                targetType="conversation"
                targetId={header.id}
                targetName={name}
                variant="quiet"
                labelKey="action.report"
              />
            ) : null}
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => void blockFromDecisionBar()}
            >
              {t('action.block')}
            </button>
          </div>
          <p className="xidig-dm-decision__note">{t('messages.declineFootnote', { name })}</p>
        </div>
      ) : null}

      {isPendingSent ? (
        <>
          <SystemNotice tone="info" messageKey="messages.pendingSentNotice" params={{ name }} />
          <p className="xidig-dm-footerline">{t('messages.pendingSentFooter', { name })}</p>
        </>
      ) : null}

      {header.status === 'blocked' && blockedByMe ? (
        <>
          <div className="xidig-system-notice" role="note">
            <span className="xidig-system-notice__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.2 4.5 6.4v5c0 4.5 3.1 8.1 7.5 9.4 4.4-1.3 7.5-4.9 7.5-9.4v-5Z" />
              </svg>
            </span>
            <div className="xidig-system-notice__stack">
              <p className="xidig-system-notice__text">
                {t('messages.blockedByMeNotice', {
                  date: new Date(blockedAt as string).toLocaleDateString(locale === 'so' ? 'so' : 'en-GB', {
                    day: 'numeric',
                    month: 'long',
                  }),
                })}
              </p>
              <span className="xidig-dm-decision__bar">
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  onClick={() => void unblock()}
                >
                  {t('messages.unblock')}
                </button>
                {header.other ? (
                  <ReportControl
                    targetType="conversation"
                    targetId={header.id}
                    targetName={name}
                    labelKey="action.report"
                  />
                ) : null}
              </span>
            </div>
          </div>
          <p className="xidig-dm-footerline">{t('messages.blockedComposer')}</p>
        </>
      ) : header.status === 'blocked' ? (
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
          {clip ? (
            <span className="xidig-dm-composer__clip">
              <span className="xidig-dm-voice__duration">
                {t('messages.voiceNoteWithDuration', {
                  duration: formatVoiceDuration(clip.durationSeconds),
                })}
              </span>
              <button
                type="button"
                className="xidig-icon-button"
                aria-label={t('messages.voiceDiscard')}
                onClick={() => setClip(null)}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ) : null}
          <div className="xidig-dm-composer__row">
            <textarea
              ref={composerRef}
              className="xidig-field__input"
              rows={1}
              value={draft}
              placeholder={t('messages.composerPlaceholder')}
              aria-label={t('messages.composerPlaceholder')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <VoiceRecorderButton disabled={sending || offline || clip !== null} onClip={setClip} />
            <button
              type="submit"
              className="xidig-button xidig-button--primary"
              disabled={sending || (draft.trim().length === 0 && clip === null)}
            >
              {t('action.send')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
