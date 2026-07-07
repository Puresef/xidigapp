'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { POST_BODY_MAX, POST_TITLE_MAX } from '@/lib/plaza/constants';

import { PlainErrorBanner } from '../auth/plain-error';
import { MentionAutocomplete } from './mention-autocomplete';

/**
 * Inline author edit on the post detail page (Phase 4.5). Content-only —
 * title/body/link, mirroring postUpdateSchema (never type, images, or poll
 * shape). The server snapshots the previous version into post_revisions
 * before applying, so the edit history is written even if the author closes
 * the tab right after. Success → router.refresh() re-renders the card.
 */
export function PostEditForm({
  postId,
  initialTitle,
  initialBody,
  initialLinkUrl,
  onClose,
}: {
  postId: string;
  initialTitle: string | null;
  initialBody: string;
  initialLinkUrl: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const fieldId = useId();
  const [title, setTitle] = useState(initialTitle ?? '');
  const [body, setBody] = useState(initialBody);
  const [link, setLink] = useState(initialLinkUrl ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !body.trim()) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiPatch(`/api/posts/${postId}`, {
          title: title.trim() || null,
          body: body.trim(),
          linkUrl: link.trim() || null,
        });
        onClose();
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <form className="xidig-form" onSubmit={submit} aria-label={t('plaza.editPost')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={`${fieldId}-title`}>
          {t('plaza.titleLabel')}
        </label>
        <input
          id={`${fieldId}-title`}
          className="xidig-field__input"
          maxLength={POST_TITLE_MAX}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={`${fieldId}-body`}>
          {t('plaza.bodyLabel')}
        </label>
        <MentionAutocomplete
          id={`${fieldId}-body`}
          value={body}
          onChange={setBody}
          rows={4}
          maxLength={POST_BODY_MAX}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={`${fieldId}-link`}>
          {t('plaza.linkLabel')}
        </label>
        <input
          id={`${fieldId}-link`}
          className="xidig-field__input"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
      </div>

      <div className="xidig-profile__actions">
        <button
          type="submit"
          className="xidig-button xidig-button--primary"
          disabled={pending || !body.trim()}
        >
          {t('action.save')}
        </button>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={onClose}
        >
          {t('action.cancel')}
        </button>
      </div>
    </form>
  );
}
