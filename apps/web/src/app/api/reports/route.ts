import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { reportSchema } from '@/lib/moderation/schemas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Report entry point ("Soo sheeg" — §13 block+report inside DMs, widened to
 * every surface Phase 6 moderates via reportSchema). Submission only: records a
 * report row, captures ONE immutable snapshot of the reported content, and
 * returns the §27 "thanks for the report" notice. The Phase 6 mod queue (SLA
 * timer, mod actions, appeals) consumes these rows later.
 *
 * Two guards run before insert:
 *  - DM privacy: a message/conversation is only reportable by a PARTICIPANT, so
 *    the report (and its snapshot) can never surface a stranger's private DM.
 *  - Duplicate: one open/in_review report per (reporter, target) — a member
 *    can't spam the queue by re-filing the same report.
 *
 * API-only (service role); reporters read their own report status via RLS
 * (reports_select_own) at GET /api/me/reports.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = reportSchema.parse(await request.json());

    // Light abuse guard on report submission itself.
    await enforceRateLimit(`report:${ctx.appUser.id}`, { max: 20, windowSeconds: 3600 });

    const admin = getSupabaseAdmin();

    // (a) DM privacy guard — only a conversation participant may report a
    // message/conversation, which also bounds whose private content gets
    // snapshotted below.
    let messageSnapshot: { body: string; conversationId: string; senderUserId: string; createdAt: string } | null =
      null;
    if (input.targetType === 'message' || input.targetType === 'conversation') {
      let conversationId = input.targetId;

      if (input.targetType === 'message') {
        const { data: message, error: messageError } = await admin
          .from('messages')
          .select('body, conversation_id, sender_user_id, created_at')
          .eq('id', input.targetId)
          .maybeSingle();
        if (messageError) throw new Error(`report message lookup failed: ${messageError.message}`);
        if (!message) throw new ApiError('not_found', 404);
        conversationId = message.conversation_id;
        messageSnapshot = {
          body: message.body,
          conversationId: message.conversation_id,
          senderUserId: message.sender_user_id,
          createdAt: message.created_at,
        };
      }

      const { data: conversation, error: conversationError } = await admin
        .from('conversations')
        .select('id, initiator_user_id, recipient_user_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (conversationError) {
        throw new Error(`report conversation lookup failed: ${conversationError.message}`);
      }
      if (!conversation) throw new ApiError('not_found', 404);

      const isParticipant =
        conversation.initiator_user_id === ctx.appUser.id ||
        conversation.recipient_user_id === ctx.appUser.id;
      if (!isParticipant) throw new ApiError('forbidden', 403);
    }

    // (b) Duplicate guard — one live report per (reporter, target).
    const { data: existing, error: existingError } = await admin
      .from('reports')
      .select('id')
      .eq('reporter_user_id', ctx.appUser.id)
      .eq('target_type', input.targetType)
      .eq('target_id', input.targetId)
      .in('status', ['open', 'in_review'])
      .maybeSingle();
    if (existingError) throw new Error(`report duplicate lookup failed: ${existingError.message}`);
    if (existing) throw new ApiError('report_duplicate', 409);

    const { data: report, error } = await admin
      .from('reports')
      .insert({
        reporter_user_id: ctx.appUser.id,
        target_type: input.targetType,
        target_id: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
      })
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`report insert failed: ${error.message}`);
    if (!report) throw new Error('report insert returned no row');

    // (c) Best-effort snapshot — an immutable copy of what was reported so the
    // mod sees the original even after edit/delete. A snapshot failure must
    // never fail the report itself.
    await captureSnapshot(admin, {
      reportId: report.id,
      targetType: input.targetType,
      targetId: input.targetId,
      messageSnapshot,
    });

    return apiNotice('report_submitted');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Capture one report_snapshots row. Isolated + best-effort: any failure is
 * logged and swallowed so the report submission itself always succeeds.
 */
async function captureSnapshot(
  admin: ReturnType<typeof getSupabaseAdmin>,
  args: {
    reportId: string;
    targetType: (typeof reportSchema)['_output']['targetType'];
    targetId: string;
    messageSnapshot: { body: string; conversationId: string; senderUserId: string; createdAt: string } | null;
  },
): Promise<void> {
  try {
    let capturedBody: string | null = null;
    let capturedContext: Record<string, unknown> = {};

    if (args.targetType === 'message' && args.messageSnapshot) {
      capturedBody = args.messageSnapshot.body;
      capturedContext = {
        conversationId: args.messageSnapshot.conversationId,
        senderUserId: args.messageSnapshot.senderUserId,
        createdAt: args.messageSnapshot.createdAt,
      };
    } else if (args.targetType === 'post') {
      const { data } = await admin
        .from('posts')
        .select('body')
        .eq('id', args.targetId)
        .maybeSingle();
      capturedBody = data?.body ?? null;
    } else if (args.targetType === 'comment') {
      const { data } = await admin
        .from('comments')
        .select('body')
        .eq('id', args.targetId)
        .maybeSingle();
      capturedBody = data?.body ?? null;
    }

    const { error } = await admin.from('report_snapshots').insert({
      report_id: args.reportId,
      entity_type: args.targetType,
      entity_id: args.targetId,
      captured_body: capturedBody,
      captured_context: capturedContext as never,
    });
    if (error) {
      console.error('[reports] snapshot insert failed:', error.message);
    }
  } catch (snapshotError) {
    console.error('[reports] snapshot capture failed:', snapshotError);
  }
}
