import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { DRAFT_COLUMNS, draftBodySchema } from '@/lib/social/drafts';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * One composer draft (Phase 4.5): PATCH replaces the payload (the composer
 * autosaves the whole snapshot every ~2s of quiet), DELETE removes it (also
 * fired on publish). Ownership is checked under the caller's RLS — someone
 * else's draft id is a plain 404, and every service-role write is additionally
 * scoped by user_id.
 */

const idSchema = z.string().uuid();

function parseDraftId(raw: string): string {
  const parsed = idSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

/** RLS-scoped ownership check: whatever RLS hides is a plain 404. */
async function assertOwnDraft(ctx: AuthContext, id: string): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('post_drafts')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`draft lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseDraftId((await context.params).id);
    const { payload } = draftBodySchema.parse(await request.json());

    await assertOwnDraft(ctx, id);

    const { data: draft, error } = await getSupabaseAdmin()
      .from('post_drafts')
      .update({ payload, lab_id: payload.labId ?? null })
      .eq('id', id)
      .eq('user_id', ctx.appUser.id)
      .select(DRAFT_COLUMNS)
      .single();
    if (error || !draft) {
      throw new Error(`draft update failed: ${error?.message ?? 'no row returned'}`);
    }

    emitServer(event('draft_saved', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ draft });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseDraftId((await context.params).id);

    const { error } = await getSupabaseAdmin()
      .from('post_drafts')
      .delete()
      .eq('id', id)
      .eq('user_id', ctx.appUser.id);
    if (error) throw new Error(`draft delete failed: ${error.message}`);

    // Idempotent: deleting an already-gone draft is a success.
    return apiOk({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
