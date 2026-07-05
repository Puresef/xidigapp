import { redirect } from 'next/navigation';

import { ClaimsQueue, type ClaimRow } from '@/components/admin/claims-queue';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Mod → listing claims queue (§18/§19). The mod-side of the "Claim this
 * listing" flow: discover pending claims and approve/reject them (decisions
 * hit PATCH /api/claims/[id]). Role gate mirrors the API's requireRole('mod')
 * — mods AND admins. Service-role read because listing_claims RLS is
 * claimant-scoped.
 */
export default async function AdminClaimsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/claims');
  if (ctx.appUser.status !== 'active' || (ctx.appUser.role !== 'mod' && ctx.appUser.role !== 'admin')) {
    redirect('/');
  }

  const t = await getT();
  const admin = getSupabaseAdmin();

  const { data: claimRows } = await admin
    .from('listing_claims')
    .select('id, listing_id, claimant_user_id, evidence, status, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);

  const rows = claimRows ?? [];
  const listingIds = [...new Set(rows.map((r) => r.listing_id))];
  const claimantIds = [...new Set(rows.map((r) => r.claimant_user_id))];

  const [{ data: listings }, { data: profiles }] = await Promise.all([
    listingIds.length
      ? admin.from('business_listings').select('id, business_name, city').in('id', listingIds)
      : Promise.resolve({ data: [] as { id: string; business_name: string; city: string | null }[] }),
    claimantIds.length
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', claimantIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
  ]);

  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));
  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const claims: ClaimRow[] = rows.map((row) => ({
    ...row,
    listing: listingById.get(row.listing_id) ?? null,
    claimant: profileById.get(row.claimant_user_id) ?? null,
  }));

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.claimsTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.claimsIntro')}</p>
      <ClaimsQueue initialClaims={claims} />
    </main>
  );
}
