'use client';

import { type FormEvent, useId, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
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
 *
 * Offline path (E2 s4): when the network is down (or the POST dies without
 * an HTTP response), the reply hands off to the thread's offline queue via
 * `onNetworkFail` instead of erroring — work is never lost, and nothing
 * pretends to be sent. Server-refused comments (§27 errors) still error.
 */
export function CommentForm({
  postId,
  onCreated,
  labelKey = 'plaza.commentLabel',
  onNetworkFail,
}: {
  postId: string;
  onCreated: (comment: CommentView) => void;
  /** The asker adds "warbixin" (updates); everyone else adds a comment. */
  labelKey?: MessageKey;
  /** Return true to claim the body for the offline queue. */
  onNetworkFail?: (body: string) => boolean;
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

    if (typeof navigator !== 'undefined' && !navigator.onLine && onNetworkFail?.(trimmed)) {
      setBody('');
      setError(null);
      return;
    }

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
        else if (onNetworkFail?.(trimmed)) setBody('');
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
          {t(labelKey)}
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
