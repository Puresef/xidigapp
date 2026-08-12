'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { apiPost } from '@/lib/api-client';
import type { VentureJoinAction } from '@/lib/maal/views';
import { toast } from '@/lib/toast';

/**
 * The per-row verb on the Maal index (frame 7a).
 *
 * The four verbs are deliberately NOT one verb, and the inconsistency is the
 * point (E3 documented it so nobody "fixes" it): each one names what actually
 * happens when you press it.
 *
 *   Fur     — you are already a member; this opens the space you are in.
 *   Codso   — the space takes requests; this sends one, and the leads decide.
 *   Ku biir — the door is open; this joins you, now.
 *   Fiiri   — you can look. Either it is invite-only, or you already asked and
 *             asking twice is not an affordance.
 *
 * Fur and Fiiri are links because they navigate. Codso and Ku biir are buttons
 * because they write — the same `POST /api/labs/[id]/members` the Space
 * directory card uses, so the index can never drift from a second join path.
 * After the write the row states the NEW truth rather than staying hopeful: a
 * completed join becomes Fur, a sent request becomes the pending verb, and
 * both are honest about what the member is now looking at.
 */

/** The row's verb plus the one state a press can land it in. */
type RowState = VentureJoinAction | 'pending';

const LINK_LABEL: Record<'open' | 'view', MessageKey> = {
  open: 'maal.actionOpen',
  view: 'lab.actionView',
};

export function MaalIndexAction({
  labId,
  slug,
  action,
}: {
  labId: string;
  slug: string;
  action: VentureJoinAction;
}) {
  const t = useT();
  const [state, setState] = useState<RowState>(action);
  const [busy, setBusy] = useState(false);

  if (state === 'pending') {
    return (
      <button type="button" className="xidig-button xidig-button--secondary" disabled>
        {t('lab.actionRequested')}
      </button>
    );
  }

  if (state === 'join' || state === 'request') {
    const open = state === 'join';
    return (
      <button
        type="button"
        className={`xidig-button ${open ? 'xidig-button--secondary' : 'xidig-button--primary'}`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          apiPost(`/api/labs/${labId}/members`, { action: 'join' })
            .then(() => {
              setState(open ? 'open' : 'pending');
              toast(open ? 'lab.joinedToast' : 'lab.noticeJoinRequested');
            })
            .catch(() => toast('state.errorTitle'))
            .finally(() => setBusy(false));
        }}
      >
        {open ? t('lab.actionJoin') : t('maal.actionRequest')}
      </button>
    );
  }

  return (
    <Link href={`/labs/${slug}`} className="xidig-button xidig-button--secondary">
      {t(LINK_LABEL[state])}
    </Link>
  );
}
