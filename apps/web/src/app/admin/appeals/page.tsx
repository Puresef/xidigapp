import { redirect } from 'next/navigation';

import { AppealsQueue, type AppealItem } from '@/components/admin/appeals-queue';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { APPEAL_SLA_HOURS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 6 appeals review (§19). Role gate mirrors requireRole('mod'). Service
 * role read (appeals/mod_actions are mod-select-only under RLS). RECUSAL: an
 * appeal of an action the viewer took themselves is excluded here — the decision
 * route enforces the same rule (appeal_self_review). Pending appeals surface
 * first, then oldest-first. Decisions hit PATCH /api/admin/appeals/[id].
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function loadAppeals(admin: Admin, reviewerId: string): Promise<AppealItem[]> {
  const { data: appealRows, error } = await admin
    .from('appeals')
    .select('id, mod_action_id, appellant_user_id, body, status, created_at')
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
          .select('id, action, target_type, actor_user_id, reason')
          .in('id', modActionIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            action: string;
            target_type: string;
            actor_user_id: string;
            reason: string | null;
          }[],
        }),
    appellantIds.length
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', appellantIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
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
      const ageHours = (now - new Date(row.created_at).getTime()) / 3_600_000;
      return {
        id: row.id,
        status: row.status,
        body: row.body,
        ageHours,
        slaBreached: row.status === 'pending' && ageHours > APPEAL_SLA_HOURS,
        appellant: profile
          ? { displayName: profile.display_name, handle: profile.handle }
          : null,
        action: modAction
          ? { action: modAction.action, targetType: modAction.target_type, reason: modAction.reason }
          : null,
      };
    });

  // Pending first, then oldest-first (created_at already ASC).
  items.sort((a, b) => {
    const aPending = a.status === 'pending' ? 0 : 1;
    const bPending = b.status === 'pending' ? 0 : 1;
    return aPending - bPending;
  });

  return items;
}

export default async function AdminAppealsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/appeals');
  if (ctx.appUser.status !== 'active' || (ctx.appUser.role !== 'mod' && ctx.appUser.role !== 'admin')) {
    redirect('/');
  }

  const t = await getT();
  const admin = getSupabaseAdmin();
  const items = await loadAppeals(admin, ctx.appUser.id);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.appealsTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.appealsIntro')}</p>
      <AppealsQueue initialItems={items} />
    </main>
  );
}
