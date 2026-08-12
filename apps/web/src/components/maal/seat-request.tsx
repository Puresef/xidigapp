'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost } from '@/lib/api-client';
import { toast } from '@/lib/toast';

/**
 * "Codso" on one open seat (frame 7e). The stranger's way in: you apply from
 * the workstream you actually want to work in, not from a generic join button
 * at the top of the page.
 *
 * It sends the SAME `POST /api/labs/[id]/members` join the directory card and
 * the Maal index send — one membership write path, never a second one — and it
 * carries `workstreamId` so the seat travels with the request: the `join`
 * variant of `memberActionSchema` accepts it, `joinLab` checks it belongs to
 * this venture, and it lands in `lab_members.requested_workstream_id`, which is
 * what the overview renders back to the leads ("… wuxuu codsanaya qaybta
 * Naqshadda"). The seat half of `maal.joinNote` is true end to end.
 */
export function MaalSeatRequest({ labId, workstreamId }: { labId: string; workstreamId: string }) {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    // Asking twice is not an affordance (the index row's rule, restated).
    return (
      <button type="button" className="xidig-button xidig-button--secondary" disabled>
        {t('lab.actionRequested')}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="xidig-button xidig-button--secondary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        apiPost(`/api/labs/${labId}/members`, { action: 'join', workstreamId })
          .then(() => {
            setSent(true);
            toast('lab.noticeJoinRequested');
          })
          .catch(() => toast('state.errorTitle'))
          .finally(() => setBusy(false));
      }}
    >
      {t('maal.actionRequest')}
    </button>
  );
}
