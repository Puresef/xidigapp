import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { applyModAction, resolveSubjectUser } from '@/lib/moderation/actions';
import { reportAssignSchema, reportDecisionSchema } from '@/lib/moderation/schemas';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * CP3 mod report action (§19/§27). One PATCH handles two shapes on a single
 * report: a claim/release triage toggle (reportAssignSchema — `claim`) and a
 * terminal decision (reportDecisionSchema — `action`). Decisions that touch
 * content/users funnel through applyModAction so the §19 chain (mutate →
 * immutable mod_action → notify target → audit) always holds; the route then
 * closes the report, notifies the REPORTER of the outcome, and writes the
 * report-level audit row (applyModAction has already logged its own). All
 * writes are service role — reports/mod_actions have no client write grant.
 */

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const mod = await requireRole('mod');

    const parsedId = idSchema.safeParse((await context.params).id);
    if (!parsedId.success) throw new ApiError('not_found', 404);
    const reportId = parsedId.data;

    const admin = getSupabaseAdmin();

    const { data: report, error: loadError } = await admin
      .from('reports')
      .select('id, reporter_user_id, target_type, target_id, status')
      .eq('id', reportId)
      .maybeSingle();
    if (loadError) throw new Error(`report lookup failed: ${loadError.message}`);
    if (!report) throw new ApiError('not_found', 404);

    const raw = await request.json();

    // --- Triage: claim / release -------------------------------------------
    if (raw && typeof raw === 'object' && 'claim' in raw) {
      const { claim } = reportAssignSchema.parse(raw);
      const now = new Date().toISOString();

      if (claim) {
        const { error } = await admin
          .from('reports')
          .update({
            assigned_to_user_id: mod.appUser.id,
            assigned_at: now,
            status: 'in_review',
            updated_at: now,
          })
          .eq('id', report.id);
        if (error) throw new Error(`report claim failed: ${error.message}`);
      } else {
        const { error } = await admin
          .from('reports')
          .update({ assigned_to_user_id: null, assigned_at: null, updated_at: now })
          .eq('id', report.id);
        if (error) throw new Error(`report release failed: ${error.message}`);
      }

      await writeAudit(admin, {
        actorUserId: mod.appUser.id,
        action: claim ? 'report.assign' : 'report.release',
        targetType: 'report',
        targetId: report.id,
      });

      return apiOk({ report: { id: report.id, status: claim ? 'in_review' : report.status } });
    }

    // --- Decision -----------------------------------------------------------
    const decision = reportDecisionSchema.parse(raw);
    // Idempotency: a terminal report is not re-actioned (no double-suspend /
    // duplicate reporter notice / re-stamped resolver).
    if (report.status === 'resolved' || report.status === 'dismissed') {
      throw new ApiError('invalid_request', 400);
    }
    const now = new Date().toISOString();

    // Content/user actions run through the single sanctioned executor first, so
    // the §19 mod_action + target notification + mod_action audit land before
    // the report is closed.
    if (decision.action === 'remove_content' || decision.action === 'hide_content') {
      await applyModAction(admin, {
        actorUserId: mod.appUser.id,
        action: decision.action,
        targetType: report.target_type,
        targetId: report.target_id,
        reason: decision.reason,
        reportId: report.id,
      });
    } else if (decision.action === 'warn_user' || decision.action === 'suspend_user') {
      const subject = await resolveSubjectUser(admin, report.target_type, report.target_id);
      if (!subject) throw new ApiError('invalid_request', 400);
      await applyModAction(admin, {
        actorUserId: mod.appUser.id,
        action: decision.action,
        targetType: 'user',
        targetId: subject,
        reason: decision.reason,
        reportId: report.id,
      });
    }

    // 'no_violation' and content/user decisions resolve the report; 'dismiss'
    // marks it dismissed (spam/duplicate report). Both stamp resolver + time.
    const nextStatus = decision.action === 'dismiss' ? 'dismissed' : 'resolved';
    const { error: closeError } = await admin
      .from('reports')
      .update({
        status: nextStatus,
        resolution: decision.resolution ?? null,
        resolved_by_user_id: mod.appUser.id,
        resolved_at: now,
        updated_at: now,
      })
      .eq('id', report.id);
    if (closeError) throw new Error(`report close failed: ${closeError.message}`);

    // Tell the reporter their report was actioned (never the internal outcome
    // detail — §19 keeps the mod note private to the queue).
    await insertNotification(admin, {
      userId: report.reporter_user_id,
      type: 'report_resolved',
      entityType: 'report',
      entityId: report.id,
    });

    // Report-level audit (applyModAction already logged the content/user action).
    const auditAction =
      decision.action === 'no_violation'
        ? 'report.no_violation'
        : decision.action === 'dismiss'
          ? 'report.dismissed'
          : `report.${decision.action}`;
    await writeAudit(admin, {
      actorUserId: mod.appUser.id,
      action: auditAction,
      targetType: 'report',
      targetId: report.id,
      metadata: { action: decision.action, targetType: report.target_type, targetId: report.target_id },
    });

    emitServer(event('report_resolved', { action: decision.action }), {
      distinctId: mod.appUser.id,
      userId: mod.appUser.id,
    });

    return apiOk({ report: { id: report.id, status: nextStatus } });
  } catch (error) {
    return handleApiError(error);
  }
}
