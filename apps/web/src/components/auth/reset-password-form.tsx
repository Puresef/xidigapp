'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch, apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';

/**
 * Two-stage reset flow (§27):
 *  - request: email me a 60-minute link (neutral response, no enumeration);
 *  - update:  recovery session active (arrived via the emailed link) — choose
 *    the new password. Also reused as the plain change-password form.
 */
export function ResetPasswordForm({ stage }: { stage: 'request' | 'update' }) {
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const action =
      stage === 'request'
        ? apiPost<{ message: string }>('/api/auth/password', { email }).then((data) =>
            setNotice(data.message),
          )
        : apiPatch<{ message: string }>('/api/auth/password', { password }).then((data) => {
            setNotice(data.message);
            setTimeout(() => {
              router.push('/');
              router.refresh();
            }, 1200);
          });

    action
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      })
      .finally(() => setPending(false));
  }

  return (
    <>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <form className="xidig-form" onSubmit={onSubmit}>
        {stage === 'request' ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="reset-email">
              {t('auth.emailLabel')}
            </label>
            <input
              id="reset-email"
              className="xidig-field__input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        ) : (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="reset-password">
              {t('auth.newPasswordLabel')}
            </label>
            <input
              id="reset-password"
              className="xidig-field__input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="xidig-field__hint">{t('auth.passwordRules', { min: 10 })}</p>
          </div>
        )}

        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {stage === 'request' ? t('action.resetPassword') : t('action.setPassword')}
        </button>
      </form>
    </>
  );
}
