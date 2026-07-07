import { after } from 'next/server';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadCandidateForViewer, parseCandidateId } from '@/lib/capital/candidates-api';
import {
  COMMENT_LIMIT_FREE,
  COMMENT_LIMIT_SUPPORTER,
  RATE_WINDOW_DAY_SECONDS,
} from '@/lib/plaza/constants';
import { commentCreateSchema } from '@/lib/plaza/schemas';
import { COMMENT_COLUMNS, hydrateComments, type CommentRow } from '@/lib/plaza/views';
import { isSupporter } from '@/lib/posts-api';
import { scanTextContent } from '@/lib/moderation/scan';
import { notifyMentions } from '@/lib/notifications/mentions';
import { insertNotification } from '@/lib/notifications/notify';
import {
  decodeCursor,
  encodeCursor,
  pageSizeSchema,
  type Cursor,
} from '@/lib/pagination';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { z } from 'zod';

/**
 * Open member comments on a candidate (§12/§17 — open discussion, NOT Phase 6
 * moderation). Reuses the Phase 2 comments table with a candidate_id target
 * instead of post_id. Anyone who can_read_candidate may read + comment; RLS on
 * comments enforces candidate readability, and writes stay API-only (service
 * role) with the same §15 post-publish text scan as Plaza.
 *
 * GET lists in conversation order (created_at ASC, id ASC). POST publishes
 * immediately, enforces the §26 daily comment quota, and notifies the candidate
 * creator (in-app only, like Lab activity) plus @mentions.
 */

interface Ctx {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({ cursor: z.string().max(512).optional(), limit: pageSizeSchema });

/** Ascending keyset twin (strictly after the cursor under created_at asc, id asc). */
function keysetAfter(cursor: Cursor): string {
  return `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;
}

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    // Readability gate: a candidate the caller can't read is a plain 404.
    await loadCandidateForViewer(ctx, id);

    let query = ctx.supabase
      .from('comments')
      .select(COMMENT_COLUMNS)
      .eq('candidate_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(params.limit + 1);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetAfter(cursor));

    const { data, error } = await query;
    if (error) throw new Error(`candidate comments query failed: ${error.message}`);

    const rows = (data ?? []) as unknown as CommentRow[];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    const items = await hydrateComments(getSupabaseAdmin(), ctx.appUser.id, page);
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const ctx = await requireUser();
    const id = parseCandidateId((await context.params).id);
    const input = commentCreateSchema.parse(await request.json());

    const cand = await loadCandidateForViewer(ctx, id);

    const supporter = await isSupporter(ctx);
    const withinLimit = await checkRateLimit(`comments:${ctx.appUser.id}`, {
      max: supporter ? COMMENT_LIMIT_SUPPORTER : COMMENT_LIMIT_FREE,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!withinLimit) throw new ApiError('comment_limit', 429);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('comments')
      .insert({ candidate_id: id, author_user_id: ctx.appUser.id, body: input.body })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) throw new Error(`candidate comment insert failed: ${error.message}`);

    const row = data as unknown as CommentRow;

    // §15 post-publish scan — fire-and-forget after the response.
    after(() =>
      scanTextContent(admin, {
        entityType: 'comment',
        entityId: row.id,
        authorUserId: ctx.appUser.id,
        text: input.body,
      }),
    );

    // Notify the candidate creator (skip self); Capital activity is in-app only
    // (like Lab activity, §26) → insertNotification, not push.
    if (cand.created_by_user_id !== ctx.appUser.id) {
      await insertNotification(admin, {
        userId: cand.created_by_user_id,
        actorUserId: ctx.appUser.id,
        type: 'reply',
        entityType: 'comment',
        entityId: row.id,
        bundleKey: `reply:candidate:${id}`,
        payload: { candidateId: id },
      });
    }

    // @mention pings (§13); dedup the creator who already got a reply.
    await notifyMentions(admin, {
      text: input.body,
      actorUserId: ctx.appUser.id,
      entityType: 'candidate',
      entityId: id,
      bundleKey: `mention:candidate:${id}`,
      alreadyNotified: new Set([cand.created_by_user_id]),
    });

    const [comment] = await hydrateComments(admin, ctx.appUser.id, [row]);
    if (!comment) throw new Error('candidate comment hydration returned no view');
    return apiOk({ comment }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
