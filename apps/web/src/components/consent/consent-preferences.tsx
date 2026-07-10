'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { ConsentFlags } from '@/lib/consent/model';
import type { PlainError } from '@/lib/errors';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Settings › Data — the always-available home of the consent choices the
 * banner captures (§12: consent must be as easy to withdraw as to give).
 * Same API as the banner, method 'settings'; the server re-stamps the
 * xidig_consent cookie on every save.
 */
export function ConsentPreferences({
  initialAnalytics,
  initialErrorMonitoring,
}: {
  initialAnalytics: boolean;
  initialErrorMonitoring: boolean;
}) {
  const t = useT();
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [errorMonitoring, setErrorMonitoring] = useState(initialErrorMonitoring);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  async function save() {
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const choice: ConsentFlags = { analytics, errorMonitoring };
      await apiPost('/api/me/consent', { ...choice, method: 'settings' });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.plain : { code: 'server_error', message: '' });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="xidig-section">
      <h2 className="xidig-section__title">{t('consent.settingsTitle')}</h2>
      <p className="xidig-field__hint">
        {t('consent.settingsIntro')}{' '}
        <Link href="/privacy" className="xidig-consent__link">
          {t('consent.privacyLink')}
        </Link>
      </p>
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('consent.saved')}</Banner> : null}
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
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={pending}
        onClick={() => void save()}
      >
        {pending ? t('state.loading') : t('consent.save')}
      </button>
    </section>
  );
}
