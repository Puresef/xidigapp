'use client';

import { useState } from 'react';

import { formatRelativeTime } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Edit history viewer (Phase 4.5), author/mod only — the page decides whether
 * to render it at all (and the API re-checks). Revisions load on first open;
 * each entry is the post as it read BEFORE that edit, newest first, with the
 * "edited after replies" trust marker when answers already existed.
 */

interface RevisionRow {
  id: string;
  previous_title: string | null;
  previous_body: string | null;
  previous_link_url: string | null;
  had_replies: boolean;
  created_at: string;
}

export function PostHistory({ postId, count }: { postId: string; count: number }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RevisionRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null && !pending) {
      setPending(true);
      setError(null);
      apiGet<{ items: RevisionRow[] }>(`/api/posts/${postId}/revisions`)
        .then((page) => setItems(page.items))
        .catch((cause: unknown) => {
          if (cause instanceof ApiRequestError) setError(cause.plain);
          else setError({ code: 'server_error', message: '' });
        })
        .finally(() => setPending(false));
    }
  }

  return (
    <div className="xidig-revisions">
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        aria-expanded={open}
        onClick={toggle}
      >
        {t('plaza.editHistoryCount', { count })}
      </button>

      {open ? (
        <div className="xidig-revisions__panel">
          {error ? <PlainErrorBanner error={error} /> : null}
          {pending ? <p className="xidig-card__meta">{t('state.loading')}</p> : null}
          {items !== null && items.length === 0 ? (
            <p className="xidig-card__meta">{t('plaza.editHistoryEmpty')}</p>
          ) : null}

          {items !== null && items.length > 0 ? (
            <ul className="xidig-card-grid">
              {items.map((revision) => (
                <li key={revision.id} className="xidig-card">
                  <p className="xidig-card__meta">
                    {formatRelativeTime(new Date(revision.created_at), locale)}
                    {revision.had_replies ? (
                      <>
                        {' '}
                        <span className="xidig-tag">{t('plaza.editedAfterReplies')}</span>
                      </>
                    ) : null}
                  </p>
                  {revision.previous_title ? (
                    <p className="xidig-card__title">{revision.previous_title}</p>
                  ) : null}
                  {revision.previous_body ? (
                    <p className="xidig-card__body">{revision.previous_body}</p>
                  ) : null}
                  {revision.previous_link_url ? (
                    <p className="xidig-card__meta">{revision.previous_link_url}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
