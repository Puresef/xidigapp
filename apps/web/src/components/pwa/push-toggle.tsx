'use client';

import { useEffect, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import {
  currentPushState,
  disablePush,
  enablePush,
  pushConfiguredClient,
  pushSupported,
} from '@/lib/push/client';

/**
 * Push opt-in (§22 PWA push). Explains and degrades gracefully: unsupported
 * browsers, blocked permission, and an unconfigured server (no VAPID key) all
 * show plain-language state instead of a dead button — in-app notifications
 * keep working regardless.
 */

type State = 'loading' | 'unsupported' | 'unavailable' | 'off' | 'on' | 'denied';

export function PushToggle() {
  const t = useT();
  const [state, setState] = useState<State>('loading');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) return void (!cancelled && setState('unsupported'));
      if (!pushConfiguredClient()) return void (!cancelled && setState('unavailable'));
      const on = await currentPushState();
      if (!cancelled) setState(on ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    setPending(true);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        const result = await enablePush();
        setState(
          result === 'ok'
            ? 'on'
            : result === 'denied'
              ? 'denied'
              : result === 'unavailable'
                ? 'unavailable'
                : 'unsupported',
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (state === 'loading') return null;

  return (
    <section className="xidig-card xidig-push">
      <h2 className="xidig-card__title">{t('push.title')}</h2>
      <p className="xidig-card__body">{t('push.body')}</p>

      {state === 'unsupported' ? (
        <p className="xidig-card__meta">{t('push.unsupported')}</p>
      ) : state === 'unavailable' ? (
        <p className="xidig-card__meta">{t('push.unavailable')}</p>
      ) : state === 'denied' ? (
        <p className="xidig-card__meta">{t('push.denied')}</p>
      ) : (
        <>
          {state === 'on' ? <p className="xidig-card__meta">{t('push.enabled')}</p> : null}
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            disabled={pending}
            onClick={() => void toggle()}
          >
            {state === 'on' ? t('push.disable') : t('push.enable')}
          </button>
        </>
      )}
    </section>
  );
}
