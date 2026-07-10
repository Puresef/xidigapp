'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { ConsentFlags } from '@/lib/consent/model';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Consent banner (§12) — signed-in members without a current-version choice.
 * The three entry actions (Accept / Reject / Manage) are equally prominent by
 * design: declining must be exactly as easy as accepting (UK GDPR). Manage
 * expands inline checkboxes for the two optional categories.
 *
 * A non-modal region: no focus trap, the app stays fully usable behind it.
 * The server records the choice AND sets the xidig_consent cookie in the API
 * response — this component only hides itself afterwards (local state), so a
 * failed save leaves the banner up with the error visible.
 */
export function ConsentBanner({ needsPrompt }: { needsPrompt: boolean }) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [manage, setManage] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [errorMonitoring, setErrorMonitoring] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (!needsPrompt || dismissed) return null;

  async function save(choice: ConsentFlags) {
    setPending(true);
    setError(null);
    try {
      await apiPost('/api/me/consent', { ...choice, method: 'banner' });
      setDismissed(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.plain : { code: 'server_error', message: '' },
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="xidig-consent" role="region" aria-label={t('consent.regionAria')}>
      <p className="xidig-consent__title">{t('consent.bannerTitle')}</p>
      <p className="xidig-consent__body">
        {t('consent.bannerBody')}{' '}
        <Link href="/privacy" className="xidig-consent__link">
          {t('consent.privacyLink')}
        </Link>
      </p>
      {error ? <PlainErrorBanner error={error} /> : null}
      {manage ? (
        <div className="xidig-consent__options">
          <label className="xidig-checkbox">
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
            />
            <span>
              {t('consent.analyticsLabel')}
              <span className="xidig-consent__hint">{t('consent.analyticsHint')}</span>
            </span>
          </label>
          <label className="xidig-checkbox">
            <input
              type="checkbox"
              checked={errorMonitoring}
              onChange={(e) => setErrorMonitoring(e.target.checked)}
            />
            <span>
              {t('consent.errorMonitoringLabel')}
              <span className="xidig-consent__hint">{t('consent.errorMonitoringHint')}</span>
            </span>
          </label>
        </div>
      ) : null}
      <div className="xidig-consent__actions">
        {manage ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void save({ analytics, errorMonitoring })}
          >
            {t('consent.save')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={() => void save({ analytics: true, errorMonitoring: true })}
            >
              {t('consent.acceptAll')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={() => void save({ analytics: false, errorMonitoring: false })}
            >
              {t('consent.rejectAll')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={pending}
              onClick={() => setManage(true)}
            >
              {t('consent.manage')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
