import { redirect } from 'next/navigation';

import type { Translator } from '@xidig/i18n';

import { AppealForm } from '@/components/support/appeal-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 6 member appeal form (§19) — replaces the mailto stub. Uses
 * getAuthContext (NOT requireUser) so a SUSPENDED member — the person most
 * likely to need it — can still reach their one promised resolution path.
 *
 * `?action=<uuid>` shows a single form for that mod_action (e.g. the
 * content_removed CTA deep-links here). With no param, we list the caller's
 * user-level actions (suspend/warn/remove/hide targeted at them) that don't
 * already carry an appeal, each with its own form. Reads are service role —
 * mod_actions/appeals are mod-select-only under RLS.
 */

const APPEALABLE_ACTIONS = ['suspend_user', 'warn_user', 'remove_content', 'hide_content'] as const;

function actionLabel(action: string, t: Translator): string {
  switch (action) {
    case 'suspend_user':
      return t('settings.appealActionSuspend');
    case 'warn_user':
      return t('settings.appealActionWarn');
    case 'remove_content':
      return t('settings.appealActionRemove');
    case 'hide_content':
      return t('settings.appealActionHide');
    default:
      return t('settings.appealActionOther');
  }
}

export default async function AppealPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/support/appeal');

  const t = await getT();
  const admin = getSupabaseAdmin();
  const params = await searchParams;
  const actionParam = typeof params.action === 'string' ? params.action : null;

  // --- Single-action mode (deep link from a §27 CTA) -------------------------
  if (actionParam) {
    const { data: modAction } = await admin
      .from('mod_actions')
      .select('id, action')
      .eq('id', actionParam)
      .maybeSingle();

    return (
      <main className="xidig-auth">
        <h1 className="xidig-auth__title">{t('settings.appealTitle')}</h1>
        <p className="xidig-field__hint">{t('settings.appealIntro')}</p>
        {modAction ? (
          <AppealForm
            target={{ modActionId: modAction.id, actionLabel: actionLabel(modAction.action, t) }}
          />
        ) : (
          <p>{t('settings.appealEmpty')}</p>
        )}
      </main>
    );
  }

  // --- List mode: the caller's own un-appealed user-level actions ------------
  const { data: actions } = await admin
    .from('mod_actions')
    .select('id, action')
    .eq('target_id', ctx.appUser.id)
    .in('action', [...APPEALABLE_ACTIONS])
    .order('created_at', { ascending: false });

  const actionRows = actions ?? [];
  const actionIds = actionRows.map((a) => a.id);

  const { data: existingAppeals } = actionIds.length
    ? await admin.from('appeals').select('mod_action_id').in('mod_action_id', actionIds)
    : { data: [] as { mod_action_id: string }[] };
  const appealedIds = new Set((existingAppeals ?? []).map((a) => a.mod_action_id));

  const appealable = actionRows.filter((a) => !appealedIds.has(a.id));

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('settings.appealTitle')}</h1>
      <p className="xidig-field__hint">{t('settings.appealIntro')}</p>
      {appealable.length === 0 ? (
        <p>{t('settings.appealEmpty')}</p>
      ) : (
        <ul className="xidig-card-grid">
          {appealable.map((action) => (
            <li key={action.id} className="xidig-card">
              <AppealForm
                target={{ modActionId: action.id, actionLabel: actionLabel(action.action, t) }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
