import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { requireUser } from '@/lib/auth/guards';
import { LAB_CREATE_LIMIT, RATE_WINDOW_DAY_SECONDS } from '@/lib/labs/constants';
import { labCreateSchema, labListQuerySchema } from '@/lib/labs/schemas';
import { createLab } from '@/lib/labs/service';
import { hydrateLabs, LAB_COLUMNS, type LabRow } from '@/lib/labs/views';
import { isSupporter } from '@/lib/posts-api';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import { checkRateLimit } from '@/lib/rate-limit';
import { BADGE_SLUGS } from '@/lib/reputation/constants';
import { awardBadge } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Labs / Spaces collection (§16). GET is the Discover browse (listed Spaces the
 * caller can read, newest first) with an optional mode filter and a `mine=1`
 * variant (Spaces the caller leads or belongs to). Reads run under the caller's
 * RLS so private/members/public visibility is DB-enforced.
 *
 * POST creates a Space as a Club or a Lab. A Lab requires the create_lab
 * capability (Supporter) — Clubs are free. Validation runs BEFORE any write;
 * inserts go through the service role (no client write policies).
 */

const querySchema = labListQuerySchema.extend({ limit: pageSizeSchema });

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const admin = getSupabaseAdmin();

    let query = ctx.supabase
      .from('labs')
      .select(LAB_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);

    if (params.mine === '1') {
      // Spaces the caller belongs to (lead or active member).
      const { data: memberships, error } = await admin
        .from('lab_members')
        .select('lab_id')
        .eq('user_id', ctx.appUser.id)
        .eq('status', 'active');
      if (error) throw new Error(`membership scan failed: ${error.message}`);
      const ids = (memberships ?? []).map((m) => m.lab_id);
      if (ids.length === 0) return apiOk({ items: [], nextCursor: null });
      query = query.in('id', ids);
    } else {
      query = query.eq('is_listed', true);
    }

    if (params.mode) query = query.eq('space_mode', params.mode);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`labs query failed: ${error.message}`);

    const rows = (data ?? []) as LabRow[];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    const items = await hydrateLabs(admin, ctx.appUser.id, page);
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = labCreateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // Creating a Lab needs a Supporter membership (§27); a Club is free.
    if (input.mode === 'lab' && !(await isSupporter(ctx))) {
      throw new ApiError('not_supporter', 403);
    }

    const allowed = await checkRateLimit(`labs:create:${ctx.appUser.id}`, {
      max: LAB_CREATE_LIMIT,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!allowed) throw new ApiError('rate_limited', 429);

    // Validate referenced tags before writing.
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (tagIds.length > 0) {
      const { data: tags, error } = await admin.from('tags').select('id').in('id', tagIds);
      if (error) throw new Error(`tag validation failed: ${error.message}`);
      if ((tags ?? []).length !== tagIds.length) throw new ApiError('tag_invalid', 400);
    }

    // §16 playbook: validate the referenced starter exists + is active.
    if (input.mode === 'lab' && input.playbookId) {
      const { data: playbook, error } = await admin
        .from('lab_playbooks')
        .select('id')
        .eq('id', input.playbookId)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw new Error(`playbook validation failed: ${error.message}`);
      if (!playbook) throw new ApiError('playbook_invalid', 400);
    }

    const lab = await createLab(admin, ctx.appUser.id, input);

    emitServer(event('lab_created', { mode: lab.space_mode }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });
    // The creator is the Lab Lead (§20 milestone badge).
    await awardBadge(admin, { userId: ctx.appUser.id, slug: BADGE_SLUGS.labLead });

    const [view] = await hydrateLabs(admin, ctx.appUser.id, [lab]);
    return apiOk({ lab: view }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
