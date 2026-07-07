'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { trackClient } from '@/lib/analytics/client';
import { apiPatch } from '@/lib/api-client';
import { serializeLowBandwidthCookie } from '@/lib/bandwidth';
import type { PlainError } from '@/lib/errors';
import { MOTION_COOKIE, serializeAppearanceCookie } from '@/lib/settings/appearance';
import { formatBytes } from '@/lib/lite/estimates';
import {
  isLiteActive,
  LITE_BUNDLES,
  LITE_PREF_KEYS,
  matchLiteBundle,
  serializeLitePrefsCookie,
  type LiteBundleName,
  type LitePrefs,
} from '@/lib/lite/prefs';
import { getSavedThisWeek } from '@/lib/lite/savings';

import { Banner } from '../banner';
import { PlainErrorBanner } from '../auth/plain-error';

/**
 * Data & Lite mode (§22 — defer, don't disable). Granular per-category
 * switches + the three bundle shortcuts, the weekly savings meter, and the
 * data export. Every change flips the cookies immediately (rendering source
 * of truth, works signed-out), mirrors best-effort into
 * user_settings.preferences.lite, and refreshes so server pages re-render
 * with the new prefs on the next paint.
 */

const PREF_LABELS: Record<keyof LitePrefs, MessageKey> = {
  images: 'settings.liteImages',
  embeds: 'settings.liteEmbeds',
  maps: 'settings.liteMaps',
  animations: 'settings.liteAnimations',
  smallAvatars: 'settings.liteSmallAvatars',
};

const BUNDLE_LABELS: Record<LiteBundleName, MessageKey> = {
  text: 'settings.liteBundleText',
  essentials: 'settings.liteBundleEssentials',
  everything: 'settings.liteBundleEverything',
};

const BUNDLE_NAMES = Object.keys(LITE_BUNDLES) as LiteBundleName[];

export function DataSettings({ initialPrefs }: { initialPrefs: LitePrefs }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();

  const [prefs, setPrefs] = useState<LitePrefs>(initialPrefs);
  const [savedBytes, setSavedBytes] = useState<number | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  // localStorage is client-only — read after mount.
  useEffect(() => {
    setSavedBytes(getSavedThisWeek());
  }, []);

  function apply(next: LitePrefs) {
    setPrefs(next);
    document.cookie = serializeLitePrefsCookie(next);
    // The animations pref is the ONLY thing that drives the data-motion CSS
    // kill-switch (globals.css html[data-motion="off"]) — Lite state alone
    // never suppressed animations before this. animations:false → 'off'.
    document.cookie = serializeAppearanceCookie(MOTION_COOKIE, next.animations ? 'system' : 'off');
    // Legacy cookie + column stay in sync so pre-4.5 call sites keep working.
    const active = isLiteActive(next);
    document.cookie = serializeLowBandwidthCookie(active);
    trackClient('low_bandwidth_enabled', { enabled: active });
    void apiPatch('/api/me/bandwidth', { enabled: active }).catch(() => undefined);
    void apiPatch('/api/me/settings', {
      preferences: { lite: next, liteBundle: matchLiteBundle(next) },
    }).catch(() => undefined);
    router.refresh();
  }

  async function onExport() {
    setExportPending(true);
    setExportDone(false);
    setError(null);
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
      setExportDone(true);
    } catch {
      setError({ code: 'server_error', message: '' });
    } finally {
      setExportPending(false);
    }
  }

  const activeBundle = matchLiteBundle(prefs);

  return (
    <>
      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.liteTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.liteIntro')}</p>

        <div className="xidig-bundle-row" role="group" aria-label={t('settings.liteBundlesAria')}>
          {BUNDLE_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className="xidig-button xidig-button--secondary xidig-switch"
              aria-pressed={activeBundle === name}
              onClick={() => apply({ ...LITE_BUNDLES[name] })}
            >
              {t(BUNDLE_LABELS[name])}
            </button>
          ))}
        </div>

        {LITE_PREF_KEYS.map((key) => (
          <label key={key} className="xidig-checkbox">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => apply({ ...prefs, [key]: e.target.checked })}
            />
            <span>{t(PREF_LABELS[key])}</span>
          </label>
        ))}

        <p className="xidig-savings" aria-live="polite">
          {savedBytes !== null && savedBytes > 0
            ? t('settings.liteSaved', { amount: formatBytes(savedBytes, locale) })
            : t('settings.liteSavedNone')}
        </p>
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.exportTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.exportBody')}</p>
        {error ? <PlainErrorBanner error={error} /> : null}
        {exportDone ? <Banner kind="notice">{t('settings.exportDone')}</Banner> : null}
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={exportPending}
          onClick={() => void onExport()}
        >
          {exportPending ? t('state.loading') : t('settings.exportButton')}
        </button>
      </section>

      <section className="xidig-section">
        <h2 className="xidig-section__title">{t('settings.accountStatusTitle')}</h2>
        <p className="xidig-field__hint">{t('settings.accountStatusBody')}</p>
        <Link href="/settings/account#account-status" className="xidig-button xidig-button--secondary">
          {t('settings.accountStatusLink')}
        </Link>
      </section>
    </>
  );
}
