'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * One composer for the three Space content kinds (§16): an update, an artifact
 * (shared LINK only, no uploads), or a decision. Contributors only — the API
 * re-checks the role, so hiding this for observers is presentation, not
 * security. Refreshes the RSC on success.
 */
export function ContentComposer({
  labId,
  kind,
}: {
  labId: string;
  kind: 'update' | 'artifact' | 'decision';
}) {
  const t = useT();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const paths = { update: 'updates', artifact: 'artifacts', decision: 'decisions' } as const;
  const ctaKeys = {
    update: 'lab.actionAddUpdate',
    artifact: 'lab.actionAddArtifact',
    decision: 'lab.actionAddDecision',
  } as const;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (kind === 'update') {
        if (title.trim()) payload.title = title.trim();
        payload.body = body.trim();
      } else if (kind === 'artifact') {
        payload.title = title.trim();
        payload.url = url.trim();
        if (body.trim()) payload.description = body.trim();
      } else {
        payload.title = title.trim();
        payload.decision = body.trim();
      }
      await apiPost(`/api/labs/${labId}/${paths[kind]}`, payload);
      setTitle('');
      setBody('');
      setUrl('');
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  const needsTitle = kind !== 'update';
  const bodyReady = kind === 'artifact' ? url.trim() && title.trim() : body.trim();

  return (
    <form className="xidig-form" onSubmit={submit}>
      {error ? <PlainErrorBanner error={error} /> : null}

      <label className="xidig-field">
        <span className="xidig-field__label">{t('lab.fieldName')}</span>
        <input
          className="xidig-field__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required={needsTitle}
        />
      </label>

      {kind === 'artifact' ? (
        <label className="xidig-field">
          <span className="xidig-field__label">{t('action.addLink')}</span>
          <input
            className="xidig-field__input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>
      ) : null}

      <label className="xidig-field">
        <span className="xidig-field__label">{t('action.comment')}</span>
        <textarea
          className="xidig-field__input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          required={kind !== 'artifact'}
        />
      </label>

      <button
        type="submit"
        className="xidig-button xidig-button--primary"
        disabled={pending || !bodyReady}
      >
        {t(ctaKeys[kind])}
      </button>
    </form>
  );
}
