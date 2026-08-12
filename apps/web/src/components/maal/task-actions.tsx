'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPatch } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import { toast } from '@/lib/toast';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * The moves available on one board card (frame 7c).
 *
 * **Recusal is rendered as an absence.** On a task assigned to you, the
 * witness and approve controls are not disabled and not greyed — they are not
 * there. A disabled "Ansixi" on your own card advertises a power you do not
 * have and invites you to wonder why; nothing is a clearer statement than a
 * control that was never offered.
 *
 * The hidden control is the courtesy, not the rule. `PATCH .../tasks/[taskId]`
 * refuses the same move with `error.taskRecusal` (and a CHECK constraint sits
 * behind that), so a member who reaches the endpoint another way — a stale tab,
 * a replayed request, a script — gets the same answer in the same words. If
 * that refusal ever arrives, it is surfaced verbatim rather than swallowed:
 * being told the rule is the point of having one.
 *
 * Approving is additionally a lead act (`isLead`), which is why the two
 * witnessing steps are two steps: members co-sign, a lead approves, and a lead
 * approving their own work is exactly the thing both halves exist to prevent.
 */

type TaskStatus = 'open' | 'claimed' | 'submitted' | 'attested' | 'verified';

interface Move {
  to: TaskStatus;
  labelKey: MessageKey;
  primary: boolean;
}

/**
 * Legal moves for this viewer on this card. Mirrors TASK_TRANSITIONS and
 * RECUSED_TRANSITIONS (lib/maal/constants.ts) — the server stays authoritative,
 * this decides what to OFFER.
 */
function movesFor(status: TaskStatus, isOwn: boolean, isLead: boolean): Move[] {
  switch (status) {
    case 'open':
      return [{ to: 'claimed', labelKey: 'maal.taskClaim', primary: true }];
    case 'claimed':
      // A claim belongs to whoever made it. Submitting someone else's work
      // would carry it into attestation under their name, and releasing it
      // would take the card out from under them — so neither move is offered
      // to anyone else. The route refuses both as well; a move that would be
      // refused should never have been shown. A lead keeps the release, which
      // is the reassignment affordance.
      if (isOwn) {
        return [
          { to: 'submitted', labelKey: 'maal.taskSubmit', primary: true },
          // Nobody is trapped by having picked something up.
          { to: 'open', labelKey: 'maal.taskRelease', primary: false },
        ];
      }
      return isLead ? [{ to: 'open', labelKey: 'maal.taskRelease', primary: false }] : [];
    case 'submitted':
      return isOwn ? [] : [{ to: 'attested', labelKey: 'maal.taskAttest', primary: true }];
    case 'attested':
      return isOwn || !isLead
        ? []
        : [{ to: 'verified', labelKey: 'action.approve', primary: true }];
    default:
      return [];
  }
}

export function MaalTaskActions({
  labId,
  taskId,
  status,
  isOwn,
  isLead,
}: {
  labId: string;
  taskId: string;
  status: TaskStatus;
  isOwn: boolean;
  isLead: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  const moves = movesFor(status, isOwn, isLead);
  if (moves.length === 0 && error === null) return null;

  function move(to: TaskStatus) {
    setBusy(true);
    setError(null);
    apiPatch(`/api/labs/${labId}/tasks/${taskId}`, { status: to })
      .then(() => router.refresh())
      .catch((cause: unknown) => {
        // A recusal refusal states the rule — show it, never swallow it.
        if (cause instanceof ApiRequestError) setError(cause.plain);
        else toast('state.errorTitle');
      })
      .finally(() => setBusy(false));
  }

  return (
    <span className="xidig-task__actions">
      {error ? <PlainErrorBanner error={error} /> : null}
      {moves.map((item) => (
        <button
          key={item.to}
          type="button"
          className={`xidig-button ${item.primary ? 'xidig-button--primary' : 'xidig-button--secondary'}`}
          disabled={busy}
          onClick={() => move(item.to)}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </span>
  );
}
