'use client';

import { useCallback, useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiGet } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import type { LitePrefs } from '@/lib/lite/prefs';
import type { LabView } from '@/lib/labs/views';

import { PlainErrorBanner } from '../auth/plain-error';
import { LabCard } from './lab-card';

/**
 * Labs Discover list. Explicit "load more" (no infinite scroll) for
 * low-bandwidth (§22). `mode` filters Clubs vs Labs; `mine` scopes to the
 * caller's Spaces. Teaching empty state when nothing matches.
 */

interface FeedPage {
  items: LabView[];
  nextCursor: string | null;
}

export function LabsFeed({
  mode,
  mine,
  prefs,
}: {
  mode?: 'club' | 'lab' | undefined;
  mine?: boolean | undefined;
  /** Viewer Lite prefs (§22) — passed to card icons (smallAvatars rule). */
  prefs?: LitePrefs | undefined;
}) {
  const t = useT();
  const [items, setItems] = useState<LabView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const load = useCallback(
    async (cursor: string | null) => {
      setPending(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (mode) params.set('mode', mode);
        if (mine) params.set('mine', '1');
        if (cursor) params.set('cursor', cursor);
        const qs = params.toString();
        const page = await apiGet<FeedPage>(qs ? `/api/labs?${qs}` : '/api/labs');
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
        setLoaded(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    },
    [mode, mine],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  if (!loaded && pending) {
    return <p className="xidig-card__meta">{t('state.loading')}</p>;
  }

  return (
    <section aria-label={t('lab.listTitle')}>
      {error ? <PlainErrorBanner error={error} /> : null}

      {loaded && items.length === 0 && !error ? (
        <div className="xidig-section">
          <p className="xidig-card__body">{t('lab.emptyList')}</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="xidig-post-list">
          {items.map((view) => (
            <li key={view.lab.id}>
              <LabCard view={view} prefs={prefs} />
            </li>
          ))}
        </ul>
      ) : null}

      {nextCursor ? (
        <p>
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void load(nextCursor)}
          >
            {t('action.loadMore')}
          </button>
        </p>
      ) : loaded && items.length > 0 ? (
        <p className="xidig-card__meta">{t('state.endOfList')}</p>
      ) : null}
    </section>
  );
}
