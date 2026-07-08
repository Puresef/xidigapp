'use client';

import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Phase 6 member appeal form (§19). One form per appealable mod_action. Submits
 * to POST /api/appeals with { modActionId, body }; on success it shows the §27
 * notice the API returns (messages.appealSubmitted) and locks the form so the
 * one-appeal-per-action rule is obvious in the UI too.
 */

export interface AppealTarget {
  modActionId: string;
  /** i18n-resolved label of the original action (e.g. "Content removed"). */
  actionLabel: string;
}

export function AppealForm({ target }: { target: AppealTarget }) {
  const t = useT();
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const data = await apiPost<{ message: string }>('/api/appeals', {
        modActionId: target.modActionId,
        body,
      });
      setNotice(data.message);
      setBody('');
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  if (notice) {
    return <Banner kind="notice">{notice}</Banner>;
  }

  const fieldId = `appeal-body-${target.modActionId}`;
  return (
    <form className="xidig-form" onSubmit={(e) => void onSubmit(e)}>
      {error ? <PlainErrorBanner error={error} /> : null}
      <p className="xidig-card__meta">
        {t('settings.appealActionLabel')}: {target.actionLabel}
      </p>
      <div className="xidig-field">
        <label className="xidig-field__label" htmlFor={fieldId}>
          {t('settings.appealReasonLabel')}
        </label>
        <textarea
          id={fieldId}
          className="xidig-field__input"
          rows={4}
          required
          maxLength={2000}
          placeholder={t('settings.appealReasonPlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
        {t('settings.appealSubmit')}
      </button>
    </form>
  );
}
