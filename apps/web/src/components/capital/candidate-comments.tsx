'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiGet, apiPost } from '@/lib/api-client';
import type { CommentView } from '@/lib/plaza/views';
import type { PlainError } from '@/lib/errors';
import { COMMENT_BODY_MAX } from '@/lib/plaza/constants';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Open member comments on a Candidate (§12/§17). Reuses the Phase 2 CommentView
 * shape and the shared comment service (server-side), but targets the
 * candidate-scoped routes (`/api/candidates/[id]/comments`) rather than the
 * post-scoped ones — the plaza CommentThread is postId-bound and owned by
 * another surface, so this is the candidate sibling (no Ask/credit affordances,
 * which are post-only). Conversation order, explicit load-more (§22 low-bw).
 */

interface CommentsPage {
  items: CommentView[];
  nextCursor: string | null;
}

export function CandidateComments({
  candidateId,
  viewerId,
}: {
  candidateId: string;
  viewerId: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [items, setItems] = useState<CommentView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [body, setBody] = useState('');
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
      try {
        const page = await apiGet<CommentsPage>(
          cursor
            ? `/api/candidates/${candidateId}/comments?cursor=${encodeURIComponent(cursor)}`
            : `/api/candidates/${candidateId}/comments`,
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
    [candidateId],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  function post() {
    const trimmed = body.trim();
    if (trimmed === '' || actionPending) return;
    void (async () => {
      setActionPending(true);
      setError(null);
      try {
        const { comment } = await apiPost<{ comment: CommentView }>(
          `/api/candidates/${candidateId}/comments`,
          { body: trimmed },
        );
        setBody('');
        setItems((current) => [...current, comment]);
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

  return (
    <section className="xidig-section" aria-label={t('capital.commentsHeading')}>
      <h2 className="xidig-section__title">{t('capital.commentsHeading')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}

      {!loaded && pending ? <p className="xidig-card__meta">{t('state.loading')}</p> : null}
      {loaded && items.length === 0 ? (
        <p className="xidig-card__meta">{t('capital.commentsEmpty')}</p>
      ) : null}

      <ul className="xidig-card-grid">
        {items.map((item) => {
          const comment = item.comment;
          const isOwn = comment.author_user_id === viewerId;
          return (
            <li key={comment.id} className="xidig-card">
              <p className="xidig-card__meta">
                {item.author ? (
                  <Link href={`/u/${item.author.handle}`}>{item.author.display_name}</Link>
                ) : null}{' '}
                {formatRelativeTime(new Date(comment.created_at), locale)}
              </p>
              <p className="xidig-card__body">{comment.body}</p>
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

      <form
        className="xidig-form"
        onSubmit={(e) => {
          e.preventDefault();
          post();
        }}
      >
        <div className="xidig-field">
          <label className="xidig-field__label">{t('capital.commentLabel')}</label>
          <textarea
            className="xidig-field__input"
            rows={3}
            maxLength={COMMENT_BODY_MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="xidig-button xidig-button--primary"
          disabled={actionPending || body.trim() === ''}
        >
          {t('action.comment')}
        </button>
      </form>
    </section>
  );
}
