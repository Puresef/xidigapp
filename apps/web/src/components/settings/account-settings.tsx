'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch, apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { DELETION_GRACE_DAYS } from '@/lib/moderation/constants';
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
  /** §19 lifecycle: the account status + deletion clock for the grace countdown. */
  status: string;
  deletionRequestedAt: string | null;
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
  const [status, setStatus] = useState(snapshot.status);
  const [deletionRequestedAt, setDeletionRequestedAt] = useState(snapshot.deletionRequestedAt);
  const [verifyConsent, setVerifyConsent] = useState(false);
  const [verifyRequested, setVerifyRequested] = useState(false);

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

  // §19 data-rights export — mirrors the Data settings download flow. The
  // response is a file (not the JSON envelope), so it is fetched directly and
  // streamed to a download rather than through the api-client helpers.
  async function onExport() {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/me/export', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: PlainError };
        setError(body.error ?? { code: 'server_error', message: '' });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = match?.[1] ?? 'xidig-export.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(t('settings.exportDone'));
    } catch {
      setError({ code: 'server_error', message: '' });
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

      {/* §19 self-service account lifecycle (Phase 6). Destructive actions
          confirm first; the pending-deletion grace countdown is shown live. */}
      <Section title={t('settings.accountStatusSectionTitle')}>
        <div id="account-status">
          <p className="xidig-field__hint">{t('settings.accountStatusHelp')}</p>

          {status === 'pending_deletion' ? (
            <Banner kind="notice">
              {t('settings.deletionPending', { days: graceDaysLeft(deletionRequestedAt) })}
            </Banner>
          ) : null}

          <div className="xidig-profile__actions">
            {status !== 'pending_deletion' ? (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm(t('settings.deactivateConfirm'))) return;
                    const data = await apiPost<{ message: string }>('/api/me/account', {
                      action: 'deactivate',
                    });
                    setStatus('deactivated');
                    setNotice(data.message);
                  })
                }
              >
                {t('settings.deactivateButton')}
              </button>
            ) : null}

            {status === 'pending_deletion' ? (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const data = await apiPost<{ message: string }>('/api/me/account', {
                      action: 'cancel_deletion',
                    });
                    setStatus('active');
                    setDeletionRequestedAt(null);
                    setNotice(data.message);
                  })
                }
              >
                {t('settings.cancelDeletionButton')}
              </button>
            ) : (
              <button
                type="button"
                className="xidig-button xidig-button--secondary"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm(t('settings.requestDeletionConfirm'))) return;
                    const data = await apiPost<{ message: string }>('/api/me/account', {
                      action: 'request_deletion',
                    });
                    setStatus('pending_deletion');
                    setDeletionRequestedAt(new Date().toISOString());
                    setNotice(data.message);
                  })
                }
              >
                {t('settings.requestDeletionButton')}
              </button>
            )}

            {/* §19 data rights — reuse the export endpoint the Data settings use. */}
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={() => void onExport()}
            >
              {t('settings.exportButton')}
            </button>
          </div>
        </div>
      </Section>

      {/* §14 member verification request — consent-gated. */}
      <Section title={t('settings.verifyTitle')}>
        <p className="xidig-field__hint">{t('settings.verifyBody')}</p>
        {verifyRequested ? null : (
          <>
            <label className="xidig-checkbox">
              <input
                type="checkbox"
                checked={verifyConsent}
                onChange={(e) => setVerifyConsent(e.target.checked)}
              />
              <span>{t('settings.verifyConsentLabel')}</span>
            </label>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending || !verifyConsent}
              onClick={() =>
                void run(async () => {
                  const data = await apiPost<{ message: string }>('/api/me/verification', {
                    type: 'identity',
                    consentGiven: true,
                  });
                  setVerifyRequested(true);
                  setNotice(data.message);
                })
              }
            >
              {t('settings.verifyRequestButton')}
            </button>
          </>
        )}
      </Section>
    </>
  );
}

/** Whole days remaining in the §19 30-day deletion grace (never negative). */
function graceDaysLeft(deletionRequestedAt: string | null): number {
  if (!deletionRequestedAt) return DELETION_GRACE_DAYS;
  const elapsedDays = (Date.now() - new Date(deletionRequestedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(DELETION_GRACE_DAYS - elapsedDays));
}
