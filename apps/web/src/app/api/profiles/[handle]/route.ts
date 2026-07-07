import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { getMemberProfileView } from '@/lib/profile-view';
import { handleSchema } from '@/lib/profiles';

/**
 * Public-facing profile card (§18 directory, §13 mentions target). Returns the
 * profile, its active badges (§14), and follower/vouch counts.
 *
 * Fetch logic lives in lib/profile-view.ts and is shared with the SSR
 * /u/[handle] page (§28 share pages) so web and mobile render identical data.
 * Counts go through the service-role client on purpose: `follows` and
 * `vouches` are RLS-scoped to the parties involved (a member cannot enumerate
 * someone else's followers), but an aggregate count carries no PII and is
 * safe to expose. Everything else reads under the caller's RLS.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ handle: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = handleSchema.safeParse((await context.params).handle);
    if (!parsed.success) throw new ApiError('not_found', 404);

    const view = await getMemberProfileView(ctx.supabase, parsed.data, ctx.appUser.id);
    if (!view) throw new ApiError('not_found', 404);

    return apiOk(view);
  } catch (error) {
    return handleApiError(error);
  }
}
