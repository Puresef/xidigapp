import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { fetchPostCosigns } from '@/lib/plaza/cosigns';
import { parsePostId } from '@/lib/posts-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Garab on a resolved Codsi (P1) — idempotent toggle in the reactions-route
 * style. Writes go through the CALLER's RLS client: the with-check IS the
 * product law (Garab exists only post-fulfilled, on a published ask the
 * viewer can read), so the database is the authz here.
 *
 * The response echoes {cosigned, count} so the control can update in place.
 * The count is not a reward for taking part — every viewer already sees it
 * (Packet B: Show support unlocks nothing). Route, field and event names keep
 * the original `cosign` identifiers; only the display label changed.
 */

export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);

    const { error } = await ctx.supabase.from('post_cosigns').insert({
      post_id: id,
      user_id: ctx.appUser.id,
    });
    if (error) {
      // 23505 = already supporting → idempotent success.
      // 42501 = RLS with-check: not an ask, not fulfilled, or not visible —
      //         the ask isn't in a garab-able state.
      if (error.code === '42501') throw new ApiError('ask_not_open', 409);
      if (error.code !== '23505') {
        throw new Error(`post cosign insert failed: ${error.message}`);
      }
    } else {
      emitServer(event('post_cosigned', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    const cosigns = await fetchPostCosigns(getSupabaseAdmin(), id, ctx.appUser.id);
    return apiOk({ cosigned: true, count: cosigns.count });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parsePostId((await context.params).id);

    const { error } = await ctx.supabase
      .from('post_cosigns')
      .delete()
      .eq('post_id', id)
      .eq('user_id', ctx.appUser.id);
    if (error) throw new Error(`post cosign delete failed: ${error.message}`);

    const cosigns = await fetchPostCosigns(getSupabaseAdmin(), id, ctx.appUser.id);
    return apiOk({ cosigned: false, count: cosigns.count });
  } catch (error) {
    return handleApiError(error);
  }
}
