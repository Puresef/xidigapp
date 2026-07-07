'use client';

import Link from 'next/link';

import { useT } from '@xidig/i18n/react';

import type { CandidateListItem } from '@/lib/capital/views';

import { StatusBadge } from './status-badge';

/**
 * Capital index summary card for a Candidate (§17). Name, one-liner, owning Lab
 * link, and a status chip. Deliberately NO invest language and NO ask/amount —
 * the card is a directory entry, financial actions live only on the permalink
 * behind the region gate.
 */
export function CandidateCard({ item }: { item: CandidateListItem }) {
  const t = useT();
  const { candidate, lab } = item;

  return (
    <article className="xidig-card xidig-capital-card">
      <div className="xidig-card__header">
        <h3 className="xidig-card__title">
          <Link href={`/c/${candidate.id}`}>{candidate.name}</Link>
        </h3>
        <StatusBadge status={candidate.status} />
      </div>

      {candidate.one_liner ? (
        <p className="xidig-card__body">{candidate.one_liner}</p>
      ) : null}

      {lab ? (
        <p className="xidig-card__meta">
          {t('capital.fromLab')}: <Link href={`/labs/${lab.slug}`}>{lab.name}</Link>
        </p>
      ) : null}
    </article>
  );
}
