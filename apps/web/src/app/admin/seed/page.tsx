import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Admin → seeded-content review (§21). A read-only surface that makes seeded /
 * AI-assisted content identifiable and auditable: the named seed runs plus
 * per-type counts of content carrying a non-'member' source. Admin-only;
 * service-role reads (seed_runs is admin-select, the content counts span
 * tables). Seeded rows are additionally labelled everywhere they render (the
 * ContentSourceBadge), and can be reset via the seed CLI (docs/seeding.md).
 */
export const dynamic = 'force-dynamic';

async function countSeeded(
  admin: ReturnType<typeof getSupabaseAdmin>,
  table: 'posts' | 'business_listings' | 'lab_playbooks' | 'tags',
): Promise<number> {
  const { count } = await admin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .neq('source', 'member');
  return count ?? 0;
}

export default async function AdminSeedPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/admin/seed');
  if (ctx.appUser.role !== 'admin') redirect('/');

  const t = await getT();
  const admin = getSupabaseAdmin();

  const [runs, posts, listings, playbooks, tags] = await Promise.all([
    admin.from('seed_runs').select('label, source, created_at').order('created_at', { ascending: false }),
    countSeeded(admin, 'posts'),
    countSeeded(admin, 'business_listings'),
    countSeeded(admin, 'lab_playbooks'),
    countSeeded(admin, 'tags'),
  ]);

  const runRows = runs.data ?? [];
  const counts: Array<{ key: string; label: string; value: number }> = [
    { key: 'posts', label: t('admin.seedPosts'), value: posts },
    { key: 'listings', label: t('admin.seedListings'), value: listings },
    { key: 'playbooks', label: t('admin.seedPlaybooks'), value: playbooks },
    { key: 'tags', label: t('admin.seedTags'), value: tags },
  ];

  return (
    <main className="xidig-container">
      <h1 className="xidig-auth__title">{t('admin.seedTitle')}</h1>
      <p className="xidig-card__meta">{t('admin.seedSubtitle')}</p>

      <section className="xidig-card">
        <h2 className="xidig-card__title">{t('admin.seedContentHeading')}</h2>
        <ul className="xidig-chip-row">
          {counts.map((c) => (
            <li key={c.key} className="xidig-tag xidig-tag--seeded">
              {c.label}: {c.value}
            </li>
          ))}
        </ul>
      </section>

      <section className="xidig-card">
        <h2 className="xidig-card__title">{t('admin.seedRunsHeading')}</h2>
        {runRows.length === 0 ? (
          <p className="xidig-card__meta">{t('admin.seedNoRuns')}</p>
        ) : (
          <table className="xidig-table">
            <thead>
              <tr>
                <th>{t('admin.seedColLabel')}</th>
                <th>{t('admin.seedColSource')}</th>
                <th>{t('admin.seedColCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {runRows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td>
                    <span className="xidig-tag xidig-tag--seeded">{r.source}</span>
                  </td>
                  <td>{new Date(r.created_at).toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
