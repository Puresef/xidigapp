'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';

/**
 * Three co-equal sign-in methods (§9): password, magic link, SMS OTP.
 * Copy is server-§27 for API failures and t() keys for chrome. The SMS tab
 * is a two-step flow (request code → verify code) in one component.
 */

export type SignInMethod = 'password' | 'magic-link' | 'sms';

const METHODS: SignInMethod[] = ['password', 'magic-link', 'sms'];

export function SignInForm({ initialMethod, next }: { initialMethod: SignInMethod; next: string }) {
  const t = useT();
  const router = useRouter();

  const [method, setMethod] = useState<SignInMethod>(initialMethod);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const methodLabel: Record<SignInMethod, string> = {
    password: t('auth.methodPassword'),
    'magic-link': t('auth.methodMagicLink'),
    sms: t('auth.methodSms'),
  };

  function switchMethod(nextMethod: SignInMethod) {
    setMethod(nextMethod);
    setError(null);
    setNotice(null);
    setOtpRequested(false);
    setOtpCode('');
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      if (cause instanceof ApiRequestError) setError(cause.plain);
      else setError({ code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (method === 'password') {
      void run(async () => {
        const data = await apiPost<{ next: string }>('/api/auth/signin/password', {
          email,
          password,
          next,
        });
        router.push(data.next);
        router.refresh();
      });
    } else if (method === 'magic-link') {
      void run(async () => {
        const data = await apiPost<{ message: string }>('/api/auth/signin/magic-link', {
          email,
          next,
        });
        setNotice(data.message);
      });
    } else if (!otpRequested) {
      void run(async () => {
        const data = await apiPost<{ message: string }>('/api/auth/otp/request', { phone });
        setNotice(data.message);
        setOtpRequested(true);
      });
    } else {
      void run(async () => {
        const data = await apiPost<{ next: string }>('/api/auth/otp/verify', {
          phone,
          token: otpCode,
          next,
        });
        router.push(data.next);
        router.refresh();
      });
    }
  }

  return (
    <>
      <div role="tablist" aria-label={t('auth.chooseMethod')} className="xidig-tabs">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={m === method}
            className="xidig-tabs__tab"
            onClick={() => switchMethod(m)}
          >
            {methodLabel[m]}
          </button>
        ))}
      </div>

      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <form className="xidig-form" onSubmit={onSubmit}>
        {method === 'sms' ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signin-phone">
              {t('auth.phoneLabel')}
            </label>
            <input
              id="signin-phone"
              className="xidig-field__input"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={otpRequested}
            />
            <p className="xidig-field__hint">{t('auth.phoneHint')}</p>
          </div>
        ) : (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signin-email">
              {t('auth.emailLabel')}
            </label>
            <input
              id="signin-email"
              className="xidig-field__input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        {method === 'password' ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signin-password">
              {t('auth.passwordLabel')}
            </label>
            <input
              id="signin-password"
              className="xidig-field__input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        ) : null}

        {method === 'sms' && otpRequested ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signin-otp">
              {t('auth.otpCodeLabel')}
            </label>
            <input
              id="signin-otp"
              className="xidig-field__input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              required
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
          </div>
        ) : null}

        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {method === 'password'
            ? t('action.signIn')
            : method === 'magic-link'
              ? t('action.sendLink')
              : otpRequested
                ? t('action.verifyCode')
                : t('action.sendCode')}
        </button>
      </form>

      <div className="xidig-auth__meta">
        {method === 'password' ? (
          <a href="/reset-password">{t('auth.forgotPassword')}</a>
        ) : null}
        <a href="/signup">{t('auth.noAccount')} →</a>
      </div>
    </>
  );
}
