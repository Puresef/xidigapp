'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPut } from '@/lib/api-client';
import { REVIEW_NOTES_MAX, RUBRIC_SCORE_MAX, RUBRIC_SCORE_MIN } from '@/lib/capital/constants';
import type { ReviewRow } from '@/lib/capital/views';
import type { PlainError } from '@/lib/errors';

import { PlainErrorBanner } from '../auth/plain-error';
import { Banner } from '../banner';

/**
 * Reviewer rubric form (§17). Reviewer eligibility = mod/admin AND not a member
 * of the candidate's Lab (recusal). The API re-checks and returns
 * `reviewer_conflict` on a recused reviewer — the parent hides this form and
 * shows that notice instead, but we also render the API's error verbatim if a
 * conflict slips through. PUT upserts the caller's review; the server recomputes
 * the denormalized aggregate scores.
 */

const SCORES = Array.from(
  { length: RUBRIC_SCORE_MAX - RUBRIC_SCORE_MIN + 1 },
  (_, i) => RUBRIC_SCORE_MIN + i,
);

interface ReviewResponse {
  review: ReviewRow;
}

function ScoreSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | '') => void;
}) {
  return (
    <div className="xidig-field">
      <label className="xidig-field__label">{label}</label>
      <select
        className="xidig-field__input"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      >
        <option value="">—</option>
        {SCORES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReviewForm({
  candidateId,
  initial,
}: {
  candidateId: string;
  initial?: Pick<ReviewRow, 'team_score' | 'traction_score' | 'feasibility_score' | 'notes'> | null;
}) {
  const t = useT();
  const [team, setTeam] = useState<number | ''>(initial?.team_score ?? '');
  const [traction, setTraction] = useState<number | ''>(initial?.traction_score ?? '');
  const [feasibility, setFeasibility] = useState<number | ''>(initial?.feasibility_score ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function submit() {
    if (pending) return;
    const body: Record<string, unknown> = {};
    if (team !== '') body.teamScore = team;
    if (traction !== '') body.tractionScore = traction;
    if (feasibility !== '') body.feasibilityScore = feasibility;
    if (notes.trim() !== '') body.notes = notes.trim();
    if (Object.keys(body).length === 0) return;

    void (async () => {
      setPending(true);
      setError(null);
      setSaved(false);
      try {
        // Phase 7: analytics (candidate_reviewed)
        await apiPut<ReviewResponse>(`/api/candidates/${candidateId}/reviews`, body);
        setSaved(true);
      } catch (cause) {
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else setError({ code: 'server_error', message: '' });
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <section className="xidig-section xidig-capital-review">
      <h2 className="xidig-section__title">{t('capital.reviewHeading')}</h2>
      {error ? <PlainErrorBanner error={error} /> : null}
      {saved ? <Banner kind="notice">{t('capital.reviewSaved')}</Banner> : null}

      <div className="xidig-capital-review__scores">
        <ScoreSelect label={t('capital.rubricTeam')} value={team} onChange={setTeam} />
        <ScoreSelect label={t('capital.rubricTraction')} value={traction} onChange={setTraction} />
        <ScoreSelect
          label={t('capital.rubricFeasibility')}
          value={feasibility}
          onChange={setFeasibility}
        />
      </div>

      <div className="xidig-field">
        <label className="xidig-field__label">{t('capital.reviewNotesLabel')}</label>
        <textarea
          className="xidig-field__input"
          rows={4}
          maxLength={REVIEW_NOTES_MAX}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="xidig-button xidig-button--primary"
        disabled={pending}
        onClick={submit}
      >
        {t('capital.reviewSubmit')}
      </button>
    </section>
  );
}
