'use client';

import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';

export function WaitlistForm() {
  const t = useT();
  const [contact, setContact] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const trimmed = contact.trim();
    const payload = trimmed.includes('@') ? { email: trimmed } : { phone: trimmed };
    apiPost<{ message: string }>('/api/waitlist', payload)
      .then((data) => {
        setNotice(data.message);
        setContact('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      })
      .finally(() => setPending(false));
  }

  if (notice) {
    return <Banner kind="notice">{notice}</Banner>;
  }

  return (
    <>
      {error ? <PlainErrorBanner error={error} /> : null}
      <form className="xidig-form" onSubmit={onSubmit}>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="waitlist-contact">
            {t('waitlist.contactLabel')}
          </label>
          <input
            id="waitlist-contact"
            className="xidig-field__input"
            required
            autoComplete="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <p className="xidig-field__hint">{t('auth.phoneHint')}</p>
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('action.joinWaitlist')}
        </button>
      </form>
    </>
  );
}
