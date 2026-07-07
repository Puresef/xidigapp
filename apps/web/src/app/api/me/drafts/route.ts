import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { DRAFT_COLUMNS, DRAFT_LIMIT, draftBodySchema } from '@/lib/social/drafts';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Composer drafts (Phase 4.5 §1f). GET lists the caller's drafts (most
 * recently touched first); POST saves a new one, capped at 10 per member —
 * over the cap is a 409 with §27 copy telling them to delete one, never a
 * silent drop (the composer also keeps a localStorage fallback). Reads under
 * RLS (own-rows); writes via service role (post_drafts is API-only).
 */

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data, error } = await ctx.supabase
      .from('post_drafts')
      .select(DRAFT_COLUMNS)
      .eq('user_id', ctx.appUser.id)
      .order('updated_at', { ascending: false })
      .limit(DRAFT_LIMIT);
    if (error) throw new Error(`drafts query failed: ${error.message}`);

    return apiOk({ items: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { payload } = draftBodySchema.parse(await request.json());

    const { count, error: countError } = await ctx.supabase
      .from('post_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.appUser.id);
    if (countError) throw new Error(`draft count failed: ${countError.message}`);
    if ((count ?? 0) >= DRAFT_LIMIT) throw new ApiError('draft_limit', 409);

    const { data: draft, error } = await getSupabaseAdmin()
      .from('post_drafts')
      .insert({
        user_id: ctx.appUser.id,
        lab_id: payload.labId ?? null,
        payload,
      })
      .select(DRAFT_COLUMNS)
      .single();
    if (error || !draft) {
      throw new Error(`draft insert failed: ${error?.message ?? 'no row returned'}`);
    }

    emitServer(event('draft_saved', {}), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    return apiOk({ draft }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
