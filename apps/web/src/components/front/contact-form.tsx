'use client';

import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/** Front-door contact intake — mirrors WaitlistForm's plain form pattern. */
export function ContactForm() {
  const t = useT();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    apiPost<{ message: string }>('/api/contact', {
      name: name.trim(),
      contact: contact.trim(),
      message: message.trim(),
    })
      .then((data) => setNotice(data.message))
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
          <label className="xidig-field__label" htmlFor="contact-name">
            {t('marketing.contactNameLabel')}
          </label>
          <input
            id="contact-name"
            className="xidig-field__input"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="contact-contact">
            {t('waitlist.contactLabel')}
          </label>
          <input
            id="contact-contact"
            className="xidig-field__input"
            required
            autoComplete="email"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
        </div>
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="contact-message">
            {t('marketing.contactMessageLabel')}
          </label>
          <textarea
            id="contact-message"
            className="xidig-field__input"
            required
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {t('marketing.contactSend')}
        </button>
      </form>
    </>
  );
}
