'use client';

import { type FormEvent, useId, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { Avatar } from '@/components/media/avatar';
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
export interface ComposerViewer {
  displayName: string;
  handle: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

export function CommentForm({
  postId,
  onCreated,
  labelKey = 'plaza.commentLabel',
  onNetworkFail,
  presentation = 'block',
  viewer,
}: {
  postId: string;
  onCreated: (comment: CommentView) => void;
  /** The asker adds "warbixin" (updates); everyone else adds a comment. */
  labelKey?: MessageKey;
  /** Return true to claim the body for the offline queue. */
  onNetworkFail?: (body: string) => boolean;
  /** 'pill' = the detail-thread composer per the dark frames: avatar +
   * rounded single-row input + Dir, disabled until typed. */
  presentation?: 'block' | 'pill';
  /** Leading avatar for the pill composer (the signed-in viewer). */
  viewer?: ComposerViewer;
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

  if (presentation === 'pill') {
    return (
      <form className="xidig-comment-pill" onSubmit={onSubmit}>
        {error ? <PlainErrorBanner error={error} /> : null}
        <div className="xidig-comment-pill__row">
          {viewer ? (
            <Avatar
              name={viewer.displayName}
              handle={viewer.handle || viewer.displayName}
              src={viewer.avatarThumbUrl}
              blurhash={viewer.avatarBlurhash}
              size={32}
            />
          ) : null}
          <label className="xidig-visually-hidden" htmlFor={fieldId}>
            {t(labelKey)}
          </label>
          <MentionAutocomplete
            id={fieldId}
            value={body}
            onChange={setBody}
            rows={1}
            maxLength={COMMENT_BODY_MAX}
            placeholder={t(labelKey)}
          />
          <button
            type="submit"
            className="xidig-button xidig-button--primary"
            disabled={pending || body.trim() === ''}
          >
            {t('action.send')}
          </button>
        </div>
      </form>
    );
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
