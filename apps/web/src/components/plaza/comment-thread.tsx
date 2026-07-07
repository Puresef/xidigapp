'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { CommentView, PostView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';
import { CommentForm } from './comment-form';
import { ReactionBar } from './reaction-bar';

/**
 * Comment thread on /p/[id] (§15). Conversation order (created_at ASC) with
 * explicit "load more" — no infinite scroll on low-bandwidth connections
 * (§22). The Ask credit action lives on each eligible comment while the Ask
 * is open; crediting flips the Ask server-side and refreshes the page so the
 * status chip and controls catch up.
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
  askStatus: 'open' | 'answered' | 'closed' | null;
  creditedCommentId: string | null;
}

export function CommentThread({
  postId,
  viewerId,
  askContext,
}: {
  postId: string;
  viewerId: string;
  askContext: AskContext;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<CommentView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [creditedId, setCreditedId] = useState<string | null>(null);
  const [creditedNotice, setCreditedNotice] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
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
        if (cause instanceof ApiRequestError) setError(cause.plain);
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

  function credit(commentId: string) {
    void (async () => {
      setActionPending(true);
      setError(null);
      try {
        await apiPost<{ post: PostView }>(`/api/posts/${postId}/ask`, {
          action: 'credit',
          commentId,
        });
        setCreditedId(commentId);
        setCreditedNotice(true);
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setActionPending(false);
      }
    })();
  }

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

  // A just-made credit counts before router.refresh() delivers new props.
  const effectiveAskStatus = creditedId !== null ? 'answered' : askContext.askStatus;

  return (
    <section aria-label={t('plaza.commentsHeading')}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {creditedNotice ? <Banner kind="notice">{t('plaza.helperCredited')}</Banner> : null}

      {!loaded && pending ? <p className="xidig-card__meta">{t('state.loading')}</p> : null}
      {loaded && items.length === 0 ? <p className="xidig-card__meta">{t('state.empty')}</p> : null}

      <ul className="xidig-card-grid">
        {items.map((item) => {
          const comment = item.comment;
          const isCredited =
            comment.is_credited_answer ||
            comment.id === askContext.creditedCommentId ||
            comment.id === creditedId;
          const canCredit =
            askContext.isAsker &&
            effectiveAskStatus === 'open' &&
            comment.author_user_id !== viewerId &&
            comment.status === 'published' &&
            !isCredited;
          const isOwn = comment.author_user_id === viewerId;

          return (
            <li key={comment.id} className="xidig-card">
              <p className="xidig-card__meta">
                {item.author ? (
                  <Link href={`/u/${item.author.handle}`}>{item.author.display_name}</Link>
                ) : null}{' '}
                {formatRelativeTime(new Date(comment.created_at), locale)}
                {comment.edited_at !== null ? (
                  <>
                    {' '}
                    <span className="xidig-tag">{t('plaza.edited')}</span>
                  </>
                ) : null}
                {isCredited ? (
                  <>
                    {' '}
                    <span className="xidig-tag xidig-tag--ok">{t('plaza.creditedBadge')}</span>
                  </>
                ) : null}
              </p>
              <p className="xidig-card__body">{comment.body}</p>
              <ReactionBar
                targetKind="comment"
                targetId={comment.id}
                counts={item.reactions}
                mine={item.myReactions}
              />
              {canCredit || isOwn ? (
                <p className="xidig-profile__actions">
                  {canCredit ? (
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      disabled={actionPending}
                      onClick={() => credit(comment.id)}
                    >
                      {t('plaza.creditAnswer')}
                    </button>
                  ) : null}
                  {isOwn ? (
                    <button
                      type="button"
                      className="xidig-button xidig-button--secondary"
                      disabled={actionPending}
                      onClick={() => remove(comment.id)}
                    >
                      {t('action.delete')}
                    </button>
                  ) : null}
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

      <CommentForm
        postId={postId}
        onCreated={(comment) => setItems((current) => [...current, comment])}
      />
    </section>
  );
}
