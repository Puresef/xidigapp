import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Skill autocomplete (count-guided). Returns matching vocabulary entries with
 * their live member_count, most-popular first — so the picker can show
 * "ecommerce · 10k" next to "e-com · 1" and members converge on the canonical
 * token. Read-only: new skills are coined when a profile is saved (the
 * profiles.skills trigger), not here. Search failures never block typing.
 */
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

const querySchema = z.object({
  q: z.string().trim().toLowerCase().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('skills')
      .select('name, member_count')
      .order('member_count', { ascending: false })
      .order('name', { ascending: true })
      .limit(params.limit ?? DEFAULT_LIMIT);

    if (params.q) {
      // Substring match (multi-word skills), wildcards stripped.
      const term = params.q.replace(/[%_\\]/g, '');
      if (term.length > 0) query = query.ilike('name', `%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`skills query failed: ${error.message}`);

    return apiOk({ skills: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
