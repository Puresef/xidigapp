import type { Enums } from '@xidig/db';
import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

/**
 * Candidate status chip (§17). Server components can't call the `useT` hook, so
 * a parallel server-safe map (STATUS_KEYS + statusVariant) is exported for RSC
 * callers; the client component below is the hook-based convenience.
 */

type CandidateStatus = Enums<'candidate_status'>;

export const STATUS_KEYS: Record<CandidateStatus, MessageKey> = {
  draft: 'capital.statusDraft',
  submitted: 'capital.statusSubmitted',
  in_review: 'capital.statusInReview',
  approved: 'capital.statusApproved',
  parked: 'capital.statusParked',
  declined: 'capital.statusDeclined',
};

/** Maps a status to a badge tone class suffix (reuses xidig-tag tones). */
export function statusVariant(status: CandidateStatus): 'ok' | 'warn' | 'muted' | 'neutral' {
  switch (status) {
    case 'approved':
      return 'ok';
    case 'declined':
    case 'parked':
      return 'warn';
    case 'draft':
      return 'muted';
    default:
      return 'neutral';
  }
}

export function StatusBadge({ status }: { status: CandidateStatus }) {
  const t = useT();
  const variant = statusVariant(status);
  const cls = variant === 'neutral' ? 'xidig-tag' : `xidig-tag xidig-tag--${variant}`;
  return <span className={cls}>{t(STATUS_KEYS[status])}</span>;
}
