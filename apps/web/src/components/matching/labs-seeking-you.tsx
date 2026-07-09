import Link from 'next/link';

import { getT } from '@/lib/locale';
import type { LabMatch } from '@/lib/matching/looking-for';

/**
 * "Labs looking for your skills" (§20 looking-for matching). Surfaces on Home
 * once the member has skills that an open Lab need matches. Renders nothing when
 * there are no matches, so it appears only when it is useful. Each card names
 * the exact skills matched — transparent, never a black-box recommendation.
 */
export async function LabsSeekingYou({ matches }: { matches: LabMatch[] }) {
  if (matches.length === 0) return null;
  const t = await getT();

  return (
    <section className="xidig-section" aria-label={t('matching.labsSeekingTitle')}>
      <h2 className="xidig-section__title">{t('matching.labsSeekingTitle')}</h2>
      <p className="xidig-card__meta">{t('matching.labsSeekingBody')}</p>
      <ul className="xidig-card-list">
        {matches.map((match) => (
          <li key={match.labId} className="xidig-card">
            <div className="xidig-card__body">
              <Link href={`/labs/${match.slug}`} className="xidig-card__title">
                {match.name}
              </Link>
              {match.shortDescription ? (
                <p className="xidig-card__meta">{match.shortDescription}</p>
              ) : null}
              <p className="xidig-card__meta">
                {t('matching.matchedSkills')} {match.matchedSkills.join(', ')}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
