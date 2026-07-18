import { redirect } from 'next/navigation';

import {
  TaxonomySuggestions,
  type Suggestion,
} from '@/components/admin/taxonomy-suggestions';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Admin → term suggestions. Role enforcement is API-first (§26): this page gate
 * mirrors the requireRole('admin') checks the /api/admin/taxonomy-suggestions
 * routes make — UI hiding alone is never the control.
 */
export default async function AdminTaxonomyPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/taxonomy');
  if (ctx.appUser.role !== 'admin' || ctx.appUser.status !== 'active') redirect('/');

  const t = await getT();
  const admin = getSupabaseAdmin();

  const { data } = await admin
    .from('term_suggestions')
    .select('id, kind, term, note, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.taxonomyTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.taxonomySubtitle')}</p>
      <TaxonomySuggestions initial={(data ?? []) as Suggestion[]} />
    </main>
  );
}
