'use client';

import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';

/**
 * Waitlist capture. `from` is the front-door CTA's attribution token
 * (?from=<page>, docs/front-door-plan.md §5) — server-validated, no cookies.
 * The updates-only checkbox is the honest capture lane for people who want
 * news but aren't requesting a membership spot.
 */
export function WaitlistForm({ from }: { from?: string }) {
  const t = useT();
  const [contact, setContact] = useState('');
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const trimmed = contact.trim();
    const payload = {
      ...(trimmed.includes('@') ? { email: trimmed } : { phone: trimmed }),
      ...(from ? { from } : {}),
      ...(updatesOnly ? { updatesOnly } : {}),
    };
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
        <div className="xidig-option-row">
          <input
            id="waitlist-updates-only"
            type="checkbox"
            checked={updatesOnly}
            onChange={(e) => setUpdatesOnly(e.target.checked)}
          />
          <label htmlFor="waitlist-updates-only">{t('waitlist.updatesOnly')}</label>
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('action.joinWaitlist')}
        </button>
      </form>
    </>
  );
}
