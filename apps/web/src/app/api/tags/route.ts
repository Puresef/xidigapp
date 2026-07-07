import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { RATE_WINDOW_DAY_SECONDS, TAG_CREATES_PER_DAY } from '@/lib/plaza/constants';
import { tagCreateSchema, tagNameSchema } from '@/lib/plaza/schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Tags (§15 member-created taxonomy). Names are citext and format-checked in
 * the DB (`tags_name_format`) — the API normalizes through tagNameSchema so a
 * bad name is a friendly tag_invalid, not a CHECK-violation 500. Creation is
 * capacity-limited per member; a name collision returns the existing tag
 * (create is effectively idempotent).
 */

const querySchema = z.object({
  q: z.string().trim().toLowerCase().min(1).max(60).optional(),
});

const TAG_LIST_MAX = 200;

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    let query = ctx.supabase
      .from('tags')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(TAG_LIST_MAX);
    if (params.q) {
      // Prefix match; strip ILIKE wildcards (tag names are [a-z0-9-] anyway).
      const prefix = params.q.replace(/[%_\\]/g, '');
      if (prefix.length > 0) query = query.ilike('name', `${prefix}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`tags query failed: ${error.message}`);

    return apiOk({ tags: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = tagCreateSchema.parse(await request.json());

    const normalized = tagNameSchema.safeParse(input.name);
    if (!normalized.success) throw new ApiError('tag_invalid', 400);
    const name = normalized.data;

    // tag_limit has its own §27 copy, so check-then-throw (not enforceRateLimit).
    const allowed = await checkRateLimit(`tags:${ctx.appUser.id}`, {
      max: TAG_CREATES_PER_DAY,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!allowed) throw new ApiError('tag_limit', 429);

    const admin = getSupabaseAdmin();
    const { data: tag, error } = await admin
      .from('tags')
      .insert({ name, created_by_user_id: ctx.appUser.id })
      .select('id, name')
      .single();

    if (error) {
      // 23505 = name already exists (citext unique) → return the existing tag.
      if (error.code === '23505') {
        const { data: existing, error: lookupError } = await admin
          .from('tags')
          .select('id, name')
          .eq('name', name)
          .maybeSingle();
        if (lookupError || !existing) {
          throw new Error(`tag lookup failed: ${lookupError?.message ?? 'no row'}`);
        }
        return apiOk({ tag: existing });
      }
      // 23514 = tags_name_format CHECK — belt-and-braces behind tagNameSchema.
      if (error.code === '23514') throw new ApiError('tag_invalid', 400);
      throw new Error(`tag insert failed: ${error.message}`);
    }

    return apiOk({ tag }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
