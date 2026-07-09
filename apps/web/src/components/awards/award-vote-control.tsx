'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * One reusable per-category vote control (§20). The page owns picking which
 * bounded, RLS-visible option list is appropriate for each category (Labs the
 * member can see / recent Wins / members they follow) and passes it in — this
 * component just lets the member choose one target, POSTs it to /api/awards, and
 * refreshes the server component so the recorded vote is reflected.
 *
 * A vote is final for the quarter (one per category — the DB unique constraint
 * enforces it, the API maps the duplicate to already_voted). Once a vote exists
 * this renders as a read-only "your vote" line instead of the picker.
 */

type AwardCategory = Enums<'award_category'>;
type TargetType = 'lab' | 'post' | 'user';

export interface VoteTargetOption {
  targetType: TargetType;
  targetId: string;
  label: string;
}

export function AwardVoteControl({
  category,
  options,
  currentVoteLabel,
}: {
  category: AwardCategory;
  options: VoteTargetOption[];
  /** The label of the option the member already voted for, if any. */
  currentVoteLabel: string | null;
}) {
  const translate = useT();
  // awards.* keys are registered in the dictionaries centrally by the parent
  // (returned in i18n_keys); cast until they land — the app's existing pattern
  // for keys pending registration (see components/profile/open-to.ts).
  const t = (key: string): string => translate(key as MessageKey);
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  if (currentVoteLabel !== null) {
    return (
      <p className="xidig-card__meta">
        {t('awards.yourVote')}: {currentVoteLabel}
      </p>
    );
  }

  if (options.length === 0) {
    return <p className="xidig-card__meta">{t('awards.noTargets')}</p>;
  }

  function cast() {
    if (pending || selected === '') return;
    const option = options.find((o) => o.targetId === selected);
    if (!option) return;
    void (async () => {
      setPending(true);
      setError(null);
      try {
        await apiPost('/api/awards', {
          category,
          targetType: option.targetType,
          targetId: option.targetId,
        });
        router.refresh();
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="xidig-awards-vote">
      {error ? <PlainErrorBanner error={error} /> : null}
      <label className="xidig-field">
        <span className="xidig-field__label">{t('awards.pickTargetLabel')}</span>
        <select
          className="xidig-field__input"
          value={selected}
          disabled={pending}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{t('awards.pickTargetPlaceholder')}</option>
          {options.map((option) => (
            <option key={option.targetId} value={option.targetId}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="xidig-button xidig-button--primary"
        disabled={pending || selected === ''}
        onClick={cast}
      >
        {t('awards.castVote')}
      </button>
    </div>
  );
}
