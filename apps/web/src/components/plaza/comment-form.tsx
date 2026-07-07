'use client';

import { type FormEvent, useId, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { MentionAutocomplete } from '@/components/social/mention-autocomplete';
import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { COMMENT_BODY_MAX } from '@/lib/plaza/constants';
import type { CommentView } from '@/lib/plaza/views';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Add-a-comment form on /p/[id] (§15). The daily comment limit (§26) comes
 * back as a 429 with §27 copy — rendered verbatim by PlainErrorBanner.
 * The box has @mention autocomplete (Phase 4.5 §13) — mentioning notifies.
 */
export function CommentForm({
  postId,
  onCreated,
}: {
  postId: string;
  onCreated: (comment: CommentView) => void;
}) {
  const t = useT();
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed === '' || pending) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const { comment } = await apiPost<{ comment: CommentView }>(
          `/api/posts/${postId}/comments`,
          { body: trimmed },
        );
        setBody('');
        onCreated(comment);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <form className="xidig-form" onSubmit={onSubmit}>
      {error ? <PlainErrorBanner error={error} /> : null}
      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={fieldId}>
          {t('plaza.commentLabel')}
        </label>
        <MentionAutocomplete
          id={fieldId}
          value={body}
          onChange={setBody}
          rows={3}
          maxLength={COMMENT_BODY_MAX}
        />
      </div>
      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('action.comment')}
      </button>
    </form>
  );
}
