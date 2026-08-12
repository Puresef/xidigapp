'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost } from '@/lib/api-client';
import { toast } from '@/lib/toast';

/**
 * Aqbal / Diid on one membership application (frame 7b, applications rail).
 *
 * Both verbs go through the SAME `POST /api/labs/[id]/members` the Space
 * directory and settings already use (`action: 'respond'`) — a venture must not
 * grow a second, drifting membership write path just because its rail looks
 * different.
 *
 * The answer is a refresh, not a local "accepted" label: the rail IS the
 * pending queue, and after a decision the person belongs somewhere else on the
 * page — in the members rail if they were accepted, nowhere if they were not.
 * A row that stayed behind wearing its own outcome would be a second, stale
 * copy of a membership state the server already moved.
 */
export function MaalApplicationActions({ labId, userId }: { labId: string; userId: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function respond(decision: 'accept' | 'decline') {
    setBusy(true);
    apiPost(`/api/labs/${labId}/members`, { action: 'respond', userId, decision })
      .then(() => router.refresh())
      .catch(() => toast('state.errorTitle'))
      .finally(() => setBusy(false));
  }

  return (
    <span className="xidig-venture__application-actions">
      <button
        type="button"
        className="xidig-button xidig-button--primary"
        disabled={busy}
        onClick={() => respond('accept')}
      >
        {t('action.accept')}
      </button>
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={busy}
        onClick={() => respond('decline')}
      >
        {t('action.decline')}
      </button>
    </span>
  );
}
