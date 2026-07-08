import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { REPORT_SLA_HOURS } from '@/lib/moderation/constants';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * CP3 mod reports queue (§19/§27). Service-role read of the reports table in
 * created_at ASC order (FIFO — the oldest unactioned report is the one closest
 * to breaching the §27 48h SLA). Each row is enriched for triage: the
 * reporter's public identity, the §13 report snapshot (so a DM report can be
 * adjudicated from captured evidence, never the live thread), an SLA age badge,
 * and a per-target report count that surfaces dedup / brigading signal without
 * changing the queue's FIFO ordering. Read-only; decisions run through PATCH
 * [id]. All reads are service role — reports has no client write grant and the
 * snapshot table is mod-read-only.
 */

const querySchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'dismissed', 'all']).default('open'),
  reason: z
    .enum([
      'spam',
      'harassment',
      'impersonation',
      'fraud_or_scam',
      'inappropriate_content',
      'misinformation',
      'other',
    ])
    .optional(),
  targetType: z
    .enum([
      'user',
      'profile',
      'conversation',
      'message',
      'post',
      'comment',
      'listing',
      'lab_update',
      'candidate',
    ])
    .optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole('mod');

    const url = new URL(request.url);
    const query = querySchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      reason: url.searchParams.get('reason') ?? undefined,
      targetType: url.searchParams.get('targetType') ?? undefined,
    });

    const admin = getSupabaseAdmin();

    let reportsQuery = admin
      .from('reports')
      .select(
        'id, reporter_user_id, target_type, target_id, reason, details, status, resolution, resolved_by_user_id, resolved_at, assigned_to_user_id, assigned_at, created_at, updated_at',
      )
      .order('created_at', { ascending: true }); // FIFO / SLA order

    if (query.status !== 'all') reportsQuery = reportsQuery.eq('status', query.status);
    if (query.reason) reportsQuery = reportsQuery.eq('reason', query.reason);
    if (query.targetType) reportsQuery = reportsQuery.eq('target_type', query.targetType);

    const { data: rows, error } = await reportsQuery;
    if (error) throw new Error(`reports queue read failed: ${error.message}`);

    const reports = rows ?? [];

    // Batch the enrichment lookups so the queue is a fixed number of round
    // trips regardless of page size.
    const reporterIds = [...new Set(reports.map((r) => r.reporter_user_id))];
    const reportIds = reports.map((r) => r.id);

    const [reportersResult, snapshotsResult] = await Promise.all([
      reporterIds.length
        ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', reporterIds)
        : Promise.resolve({ data: [], error: null }),
      reportIds.length
        ? admin
            .from('report_snapshots')
            .select('report_id, entity_type, entity_id, captured_body, captured_context, created_at')
            .in('report_id', reportIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (reportersResult.error) {
      throw new Error(`report reporter lookup failed: ${reportersResult.error.message}`);
    }
    if (snapshotsResult.error) {
      throw new Error(`report snapshot lookup failed: ${snapshotsResult.error.message}`);
    }

    const reporterById = new Map(
      (reportersResult.data ?? []).map((p) => [
        p.user_id,
        { display_name: p.display_name, handle: p.handle },
      ]),
    );
    const snapshotByReportId = new Map(
      (snapshotsResult.data ?? []).map((s) => [s.report_id, s]),
    );

    // Dedup / brigading signal: how many reports (across ALL statuses) point at
    // the same (target_type, target_id). Counted over the fetched set so it is
    // scoped to the current queue view.
    const targetCounts = new Map<string, number>();
    for (const r of reports) {
      const key = `${r.target_type}:${r.target_id}`;
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    }

    const now = Date.now();
    const enriched = reports.map((r) => {
      const ageHours = (now - new Date(r.created_at).getTime()) / 3_600_000;
      return {
        ...r,
        reporter: reporterById.get(r.reporter_user_id) ?? null,
        snapshot: snapshotByReportId.get(r.id) ?? null,
        ageHours,
        slaBreached: ageHours > REPORT_SLA_HOURS,
        targetReportCount: targetCounts.get(`${r.target_type}:${r.target_id}`) ?? 1,
      };
    });

    return apiOk({ reports: enriched });
  } catch (error) {
    return handleApiError(error);
  }
}
