import { useT } from '@xidig/i18n/react';

import type { RubricAggregate, ReviewRow } from '@/lib/capital/views';

/**
 * Rubric summary + reviewer notes (§17). The three denormalized aggregate
 * scores (team / traction / feasibility) plus the reviewer note list — visible
 * wherever the candidate is readable (RLS keeps reviewers-only candidates out of
 * reach entirely, so a plain render here is safe). Scores render as `x.x / 5`.
 */

function scoreText(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)} / 5`;
}

export function RubricDisplay({
  rubric,
  reviews,
}: {
  rubric: RubricAggregate;
  reviews: ReviewRow[];
}) {
  const t = useT();
  const hasScores =
    rubric.team !== null || rubric.traction !== null || rubric.feasibility !== null;

  return (
    <section className="xidig-section xidig-capital-rubric">
      <h2 className="xidig-section__title">{t('capital.rubricHeading')}</h2>
      {hasScores ? (
        <dl className="xidig-capital-rubric__grid">
          <div>
            <dt className="xidig-card__meta">{t('capital.rubricTeam')}</dt>
            <dd className="xidig-card__body">{scoreText(rubric.team)}</dd>
          </div>
          <div>
            <dt className="xidig-card__meta">{t('capital.rubricTraction')}</dt>
            <dd className="xidig-card__body">{scoreText(rubric.traction)}</dd>
          </div>
          <div>
            <dt className="xidig-card__meta">{t('capital.rubricFeasibility')}</dt>
            <dd className="xidig-card__body">{scoreText(rubric.feasibility)}</dd>
          </div>
          <div>
            <dt className="xidig-card__meta">{t('capital.rubricOverall')}</dt>
            <dd className="xidig-card__body">
              <strong>{scoreText(rubric.overall)}</strong>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="xidig-card__meta">{t('capital.rubricNoScores')}</p>
      )}

      {reviews.length > 0 ? (
        <ul className="xidig-post-list">
          {reviews
            .filter((r) => r.notes && r.notes.trim() !== '')
            .map((r) => (
              <li key={r.id} className="xidig-card">
                <p className="xidig-card__meta">{r.reviewer?.display_name ?? ''}</p>
                <p className="xidig-card__body">{r.notes}</p>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}
