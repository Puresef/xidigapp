'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiDelete, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { MuteItem } from '@/lib/social/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { LoadingFlap } from '@/components/loading-flap';

/**
 * The caller's mute list (Phase 4.5) — self-contained management UI embedded
 * by Settings → Privacy. Fetches /api/me/mutes on mount and offers one-tap
 * unmute per row. Mutes are private and viewer-side only, so unmuting is
 * always safe — nothing was ever sent to the muted party.
 */

const TYPE_KEYS: Record<MuteItem['entityType'], MessageKey> = {
  user: 'social.mutedTypeUser',
  tag: 'social.mutedTypeTag',
  lab: 'social.mutedTypeLab',
};

export function MutedList() {
  const t = useT();
  const [items, setItems] = useState<MuteItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<PlainError | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ items: MuteItem[] }>('/api/me/mutes')
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function unmute(item: MuteItem) {
    const key = `${item.entityType}:${item.entityId}`;
    setPendingId(key);
    setError(null);
    apiDelete(`/api/mutes/${item.entityType}/${item.entityId}`)
      .then(() => {
        setItems((current) =>
          current.filter(
            (row) => !(row.entityType === item.entityType && row.entityId === item.entityId),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      })
      .finally(() => setPendingId(null));
  }

  return (
    <section aria-label={t('social.mutedListTitle')}>
      {error ? <PlainErrorBanner error={error} /> : null}
      {!loaded ? <LoadingFlap /> : null}
      {loaded && items.length === 0 && !error ? (
        <p className="xidig-card__meta">{t('social.mutedEmpty')}</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="xidig-card-grid">
          {items.map((item) => {
            const key = `${item.entityType}:${item.entityId}`;
            const display = item.entityType === 'tag' ? `#${item.label}` : item.label;
            return (
              <li key={key} className="xidig-card">
                <div className="xidig-card__top">
                  <p className="xidig-card__body">
                    <span className="xidig-tag">{t(TYPE_KEYS[item.entityType])}</span>{' '}
                    {item.entityType === 'user' && item.handle ? (
                      <Link href={`/u/${item.handle}`}>{display}</Link>
                    ) : item.entityType === 'lab' && item.slug ? (
                      <Link href={`/labs/${item.slug}`}>{display}</Link>
                    ) : (
                      display
                    )}
                  </p>
                  <button
                    type="button"
                    className="xidig-button xidig-button--secondary"
                    disabled={pendingId === key}
                    aria-label={t('social.unmuteLabel', { name: display })}
                    onClick={() => unmute(item)}
                  >
                    {t('social.unmute')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
