import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { suggestionCreateSchema } from '@/lib/taxonomy/schemas';

/**
 * Member "suggest a term" for a shared-coordinate taxonomy (lane / listing
 * category). Files a pending suggestion for admin review — it does NOT create
 * the term (that would fragment the shared filter axis). Rate-limited; a
 * duplicate open suggestion is idempotent (friendly, not an error).
 */
export const dynamic = 'force-dynamic';

const SUGGEST_PER_DAY = 10;
const DAY_SECONDS = 86_400;

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = suggestionCreateSchema.parse(await request.json());

    const allowed = await checkRateLimit(`taxsuggest:${ctx.appUser.id}`, {
      max: SUGGEST_PER_DAY,
      windowSeconds: DAY_SECONDS,
    });
    if (!allowed) throw new ApiError('rate_limited', 429);

    const { error } = await ctx.supabase.from('term_suggestions').insert({
      kind: input.kind,
      term: input.term,
      note: input.note ?? null,
      suggested_by: ctx.appUser.id,
    });

    if (error) {
      // 23505 = an open suggestion for this (kind, term) already exists → treat
      // as success (the queue already has it), never leak who filed it.
      if (error.code === '23505') return apiOk({ suggested: true, duplicate: true });
      throw new Error(`suggestion insert failed: ${error.message}`);
    }

    return apiOk({ suggested: true }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
