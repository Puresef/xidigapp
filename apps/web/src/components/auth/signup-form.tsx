'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';

/**
 * Beta signup: invite code + one of the three co-equal methods (§9) + terms.
 * SMS is two-step (create+send code → verify → session). Email methods end
 * on a "check your email" notice; the emailed link completes the account.
 */

type Method = 'password' | 'magic_link' | 'sms';

export function SignUpForm({ initialCode }: { initialCode: string }) {
  const t = useT();
  const router = useRouter();

  const [method, setMethod] = useState<Method>('password');
  const [inviteCode, setInviteCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const methodLabel: Record<Method, string> = {
    password: t('auth.methodPassword'),
    magic_link: t('auth.methodMagicLink'),
    sms: t('auth.methodSms'),
  };

  function switchMethod(nextMethod: Method) {
    setMethod(nextMethod);
    setError(null);
    setNotice(null);
    setOtpRequested(false);
    setOtpCode('');
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
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

    if (method === 'sms' && otpRequested) {
      void run(async () => {
        const data = await apiPost<{ next: string }>('/api/auth/otp/verify', {
          phone,
          token: otpCode,
          next: '/onboarding',
        });
        router.push(data.next);
        router.refresh();
      });
      return;
    }

    void run(async () => {
      const payload =
        method === 'sms'
          ? { method, phone, inviteCode, acceptTerms }
          : method === 'password'
            ? { method, email, password, inviteCode, acceptTerms }
            : { method, email, inviteCode, acceptTerms };
      const data = await apiPost<{ message: string }>('/api/auth/signup', payload);
      setNotice(data.message);
      if (method === 'sms') setOtpRequested(true);
    });
  }

  return (
    <>
      <div role="tablist" aria-label={t('auth.chooseMethod')} className="xidig-tabs">
        {(Object.keys(methodLabel) as Method[]).map((m) => (
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
        <div className="xidig-field">
          <label className="xidig-field__label" htmlFor="signup-code">
            {t('auth.inviteCodeLabel')}
          </label>
          <input
            id="signup-code"
            className="xidig-field__input"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            disabled={otpRequested}
          />
          <p className="xidig-field__hint">{t('auth.inviteCodeHint')}</p>
        </div>

        {method === 'sms' ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signup-phone">
              {t('auth.phoneLabel')}
            </label>
            <input
              id="signup-phone"
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
            <label className="xidig-field__label" htmlFor="signup-email">
              {t('auth.emailLabel')}
            </label>
            <input
              id="signup-email"
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
            <label className="xidig-field__label" htmlFor="signup-password">
              {t('auth.passwordLabel')}
            </label>
            <input
              id="signup-password"
              className="xidig-field__input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="xidig-field__hint">{t('auth.passwordRules', { min: 10 })}</p>
          </div>
        ) : null}

        {method === 'sms' && otpRequested ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signup-otp">
              {t('auth.otpCodeLabel')}
            </label>
            <input
              id="signup-otp"
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

        {!otpRequested ? (
          <label className="xidig-checkbox">
            <input
              type="checkbox"
              required
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
            />
            <span>{t('auth.termsAccept')}</span>
          </label>
        ) : null}

        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {method === 'sms' && otpRequested ? t('action.verifyCode') : t('action.createAccount')}
        </button>
      </form>

      <div className="xidig-auth__meta">
        <a href="/signin">{t('auth.haveAccount')} →</a>
        <a href="/waitlist">{t('action.joinWaitlist')} →</a>
      </div>
    </>
  );
}
