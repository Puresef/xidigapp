import { notFound, redirect } from 'next/navigation';

import { SpaceSettingsForm } from '@/components/labs/space-settings-form';
import { getAuthContext } from '@/lib/auth/guards';
import { isLabManager, loadLabBySlugForViewer } from '@/lib/labs-api';
import { LAB_SLUG_REGEX } from '@/lib/labs/schemas';
import { labMediaView } from '@/lib/labs/views';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Space settings (§16): mode/label, privacy, member view, charter + the
 * promote-only ladder. Only the lead or a platform admin reaches this — an
 * ordinary member is redirected back to the Space.
 */
export default async function LabSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!LAB_SLUG_REGEX.test(slug)) notFound();

  const ctx = await getAuthContext();
  if (!ctx) redirect(`/signin?next=/labs/${slug}/settings`);
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const lab = await loadLabBySlugForViewer(ctx, slug);
  if (!isLabManager(ctx, lab)) redirect(`/labs/${slug}`);

  const admin = getSupabaseAdmin();
  const { data: skillNeeds } = await admin
    .from('lab_skill_needs')
    .select('id, skill')
    .eq('lab_id', lab.id)
    .is('filled_at', null);

  const t = await getT();

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('lab.settingsTitle')}</h1>
      <SpaceSettingsForm
        labId={lab.id}
        slug={slug}
        initial={{
          name: lab.name,
          summary: lab.short_description ?? '',
          visibility: lab.visibility,
          memberListVisibility: lab.member_list_visibility,
          joinMode: lab.join_mode,
          isListed: lab.is_listed,
          isSupporterOnly: lab.is_supporter_only,
          problemStatement: lab.problem_statement ?? '',
          hypothesis: lab.hypothesis ?? '',
          successDefinition: lab.success_definition ?? '',
          spaceMode: lab.space_mode,
        }}
        media={labMediaView(lab)}
        skillNeeds={skillNeeds ?? []}
      />
    </main>
  );
}
