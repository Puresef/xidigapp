import { redirect } from 'next/navigation';

import {
  VerificationsQueue,
  type VerificationItem,
} from '@/components/admin/verifications-queue';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { VERIFICATION_SLA_DAYS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * §14 verifier queue page. Gate: admins always, plus members holding the
 * verifier capability (is_verifier() SECURITY DEFINER RPC — verifier_grants is
 * admin-read-only under RLS, so a plain verifier can't read their own grant).
 * Service-role read (verifications is verifier/admin-select-only) — and the
 * list NEVER selects recording_url (that is fetched on demand, access-logged, by
 * the client). Actions hit PATCH /api/admin/verifications/[id].
 */

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function loadVerifications(admin: Admin): Promise<VerificationItem[]> {
  const { data: rows, error } = await admin
    .from('verifications')
    // recording_url deliberately omitted — verifier-only, access-logged.
    .select('id, user_id, type, status, consent_given, listing_id, created_at')
    .in('status', ['pending', 'scheduled'])
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(`verification queue read failed: ${error.message}`);
  const verifications = rows ?? [];

  const requesterIds = [...new Set(verifications.map((v) => v.user_id))];
  const listingIds = [
    ...new Set(
      verifications
        .filter((v) => v.type === 'business' && v.listing_id)
        .map((v) => v.listing_id as string),
    ),
  ];

  const [{ data: profiles }, { data: listings }] = await Promise.all([
    requesterIds.length
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', requesterIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
    listingIds.length
      ? admin.from('business_listings').select('id, business_name').in('id', listingIds)
      : Promise.resolve({ data: [] as { id: string; business_name: string }[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  const now = Date.now();
  return verifications.map((row) => {
    const profile = profileById.get(row.user_id);
    const listing = row.listing_id ? listingById.get(row.listing_id) : undefined;
    const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      consentGiven: row.consent_given,
      ageDays,
      slaBreached: ageDays > VERIFICATION_SLA_DAYS,
      requester: profile
        ? { displayName: profile.display_name, handle: profile.handle }
        : null,
      businessName: listing?.business_name ?? null,
    };
  });
}

export default async function AdminVerificationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/verifications');
  if (ctx.appUser.status !== 'active') redirect('/');

  // Verifiers + admins. Admins inherit; everyone else must hold the verifier
  // capability (checked via the is_verifier RPC — see requireVerifier()).
  if (ctx.appUser.role !== 'admin') {
    const { data: isVerifier } = await ctx.supabase.rpc('is_verifier');
    if (isVerifier !== true) redirect('/');
  }

  const t = await getT();
  const admin = getSupabaseAdmin();
  const items = await loadVerifications(admin);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.verifyTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.verifyIntro')}</p>
      <VerificationsQueue initialItems={items} />
    </main>
  );
}
