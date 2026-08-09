'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { XidigIcon } from '@/components/icons/XidigIcon';
import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../../auth/plain-error';

/**
 * Garab on a resolved Codsi (D3 dabqaad — never a like/heart). Exists ONLY
 * post-fulfilled (the RLS with-check is the law; this component is the UI
 * half). Lit state stays Somali Blue per D3 — no bronze, no orange. The
 * count renders only after the viewer takes part ("Tiradu waxay muuqataa oo
 * keliya markaad ka qaybqaadato"), and activating earns the one-shot
 * ceremony (sanctioned warm moment, mascot rules).
 */
export function GarabButton({
  postId,
  fulfilled,
  initialCount,
  initialMine,
}: {
  postId: string;
  fulfilled: boolean;
  initialCount: number;
  initialMine: boolean;
}) {
  const t = useT();
  const [count, setCount] = useState(initialCount);
  const [mine, setMine] = useState(initialMine);
  const [pending, setPending] = useState(false);
  const [celebrated, setCelebrated] = useState(0);
  const [error, setError] = useState<PlainError | null>(null);

  if (!fulfilled) return null;

  function toggle() {
    if (pending) return;
    const active = mine;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        const res = active
          ? await apiDelete<{ cosigned: boolean; count: number }>(`/api/posts/${postId}/cosign`)
          : await apiPut<{ cosigned: boolean; count: number }>(`/api/posts/${postId}/cosign`);
        setMine(res.cosigned);
        setCount(res.count);
        if (!active) setCelebrated((n) => n + 1);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="xidig-codsi-garab">
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-codsi-garab__button"
        aria-pressed={mine}
        disabled={pending}
        onClick={toggle}
      >
        {/* Outline = unlit; co-signed = lit (filled) with the smoke wisps
            (CSS double-gated). Decorative — the label carries the meaning. */}
        <XidigIcon
          name="garab"
          variant={mine ? 'filled' : 'outline'}
          size={18}
          tone="inherit"
          animateSmoke={mine}
          className="x-ic--lead"
        />
        {mine ? t('action.garabCount', { count }) : t('action.garab')}
        {celebrated > 0 ? (
          <AnimatedMark key={celebrated} mode="ceremony" size={18} className="xidig-celebrate-inline" />
        ) : null}
      </button>
      {mine ? <p className="xidig-codsi-garab__note">{t('plaza.garabHelperNote')}</p> : null}
      {error ? <PlainErrorBanner error={error} /> : null}
    </div>
  );
}
