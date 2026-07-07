import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { CandidateEditor } from '@/components/capital/candidate-editor';
import { getAuthContext } from '@/lib/auth/guards';
import { getCandidateView } from '@/lib/capital/views';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Candidate editor page (§17). Creator or Lab lead (or admin) only — the page
 * gates on creator/admin here for the affordance; the PATCH/submit APIs are the
 * enforcement (they re-check lead/creator). Editable only while draft or
 * submitted; a decided candidate redirects back to the permalink.
 */

const idSchema = z.string().uuid();

export default async function CandidateEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const ctx = await getAuthContext();
  if (!ctx) redirect(`/signin?next=/c/${id}/edit`);
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const admin = getSupabaseAdmin();
  const view = await getCandidateView(ctx.supabase, admin, id, ctx.appUser.id);
  if (!view) notFound();

  const { candidate } = view;

  // Editable statuses only; anything decided goes back to the read view.
  if (!['draft', 'submitted'].includes(candidate.status)) {
    redirect(`/c/${id}`);
  }

  // Affordance gate: creator or admin, or a Lab lead/core manager. This must
  // match the API's manager set (isCandidateManager: role 'lead' OR 'core',
  // plus labs.lead_user_id) — the PATCH/submit APIs re-authorize, so if a
  // manager lands here without being creator the editor still works. Everyone
  // else is bounced. (labs.lead_user_id is covered because that lead also
  // carries a 'lead' member row.)
  const isCreator = candidate.created_by_user_id === ctx.appUser.id;
  const isAdmin = ctx.appUser.role === 'admin';
  const isManager = view.lab
    ? await (async () => {
        const { data } = await admin
          .from('lab_members')
          .select('role')
          .eq('user_id', ctx.appUser.id)
          .in(
            'lab_id',
            [candidate.lab_id, candidate.co_lab_id].filter(
              (v): v is string => typeof v === 'string',
            ),
          )
          .in('role', ['lead', 'core'])
          .eq('status', 'active')
          .limit(1);
        return (data?.length ?? 0) > 0;
      })()
    : false;

  if (!isCreator && !isAdmin && !isManager) redirect(`/c/${id}`);

  const t = await getT();

  return (
    <main className="xidig-section">
      <div className="xidig-card__header">
        <h1 className="xidig-auth__title">{t('capital.editTitle')}</h1>
        <Link className="xidig-button xidig-button--secondary" href={`/c/${id}`}>
          {t('action.cancel')}
        </Link>
      </div>
      <p className="xidig-card__body">{t('capital.editSubtitle')}</p>

      <CandidateEditor candidate={candidate} />
    </main>
  );
}
