'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost, ApiRequestError } from '@/lib/api-client';
import type { ConsentFlags } from '@/lib/consent/model';
import type { PlainError } from '@/lib/errors';
import { applyLiteBundle } from '@/lib/lite/apply';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Consent banner (§12) — signed-in members without a current-version choice.
 * The three entry actions (Accept / Reject / Manage) are equally prominent by
 * design: declining must be exactly as easy as accepting (UK GDPR). Manage
 * expands inline checkboxes for the two optional categories.
 *
 * A non-modal region: no focus trap, no scrim, the app stays fully usable
 * behind it — which is also why it does NOT steal focus on mount (it renders
 * on every page load until answered; yanking the keyboard/AT cursor there
 * each time would be disorienting and contradict the non-modal contract).
 * Discovery for AT users comes from the labelled region landmark, the <h2>
 * in the headings list, and aria-live="polite" (announces when the banner
 * enters the DOM after hydration; SSR-painted instances rely on the
 * landmark + heading). Scroll clearance while mounted is CSS-side:
 * globals.css `body:has(.xidig-consent)` reserves bottom padding so the
 * fixed banner never covers the last card's action bar.
 *
 * The Lite row (11 Jul full-default/Lite-opt-in directive) is deliberately a
 * compact SECONDARY row, not a fourth action button — consent parity stays
 * three-way. It applies the `essentials` bundle through the shared write
 * path (lib/lite/apply: cookies first — the rendering source of truth — then
 * awaited best-effort mirrors) and reloads so the whole page re-renders lite.
 *
 * The server records the consent choice AND sets the xidig_consent cookie in
 * the API response — this component only hides itself afterwards (local
 * state), so a failed save leaves the banner up with the error visible.
 */
export function ConsentBanner({
  needsPrompt,
  /** Test seam: jsdom's location.reload is unforgeable (non-configurable). */
  reloadPage = () => window.location.reload(),
}: {
  needsPrompt: boolean;
  reloadPage?: () => void;
}) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [manage, setManage] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [errorMonitoring, setErrorMonitoring] = useState(false);
  const [pending, setPending] = useState(false);
  const [litePending, setLitePending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (!needsPrompt || dismissed) return null;

  const busy = pending || litePending;

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

  async function enableLite() {
    setLitePending(true);
    // Cookies flip synchronously inside the shared path BEFORE the awaited
    // mirrors — the reload below therefore always renders Lite even if a
    // mirror errors (the promise never rejects). Awaiting keeps the reload
    // from cancelling the in-flight PATCHes. No pending reset: the page
    // navigates away (the seam only stays mocked-in under test).
    await applyLiteBundle('essentials', true);
    reloadPage();
  }

  return (
    <section
      className="xidig-consent"
      role="region"
      aria-label={t('consent.regionAria')}
      aria-live="polite"
    >
      <h2 className="xidig-consent__title">{t('consent.bannerTitle')}</h2>
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
            disabled={busy}
            onClick={() => void save({ analytics, errorMonitoring })}
          >
            {t('consent.save')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy}
              onClick={() => void save({ analytics: true, errorMonitoring: true })}
            >
              {t('consent.acceptAll')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy}
              onClick={() => void save({ analytics: false, errorMonitoring: false })}
            >
              {t('consent.rejectAll')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy}
              onClick={() => setManage(true)}
            >
              {t('consent.manage')}
            </button>
          </>
        )}
      </div>
      <div className="xidig-consent__lite">
        <p className="xidig-consent__lite-text">
          {t('consent.liteLabel')}
          <span className="xidig-consent__hint">{t('consent.liteHint')}</span>
        </p>
        <button
          type="button"
          className="xidig-consent__lite-btn"
          disabled={busy}
          onClick={() => void enableLite()}
        >
          {litePending ? t('state.loading') : t('consent.liteCta')}
        </button>
      </div>
    </section>
  );
}
