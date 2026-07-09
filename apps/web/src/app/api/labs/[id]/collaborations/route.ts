import { apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';
import { collaborationActionSchema } from '@/lib/labs/schemas';
import {
  endCollaboration,
  proposeCollaboration,
  respondToCollaboration,
} from '@/lib/labs/membership';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Inter-Lab collaboration (§16). GET lists links involving this Space
 * (RLS-scoped). POST is the link lifecycle acting AS this Space (the caller must
 * be its lead / a platform admin):
 *   - propose: this Space invites another to collaborate;
 *   - respond: this Space (the invited side) accepts/declines;
 *   - end:     either linked Space ends an accepted collaboration.
 * Accepted links let updates cross-post to both Spaces; duplicate/self links are
 * rejected by the DB unique + distinct constraints (surfaced as lab_collab_invalid).
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const { data, error } = await ctx.supabase
      .from('lab_collaborations')
      .select('id, lab_a_id, lab_b_id, status, proposed_by_user_id, responded_at, created_at')
      .or(`lab_a_id.eq.${id},lab_b_id.eq.${id}`)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`collaborations query failed: ${error.message}`);
    return apiOk({ items: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = collaborationActionSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    requireLabManager(ctx, lab);
    const admin = getSupabaseAdmin();

    switch (input.action) {
      case 'propose': {
        const result = await proposeCollaboration(admin, lab, input.targetLabId, ctx.appUser.id);
        emitServer(event('lab_collaboration_created', {}), {
          distinctId: ctx.appUser.id,
          userId: ctx.appUser.id,
        });
        return apiOk({ id: result.id }, 201);
      }
      case 'respond': {
        await respondToCollaboration(
          admin,
          input.collaborationId,
          [lab.id],
          ctx.appUser.id,
          input.decision,
        );
        return apiOk({ ok: true });
      }
      case 'end': {
        await endCollaboration(admin, input.collaborationId, [lab.id], ctx.appUser.id);
        return apiOk({ ok: true });
      }
    }
  } catch (error) {
    return handleApiError(error);
  }
}
