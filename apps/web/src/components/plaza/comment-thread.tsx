'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { CommentView } from '@/lib/plaza/views';

import { Avatar } from '../media/avatar';
import { PlainErrorBanner } from '../auth/plain-error';
import { CommentForm, type ComposerViewer } from './comment-form';
import { ReactionBar } from './reaction-bar';
import { QueuedReplies, type QueuedReply } from './codsi/queued-replies';
import { ThreadEmpty } from './codsi/thread-empty';
import { ThreadError } from './codsi/thread-error';
import { LoadingFlap } from '@/components/loading-flap';

/**
 * Comment thread on /p/[id] (§15). Conversation order (created_at ASC) with
 * explicit "load more" — no infinite scroll on low-bandwidth connections
 * (§22).
 *
 * P1 Codsi rework: answer-crediting is gone (the helper model lives on the
 * post; historical credited answers keep their badge). The thread carries
 * the E2 family — s2 empty-as-fact, s3 partial error (the ask above stays
 * readable), s4 offline queue (replies wait in localStorage with their TRUE
 * timestamps and flush when the connection returns).
 *
 * v1 skips inline comment EDITING on purpose (the PATCH API exists) — delete
 * + repost covers the beta; revisit with the Phase 3 UI pass.
 */

interface CommentsPage {
  items: CommentView[];
  nextCursor: string | null;
}

export interface AskContext {
  isAsker: boolean;
  askStatus: 'open' | 'in_progress' | 'fulfilled' | 'answered' | 'closed' | null;
  creditedCommentId: string | null;
}

function queueStorageKey(postId: string): string {
  return `xidig:reply-queue:${postId}`;
}

function readQueue(postId: string): QueuedReply[] {
  try {
    const raw = window.localStorage.getItem(queueStorageKey(postId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedReply =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as QueuedReply).body === 'string' &&
        typeof (item as QueuedReply).queuedAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeQueue(postId: string, items: QueuedReply[]): void {
  try {
    if (items.length === 0) window.localStorage.removeItem(queueStorageKey(postId));
    else window.localStorage.setItem(queueStorageKey(postId), JSON.stringify(items));
  } catch {
    // Storage unavailable (private mode) — the in-memory queue still works
    // for this visit; it just won't survive a reload.
  }
}

export function CommentThread({
  postId,
  viewerId,
  openedAt,
  askContext,
  viewer,
}: {
  postId: string;
  viewerId: string;
  /** post.created_at — the empty state states how long the ask has waited. */
  openedAt: string;
  askContext: AskContext;
  /** Signed-in viewer identity for the pill composer's avatar (dark frames). */
  viewer?: ComposerViewer;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState<CommentView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [queued, setQueued] = useState<QueuedReply[]>([]);
  const flushing = useRef(false);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
      if (cursor === null) setLoadFailed(false);
      try {
        const page = await apiGet<CommentsPage>(
          cursor
            ? `/api/posts/${postId}/comments?cursor=${encodeURIComponent(cursor)}`
            : `/api/posts/${postId}/comments`,
        );
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setLoaded(true);
      } catch (cause) {
        // The initial page failing is the s3 partial state (the ask above is
        // still readable); a failed "load more" keeps what's already there.
        // load(null) only ever runs pre-load (mount + the s3 retry).
        if (cursor === null) setLoadFailed(true);
        else if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    },
    [postId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  // ---- offline queue (E2 s4) ---------------------------------------------

  useEffect(() => {
    setQueued(readQueue(postId));
  }, [postId]);

  const flushQueue = useCallback(() => {
    if (flushing.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const waiting = readQueue(postId);
    if (waiting.length === 0) return;
    flushing.current = true;
    void (async () => {
      try {
        const remaining = [...waiting];
        for (const item of waiting) {
          try {
            const { comment } = await apiPost<{ comment: CommentView }>(
              `/api/posts/${postId}/comments`,
              { body: item.body },
            );
            remaining.shift();
            writeQueue(postId, remaining);
            setQueued([...remaining]);
            setItems((current) => [...current, comment]);
          } catch (cause) {
            // Server-refused (§27) → surface and drop so it can't loop
            // forever; network death → keep waiting for the next 'online'.
            if (cause instanceof ApiRequestError) {
              setError(cause.plain);
              remaining.shift();
              writeQueue(postId, remaining);
              setQueued([...remaining]);
            }
            break;
          }
        }
      } finally {
        flushing.current = false;
      }
    })();
  }, [postId]);

  useEffect(() => {
    flushQueue();
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [flushQueue]);

  function enqueue(body: string): boolean {
    const item: QueuedReply = { body, queuedAt: Date.now() };
    const next = [...readQueue(postId), item];
    writeQueue(postId, next);
    setQueued(next);
    return true;
  }

  function removeQueued(queuedAt: number) {
    const next = readQueue(postId).filter((item) => item.queuedAt !== queuedAt);
    writeQueue(postId, next);
    setQueued(next);
  }

  // ---- actions -------------------------------------------------------------

  function remove(commentId: string) {
    void (async () => {
      setActionPending(true);
      setError(null);
      try {
        await apiDelete<{ deleted: true }>(`/api/comments/${commentId}`);
        setItems((current) => current.filter((item) => item.comment.id !== commentId));
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setActionPending(false);
      }
    })();
  }

  const isCodsi = askContext.askStatus !== null;

  return (
    <section aria-label={t('plaza.commentsHeading')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      {/* Composer leads the thread (1b/2b): avatar + pill input + Dir. The
          owner writes "warbixin" (updates); everyone else replies. */}
      <CommentForm
        postId={postId}
        onCreated={(comment) => setItems((current) => [...current, comment])}
        labelKey={
          isCodsi && askContext.isAsker ? 'plaza.commentLabelOwner' : 'plaza.commentPlaceholder'
        }
        onNetworkFail={enqueue}
        presentation="pill"
        {...(viewer ? { viewer } : {})}
      />

      {!loaded && pending ? <LoadingFlap /> : null}
      {loadFailed && !loaded ? <ThreadError onRetry={() => void load(null)} /> : null}
      {loaded && items.length === 0 && queued.length === 0 ? (
        isCodsi ? (
          <ThreadEmpty openedAt={openedAt} />
        ) : (
          <p className="xidig-card__meta">{t('state.empty')}</p>
        )
      ) : null}

      <ul className="xidig-card-grid">
        {items.map((item) => {
          const comment = item.comment;
          const isCredited =
            comment.is_credited_answer || comment.id === askContext.creditedCommentId;
          const isOwn = comment.author_user_id === viewerId;

          return (
            <li key={comment.id} className="xidig-card">
              {/* Comment byline: 28px avatar (author may be null — deactivated —
                  in which case no disc renders, never an empty gap). */}
              <div className="xidig-byline">
                {item.author ? (
                  <Link
                    href={`/u/${item.author.handle}`}
                    className="xidig-byline__avatar"
                    aria-label={item.author.display_name}
                  >
                    <Avatar
                      name={item.author.display_name}
                      handle={item.author.handle}
                      src={item.author.avatar_thumb_url}
                      blurhash={item.author.avatar_blurhash}
                      size={28}
                    />
                  </Link>
                ) : null}
                <p className="xidig-card__meta xidig-byline__text">
                  {item.author ? (
                    <Link className="xidig-byline__name" href={`/u/${item.author.handle}`}>
                      {item.author.display_name}
                    </Link>
                  ) : null}{' '}
                  {formatRelativeTime(new Date(comment.created_at), locale)}
                  {comment.edited_at !== null ? (
                    <>
                      {' '}
                      <span className="xidig-tag">{t('plaza.edited')}</span>
                    </>
                  ) : null}
                  {/* Historical credit (pre-P1 answer model) keeps its badge —
                      the record stays honest even though the action is gone. */}
                  {isCredited ? (
                    <>
                      {' '}
                      <span className="xidig-tag xidig-tag--ok">{t('plaza.creditedBadge')}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <p className="xidig-card__body">{comment.body}</p>
              <ReactionBar
                targetKind="comment"
                targetId={comment.id}
                counts={item.reactions}
                mine={item.myReactions}
              />
              {isOwn ? (
                <p className="xidig-profile__actions">
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    disabled={actionPending}
                    onClick={() => remove(comment.id)}
                  >
                    {t('action.delete')}
                  </button>
                </p>
              ) : null}
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
            onClick={() => void load(nextCursor)}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : null}

      <QueuedReplies items={queued} onRemove={removeQueued} />
    </section>
  );
}
