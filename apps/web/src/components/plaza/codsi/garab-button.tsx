'use client';

import { useId, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { XidigIcon } from '@/components/icons/XidigIcon';
import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { createReceiptGuard, gatesOpen, motionFor } from '@/lib/motion-policy';

import { PlainErrorBanner } from '../../auth/plain-error';

/**
 * Support (legacy internal name Garab) on a resolved Codsi (D3 dabqaad — never
 * a like/heart).
 * Exists ONLY post-fulfilled (the RLS with-check is the law; this component is
 * the UI half). Lit state stays Somali Blue per D3 — no bronze, no orange.
 *
 * Support is a non-financial encouragement signal and unlocks nothing:
 * the count is visible to every viewer before, during and after taking part
 * (PRD Relook G1 — support counts are visible), and removing your own support
 * updates the number but never hides it. The note under the button says what
 * support is NOT (investment, vote, rating, check of the work) before the
 * first tap.
 *
 * States: "Support" (aria-pressed=false) → "Supporting" (aria-pressed=
 * true, described by "Remove support" — pressing again takes it back).
 *
 * Motion: `garab_given` is a 260 ms FLAP, not a celebration — the G3 locked
 * table reserves celebrate for once-ever moments. The receipt goes through a
 * shared 1.2 s frequency guard so a member supporting down a thread, or a
 * retry after a failed call, collapses into one beat instead of a stutter.
 */
/** Module-scoped on purpose: the guard is per-viewer, not per-button, so
 *  supporting several posts in a row still reads as one beat. */
const receiptGuard = createReceiptGuard(1200);

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
  const removeHintId = useId();
  const [count, setCount] = useState(initialCount);
  const [mine, setMine] = useState(initialMine);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState(0);
  const [error, setError] = useState<PlainError | null>(null);

  if (!fulfilled) return null;

  function toggle() {
    if (pending) return;
    const active = mine;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        // API contract keeps its identifiers (route /cosign, field `cosigned`).
        const res = active
          ? await apiDelete<{ cosigned: boolean; count: number }>(`/api/posts/${postId}/cosign`)
          : await apiPut<{ cosigned: boolean; count: number }>(`/api/posts/${postId}/cosign`);
        setMine(res.cosigned);
        setCount(res.count);
        if (!active && motionFor('garab_given', 'madal') && gatesOpen() && receiptGuard()) {
          setReceipt((n) => n + 1);
        }
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
      <p className="xidig-codsi-garab__count">{t('action.garabCount', { count })}</p>
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-codsi-garab__button"
        aria-pressed={mine}
        aria-describedby={mine ? removeHintId : undefined}
        disabled={pending}
        onClick={toggle}
      >
        {/* Outline = unlit; supporting = lit (filled) with the smoke wisps
            (CSS double-gated). Decorative — the label carries the meaning. */}
        <XidigIcon
          name="garab"
          variant={mine ? 'filled' : 'outline'}
          size={18}
          tone="inherit"
          animateSmoke={mine}
          className="x-ic--lead"
        />
        {mine ? t('action.garabActive') : t('action.garab')}
        {receipt > 0 ? (
          <AnimatedMark
            key={receipt}
            mode="flap"
            surface="madal"
            size={18}
            className="xidig-celebrate-inline"
          />
        ) : null}
      </button>
      {mine ? (
        <span id={removeHintId} className="xidig-visually-hidden">
          {t('action.garabRemove')}
        </span>
      ) : null}
      <p className="xidig-codsi-garab__note">{t('action.garabNote')}</p>
      {error ? <PlainErrorBanner error={error} /> : null}
    </div>
  );
}
