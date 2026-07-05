'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch, apiPost, ApiRequestError } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Beta gating admin (§9): invite-only ⇄ open-waitlist toggle + the waitlist
 * queue with one-click invites. English-first by decision (admin.* is off
 * the launch floor).
 */

type SignupMode = 'invite_only' | 'waitlist';

export interface WaitlistEntry {
  id: string;
  email: string | null;
  phone: string | null;
  status: 'pending' | 'invited' | 'joined';
  created_at: string;
}

export function BetaSettings({
  initialMode,
  entries,
}: {
  initialMode: SignupMode;
  entries: WaitlistEntry[];
}) {
  const t = useT();
  const [mode, setMode] = useState<SignupMode>(initialMode);
  const [queue, setQueue] = useState(entries);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const modeOptions: Array<{ value: SignupMode; label: string }> = [
    { value: 'invite_only', label: t('admin.modeInviteOnly') },
    { value: 'waitlist', label: t('admin.modeWaitlist') },
  ];

  return (
    <>
      {error ? <PlainErrorBanner error={error} /> : null}
      {notice ? <Banner kind="notice">{notice}</Banner> : null}

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('admin.signupModeLabel')}</h2>
        {modeOptions.map((option) => (
          <label key={option.value} className="xidig-checkbox">
            <input
              type="radio"
              name="signup-mode"
              checked={mode === option.value}
              disabled={pending}
              onChange={() =>
                void run(async () => {
                  await apiPatch('/api/admin/settings', { signupMode: option.value });
                  setMode(option.value);
                  setNotice(t('admin.saved'));
                })
              }
            />
            <span>{option.label}</span>
          </label>
        ))}
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('admin.waitlistTitle')}</h2>
        {queue.length === 0 ? (
          <p>{t('admin.waitlistEmpty')}</p>
        ) : (
          <ul className="xidig-invite-list">
            {queue.map((entry) => (
              <li key={entry.id} className="xidig-invite-list__item">
                <span>{entry.email ?? entry.phone}</span>
                {entry.status === 'pending' ? (
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        const data = await apiPost<{ code: string }>(
                          '/api/admin/waitlist/invite',
                          { entryId: entry.id },
                        );
                        setQueue((current) =>
                          current.map((e) =>
                            e.id === entry.id ? { ...e, status: 'invited' as const } : e,
                          ),
                        );
                        setNotice(`${t('admin.saved')} ${data.code}`);
                      })
                    }
                  >
                    {t('action.sendInvite')}
                  </button>
                ) : (
                  <span className="xidig-tag xidig-tag--ok">
                    {entry.status === 'invited' ? t('admin.waitlistInvitedTag') : entry.status}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
