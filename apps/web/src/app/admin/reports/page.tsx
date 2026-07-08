import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ReportsQueue, type ReportItem } from '@/components/admin/reports-queue';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';
import { REPORT_SLA_HOURS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Phase 6 mod → member-reports queue (§19). Role gate mirrors requireRole('mod')
 * — mods AND admins. Service-role read because reports/report_snapshots have no
 * client grant and are mod-select-only under RLS. The load duplicates GET
 * /api/admin/reports's query on purpose — route handlers must not be imported
 * into pages. Decisions hit PATCH /api/admin/reports/[id].
 */

const STATUSES = ['open', 'in_review', 'resolved', 'dismissed', 'all'] as const;
type QueueStatus = (typeof STATUSES)[number];

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function loadReports(admin: Admin, status: QueueStatus): Promise<ReportItem[]> {
  let query = admin
    .from('reports')
    .select(
      'id, reporter_user_id, target_type, target_id, reason, status, assigned_to_user_id, created_at',
    )
    .order('created_at', { ascending: true }) // FIFO / SLA order
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);

  const { data: rows, error } = await query;
  if (error) throw new Error(`reports queue read failed: ${error.message}`);
  const reports = rows ?? [];

  const reporterIds = [...new Set(reports.map((r) => r.reporter_user_id))];
  const reportIds = reports.map((r) => r.id);

  const [{ data: profiles }, { data: snapshots }] = await Promise.all([
    reporterIds.length
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', reporterIds)
      : Promise.resolve({ data: [] as { user_id: string; display_name: string; handle: string }[] }),
    reportIds.length
      ? admin
          .from('report_snapshots')
          .select('report_id, captured_body')
          .in('report_id', reportIds)
      : Promise.resolve({ data: [] as { report_id: string; captured_body: string | null }[] }),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const snapshotByReportId = new Map((snapshots ?? []).map((s) => [s.report_id, s]));

  const now = Date.now();
  return reports.map((row) => {
    const profile = profileById.get(row.reporter_user_id);
    const snapshot = snapshotByReportId.get(row.id);
    const ageHours = (now - new Date(row.created_at).getTime()) / 3_600_000;
    return {
      id: row.id,
      reason: row.reason,
      targetType: row.target_type,
      status: row.status,
      assigned: row.assigned_to_user_id != null,
      ageHours,
      slaBreached: ageHours > REPORT_SLA_HOURS,
      reporter: profile
        ? { displayName: profile.display_name, handle: profile.handle }
        : null,
      snapshotExcerpt: snapshot?.captured_body ?? null,
      createdAt: row.created_at,
    };
  });
}

function queueHref(status: QueueStatus): string {
  return status === 'open' ? '/admin/reports' : `/admin/reports?status=${status}`;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?reason=session_expired&next=/admin/reports');
  if (ctx.appUser.status !== 'active' || (ctx.appUser.role !== 'mod' && ctx.appUser.role !== 'admin')) {
    redirect('/');
  }

  const params = await searchParams;
  const rawStatus = typeof params.status === 'string' ? params.status : '';
  const status: QueueStatus = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as QueueStatus)
    : 'open';

  const t = await getT();
  const admin = getSupabaseAdmin();
  const items = await loadReports(admin, status);

  const statusLabels: Record<QueueStatus, string> = {
    open: t('admin.reportStatusOpen'),
    in_review: t('admin.reportStatusInReview'),
    resolved: t('admin.reportStatusResolved'),
    dismissed: t('admin.reportStatusDismissed'),
    all: t('admin.reportStatusAll'),
  };

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('admin.reportsTitle')}</h1>
      <p className="xidig-field__hint">{t('admin.reportsIntro')}</p>

      <div className="xidig-tabs" aria-label={t('admin.reportStatusAll')}>
        {STATUSES.map((queueStatus) => (
          <Link
            key={queueStatus}
            className="xidig-tabs__tab"
            href={queueHref(queueStatus)}
            aria-current={status === queueStatus ? 'page' : undefined}
          >
            {statusLabels[queueStatus]}
          </Link>
        ))}
      </div>

      <ReportsQueue initialItems={items} />
    </main>
  );
}
