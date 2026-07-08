import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { APPEAL_SLA_HOURS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Appeals review queue (§19). Mod-gated read (mod inherits into admin). Pending
 * appeals surface first, then oldest-first, each carrying its appellant profile
 * and the mod_action under appeal so the reviewer has full context. RECUSAL: an
 * appeal of an action a reviewer took themselves is hidden from that reviewer's
 * queue — the decision route enforces the same rule server-side. appeals /
 * mod_actions are mod-select-only under RLS; this read is mod-gated + service
 * role, joining the appellant profile in application code.
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

const HOUR_MS = 3_600_000;

async function loadAppeals(admin: Admin, reviewerId: string) {
  // Pending first, then oldest-first — MSC ordering: status ASC puts 'pending'
  // ahead of decided states isn't guaranteed alphabetically, so order by a
  // computed pending flag then created_at.
  const { data: appealRows, error } = await admin
    .from('appeals')
    .select(
      'id, mod_action_id, appellant_user_id, body, status, decision_notes, reviewed_by_user_id, created_at, decided_at',
    )
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(`appeals queue read failed: ${error.message}`);
  const appeals = appealRows ?? [];

  const modActionIds = [...new Set(appeals.map((a) => a.mod_action_id))];
  const appellantIds = [...new Set(appeals.map((a) => a.appellant_user_id))];

  const [{ data: modActions }, { data: profiles }] = await Promise.all([
    modActionIds.length
      ? admin
          .from('mod_actions')
          .select('id, action, target_type, target_id, actor_user_id, reason')
          .in('id', modActionIds)
      : Promise.resolve({ data: [] }),
    appellantIds.length
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', appellantIds)
      : Promise.resolve({ data: [] }),
  ]);

  const modActionById = new Map((modActions ?? []).map((m) => [m.id, m]));
  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const now = Date.now();
  const items = appeals
    .filter((row) => {
      // Recusal: never show a reviewer an appeal of their own action.
      const modAction = modActionById.get(row.mod_action_id);
      return !modAction || modAction.actor_user_id !== reviewerId;
    })
    .map((row) => {
      const modAction = modActionById.get(row.mod_action_id);
      const profile = profileById.get(row.appellant_user_id);
      const ageHours = (now - new Date(row.created_at).getTime()) / HOUR_MS;
      return {
        id: row.id,
        status: row.status,
        body: row.body,
        decisionNotes: row.decision_notes,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
        ageHours,
        slaBreached: row.status === 'pending' && ageHours > APPEAL_SLA_HOURS,
        appellant: profile
          ? { userId: profile.user_id, displayName: profile.display_name, handle: profile.handle }
          : { userId: row.appellant_user_id, displayName: null, handle: null },
        modAction: modAction
          ? {
              id: modAction.id,
              action: modAction.action,
              targetType: modAction.target_type,
              targetId: modAction.target_id,
              actorUserId: modAction.actor_user_id,
              reason: modAction.reason,
            }
          : null,
      };
    });

  // Pending first, then oldest-first within each group (created_at already ASC).
  items.sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return items;
}

export async function GET(): Promise<Response> {
  try {
    const mod = await requireRole('mod');
    const admin = getSupabaseAdmin();
    const appeals = await loadAppeals(admin, mod.appUser.id);
    return apiOk({ appeals });
  } catch (error) {
    return handleApiError(error);
  }
}
