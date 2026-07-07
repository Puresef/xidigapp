import { apiNotice, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadLabForViewer, parseLabId, requireLabManager } from '@/lib/labs-api';
import { memberActionSchema } from '@/lib/labs/schemas';
import {
  inviteMember,
  joinLab,
  leaveLab,
  removeMember,
  respondToRequest,
  setMemberRole,
} from '@/lib/labs/membership';
import { attachAuthors } from '@/lib/labs/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Space membership (§16 roles: Lead / Core / Member / Observer). GET returns
 * the roster the caller may see (RLS applies member_list_visibility); POST is
 * the membership state machine — join / leave (any member) and respond /
 * invite / set_role / remove (lead or platform admin). Every transition logs a
 * Space History event and notifies the affected member.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const { data, error } = await ctx.supabase
      .from('lab_members')
      .select('user_id, role, specialization, status, joined_at')
      .eq('lab_id', id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true });
    if (error) throw new Error(`roster query failed: ${error.message}`);

    const admin = getSupabaseAdmin();
    const items = await attachAuthors(admin, data ?? [], 'user_id');
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseLabId((await context.params).id);
    const input = memberActionSchema.parse(await request.json());

    const lab = await loadLabForViewer(ctx, id);
    const admin = getSupabaseAdmin();

    switch (input.action) {
      case 'join': {
        const result = await joinLab(admin, lab, ctx.appUser.id);
        if (result.status === 'requested') return apiNotice('lab_join_requested');
        return apiOk({ status: result.status });
      }
      case 'leave': {
        await leaveLab(admin, lab, ctx.appUser.id);
        return apiOk({ ok: true });
      }
      case 'respond': {
        requireLabManager(ctx, lab);
        await respondToRequest(admin, lab, ctx.appUser.id, input.userId, input.decision);
        return apiOk({ ok: true });
      }
      case 'invite': {
        requireLabManager(ctx, lab);
        await inviteMember(admin, lab, ctx.appUser.id, input.userId, input.role);
        return apiOk({ ok: true });
      }
      case 'set_role': {
        requireLabManager(ctx, lab);
        await setMemberRole(admin, lab, ctx.appUser.id, input.userId, input.role);
        return apiOk({ ok: true });
      }
      case 'remove': {
        requireLabManager(ctx, lab);
        await removeMember(admin, lab, ctx.appUser.id, input.userId);
        return apiOk({ ok: true });
      }
    }
  } catch (error) {
    return handleApiError(error);
  }
}
