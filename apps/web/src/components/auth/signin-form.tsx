'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from './plain-error';
import { ResendControls } from './resend-controls';

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
  const [emailCode, setEmailCode] = useState('');
  const [linkSent, setLinkSent] = useState(false);
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
    setLinkSent(false);
    setEmailCode('');
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
      if (linkSent) {
        // Numeric fallback: the emailed code signs in when the link won't.
        void run(async () => {
          const data = await apiPost<{ next: string }>('/api/auth/email-otp/verify', {
            email,
            code: emailCode,
            next,
          });
          router.push(data.next);
          router.refresh();
        });
        return;
      }
      void run(async () => {
        const data = await apiPost<{ message: string }>('/api/auth/signin/magic-link', {
          email,
          next,
        });
        setNotice(data.message);
        setLinkSent(true);
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

        {method === 'magic-link' && linkSent ? (
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="signin-email-code">
              {t('auth.emailCodeLabel')}
            </label>
            <input
              id="signin-email-code"
              className="xidig-field__input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              required
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
            />
            <p className="xidig-field__hint">{t('auth.emailCodeHint')}</p>
          </div>
        ) : null}

        <button type="submit" className="xidig-button xidig-button--primary" disabled={pending}>
          {method === 'password'
            ? t('action.signIn')
            : method === 'magic-link'
              ? linkSent
                ? t('action.verifyCode')
                : t('action.sendLink')
              : otpRequested
                ? t('action.verifyCode')
                : t('action.sendCode')}
        </button>
        {/* Entry ritual continues: the mark breathes while we authenticate
            (flap = the loading gesture; spec §4). Decorative — the disabled
            button + hidden status text carry the state. */}
        {pending ? (
          <p className="xidig-auth__pending" role="status">
            <AnimatedMark mode="flap" size={26} />
            <span className="xidig-visually-hidden">{t('state.loading')}</span>
          </p>
        ) : null}
      </form>

      {method === 'magic-link' && linkSent ? (
        <ResendControls
          hintKeys={['auth.checkSpam', 'auth.trySmsInstead']}
          onResend={async () => {
            const data = await apiPost<{ message: string }>('/api/auth/signin/magic-link', {
              email,
              next,
            });
            setNotice(data.message);
          }}
        />
      ) : null}

      {method === 'sms' && otpRequested ? (
        <ResendControls
          hintKeys={['auth.tryEmailInstead']}
          onResend={async () => {
            const data = await apiPost<{ message: string }>('/api/auth/otp/request', { phone });
            setNotice(data.message);
          }}
        />
      ) : null}

      <div className="xidig-auth__meta">
        {method === 'password' ? (
          <a href="/reset-password">{t('auth.forgotPassword')}</a>
        ) : null}
        <a href="/signup">{t('auth.noAccount')} →</a>
      </div>
    </>
  );
}
