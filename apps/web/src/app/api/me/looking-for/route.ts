import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { findLabsSeekingSkills } from '@/lib/matching/looking-for';

/**
 * GET /api/me/looking-for (§20): Labs actively seeking one of the member's
 * skills. Transparent tag overlap (see lib/matching/looking-for.ts) — powers
 * the "Labs looking for your skills" surface and the Ask-composer suggestions.
 * RLS-scoped via the session client, so only visible Labs are returned.
 */
export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { data: me } = await ctx.supabase
      .from('profiles')
      .select('skills')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();
    const matches = await findLabsSeekingSkills(ctx.supabase, (me?.skills ?? []) as string[]);
    return apiOk({ matches });
  } catch (error) {
    return handleApiError(error);
  }
}
