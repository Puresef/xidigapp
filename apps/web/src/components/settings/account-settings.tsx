'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch, apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { createClient } from '@/lib/supabase-browser';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Account & sign-in settings (Phase 1 scaffold): the three methods of the
 * ONE canonical account (§9) — view/verify state, link email/phone, set or
 * change the password — plus the §20 set-a-password nudge and sign-out.
 */

export interface AccountSnapshot {
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  hasPassword: boolean;
  passwordNudgeDismissed: boolean;
}

interface Invite {
  id: string;
  code: string;
  redeemed_at: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{title}</h2>
      {children}
    </section>
  );
}

export function AccountSettings({
  snapshot,
  invites,
}: {
  snapshot: AccountSnapshot;
  invites: Invite[];
}) {
  const t = useT();
  const router = useRouter();

  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(snapshot.passwordNudgeDismissed);

  const [newEmail, setNewEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inviteList, setInviteList] = useState(invites);

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

  function statusTag(value: string | null, verified: boolean) {
    if (!value) return <span className="xidig-tag">{t('settings.statusNotSet')}</span>;
    return verified ? (
      <span className="xidig-tag xidig-tag--ok">{t('settings.statusVerified')}</span>
    ) : (
      <span className="xidig-tag">{t('settings.statusUnverified')}</span>
    );
  }

  const showNudge = !snapshot.hasPassword && !nudgeDismissed;

  return (
    <>
      {showNudge ? (
        <Banner kind="notice">
          <strong>{t('settings.passwordNudgeTitle')}.</strong> {t('settings.passwordNudgeBody')}{' '}
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            onClick={() =>
              void run(async () => {
                await apiPatch('/api/me/onboarding', { passwordNudgeDismissed: true });
                setNudgeDismissed(true);
              })
            }
          >
            {t('action.dismiss')}
          </button>
        </Banner>
      ) : null}

      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <p>{t('settings.methodsIntro')}</p>

      <Section title={t('settings.emailSection')}>
        <p>
          {snapshot.email ?? '—'} {statusTag(snapshot.email, snapshot.emailVerified)}
        </p>
        {snapshot.email && !snapshot.emailVerified ? (
          // Unverified email: a magic link doubles as verification — clicking
          // it proves ownership and confirms the address (Phase 4.5, §26).
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                const data = await apiPost<{ message: string }>('/api/auth/signin/magic-link', {
                  email: snapshot.email,
                });
                setNotice(data.message);
              })
            }
          >
            {t('settings.resendVerification')}
          </button>
        ) : null}
        {pendingEmail ? (
          <Banner kind="notice">{t('settings.linkEmailPending', { email: pendingEmail })}</Banner>
        ) : (
          <form
            className="xidig-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                const data = await apiPost<{ pendingEmail: string }>('/api/auth/link/email', {
                  email: newEmail,
                });
                setPendingEmail(data.pendingEmail);
              });
            }}
          >
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="link-email">
                {t('settings.linkEmailLabel')}
              </label>
              <input
                id="link-email"
                className="xidig-field__input"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="xidig-button xidig-button--secondary" disabled={pending}>
              {t('action.save')}
            </button>
          </form>
        )}
      </Section>

      <Section title={t('settings.phoneSection')}>
        <p>
          {snapshot.phone ?? '—'} {statusTag(snapshot.phone, snapshot.phoneVerified)}
        </p>
        {pendingPhone ? (
          <form
            className="xidig-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                await apiPost('/api/auth/otp/verify', {
                  phone: pendingPhone,
                  token: phoneOtp,
                  type: 'phone_change',
                });
                setPendingPhone(null);
                setPhoneOtp('');
                router.refresh();
              });
            }}
          >
            <Banner kind="notice">{t('settings.linkPhonePending', { phone: pendingPhone })}</Banner>
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="link-phone-otp">
                {t('auth.otpCodeLabel')}
              </label>
              <input
                id="link-phone-otp"
                className="xidig-field__input"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={phoneOtp}
                onChange={(e) => setPhoneOtp(e.target.value)}
              />
            </div>
            <button type="submit" className="xidig-button xidig-button--secondary" disabled={pending}>
              {t('action.verifyCode')}
            </button>
          </form>
        ) : (
          <form
            className="xidig-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                const data = await apiPost<{ pendingPhone: string }>('/api/auth/link/phone', {
                  phone: newPhone,
                });
                setPendingPhone(data.pendingPhone);
              });
            }}
          >
            <div className="xidig-field">
              <label className="xidig-field__label" htmlFor="link-phone">
                {t('settings.linkPhoneLabel')}
              </label>
              <input
                id="link-phone"
                className="xidig-field__input"
                type="tel"
                required
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <p className="xidig-field__hint">{t('auth.phoneHint')}</p>
            </div>
            <button type="submit" className="xidig-button xidig-button--secondary" disabled={pending}>
              {t('action.save')}
            </button>
          </form>
        )}
      </Section>

      <Section title={t('settings.passwordSection')}>
        <p>
          {snapshot.hasPassword ? (
            <span className="xidig-tag xidig-tag--ok">{t('settings.passwordIsSet')}</span>
          ) : (
            <span className="xidig-tag">{t('settings.statusNotSet')}</span>
          )}
        </p>
        <form
          className="xidig-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void run(async () => {
              const data = await apiPatch<{ message: string }>('/api/auth/password', {
                password: newPassword,
              });
              setNotice(data.message);
              setNewPassword('');
              router.refresh();
            });
          }}
        >
          <div className="xidig-field">
            <label className="xidig-field__label" htmlFor="settings-password">
              {t('auth.newPasswordLabel')}
            </label>
            <input
              id="settings-password"
              className="xidig-field__input"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="xidig-field__hint">{t('auth.passwordRules', { min: 10 })}</p>
          </div>
          <button type="submit" className="xidig-button xidig-button--secondary" disabled={pending}>
            {snapshot.hasPassword ? t('action.changePassword') : t('action.setPassword')}
          </button>
        </form>
      </Section>

      <Section title={t('settings.invitesTitle')}>
        <p className="xidig-field__hint">{t('settings.invitesIntro')}</p>
        {inviteList.length === 0 ? (
          <p>{t('settings.invitesEmpty')}</p>
        ) : (
          <ul className="xidig-invite-list">
            {inviteList.map((invite) => (
              <li key={invite.id} className="xidig-invite-list__item">
                <span>{invite.code}</span>
                {invite.redeemed_at ? (
                  <span className="xidig-tag xidig-tag--ok">{t('settings.inviteUsed')}</span>
                ) : (
                  <span className="xidig-tag">{t('settings.inviteOpen')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={() =>
            void run(async () => {
              const data = await apiPost<{ invite: Invite }>('/api/invites');
              setInviteList((current) => [data.invite, ...current]);
            })
          }
        >
          {t('action.createInvite')}
        </button>
      </Section>

      <Section title={t('settings.sessionsTitle')}>
        <p className="xidig-field__hint">{t('settings.sessionsIntro')}</p>
        <div className="xidig-profile__actions">
          <button
            type="button"
            className="xidig-button xidig-button--primary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await apiPost('/api/auth/signout');
                router.push('/signin');
                router.refresh();
              })
            }
          >
            {t('action.signOut')}
          </button>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                // Global scope revokes EVERY refresh token (all devices), then
                // the local signout clears this browser's session cookies.
                await createClient().auth.signOut({ scope: 'global' });
                await apiPost('/api/auth/signout');
                router.push('/signin');
                router.refresh();
              })
            }
          >
            {t('settings.signOutEverywhere')}
          </button>
        </div>
      </Section>

      {/* §19 account lifecycle — no self-service deactivate/delete API yet;
          the section anchors the Settings → Data link and routes to support. */}
      <Section title={t('settings.accountStatusTitle')}>
        <div id="account-status">
          <p className="xidig-field__hint">{t('settings.accountStatusHelp')}</p>
        </div>
      </Section>
    </>
  );
}
