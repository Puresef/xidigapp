import { after } from 'next/server';
import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser, type AuthContext } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { awardReputation } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { notifyMentions } from '@/lib/notifications/mentions';
import {
  COMMENT_LIMIT_FREE,
  COMMENT_LIMIT_SUPPORTER,
  RATE_WINDOW_DAY_SECONDS,
} from '@/lib/plaza/constants';
import { commentCreateSchema } from '@/lib/plaza/schemas';
import { COMMENT_COLUMNS, hydrateComments, type CommentRow } from '@/lib/plaza/views';
import { scanTextContent } from '@/lib/moderation/scan';
import {
  decodeCursor,
  encodeCursor,
  pageSizeSchema,
  type Cursor,
} from '@/lib/pagination';

/**
 * Post comments (§15 Plaza threads).
 *
 * GET lists in conversation order — created_at ASC, id ASC — the opposite of
 * every feed endpoint, because a thread reads top-to-bottom. Rows come from
 * the CALLER's RLS client (authors see their own hidden/removed comments with
 * the review banner); tallies/authors hydrate via the service role.
 *
 * POST publishes immediately (§15: text is post-publish scanned), enforces
 * the §26 daily comment quota by membership tier, and notifies the post
 * author ('reply', §26 matrix: in-app only).
 */

const paramsSchema = z.object({ id: z.string().uuid() });

function parsePostId(raw: { id: string }): string {
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data.id;
}

const querySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: pageSizeSchema,
});

/**
 * Ascending twin of lib/pagination.ts `keysetBefore` (which encodes the
 * DESC ordering): strictly after the cursor under `created_at asc, id asc`.
 */
function keysetAfter(cursor: Cursor): string {
  return `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`;
}

/** RLS visibility gate: null = the caller can't see this post at all. */
async function loadVisiblePost(
  ctx: AuthContext,
  postId: string,
): Promise<{ id: string; author_user_id: string; status: string } | null> {
  const { data, error } = await ctx.supabase
    .from('posts')
    .select('id, author_user_id, status')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw new Error(`post visibility check failed: ${error.message}`);
  return data;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const postId = parsePostId(await context.params);
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    if (!(await loadVisiblePost(ctx, postId))) throw new ApiError('not_found', 404);

    let query = ctx.supabase
      .from('comments')
      .select(COMMENT_COLUMNS)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(params.limit + 1);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetAfter(cursor));

    const { data, error } = await query;
    if (error) throw new Error(`comments query failed: ${error.message}`);

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

/** §26 quotas key off membership tier; a missing profile row means free. */
async function isSupporter(ctx: AuthContext): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('profiles')
    .select('membership_tier_id')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();
  const tier = data?.membership_tier_id;
  return typeof tier === 'string' && tier.toLowerCase() !== 'free';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const postId = parsePostId(await context.params);
    const input = commentCreateSchema.parse(await request.json());

    // Commenting requires a live post: hidden/removed reads as not-found even
    // to the author. Answered/closed Asks stay commentable (§27).
    const post = await loadVisiblePost(ctx, postId);
    if (!post || post.status !== 'published') throw new ApiError('not_found', 404);

    const supporter = await isSupporter(ctx);
    const withinLimit = await checkRateLimit(`comments:${ctx.appUser.id}`, {
      max: supporter ? COMMENT_LIMIT_SUPPORTER : COMMENT_LIMIT_FREE,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!withinLimit) throw new ApiError('comment_limit', 429);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('comments')
      .insert({
        post_id: postId,
        author_user_id: ctx.appUser.id,
        body: input.body,
      })
      .select(COMMENT_COLUMNS)
      .single();
    if (error) throw new Error(`comment insert failed: ${error.message}`);

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

    // Reply notification (skip self-replies); best-effort, never throws. §26
    // push = replies, so use notify() (in-app row + push).
    if (post.author_user_id !== ctx.appUser.id) {
      await notify(admin, {
        userId: post.author_user_id,
        actorUserId: ctx.appUser.id,
        type: 'reply',
        entityType: 'comment',
        entityId: row.id,
        bundleKey: `reply:${postId}`,
        payload: { postId },
      });
    }

    // @mention notifications (§13). Dedup: the post author already got a
    // `reply`, so skip a duplicate mention ping for them. Plaza is
    // member-visible → no access gate. Link to the post permalink (payload +
    // post entity) so the notification opens the right content.
    const mentioned = await notifyMentions(admin, {
      text: input.body,
      actorUserId: ctx.appUser.id,
      entityType: 'post',
      entityId: postId,
      bundleKey: `mention:post:${postId}`,
      alreadyNotified: new Set([post.author_user_id]),
    });

    emitServer(event('comment_created', { on: 'post' }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });
    // Only when the comment actually mentioned someone (§23 mention_sent).
    if (mentioned.length > 0) {
      emitServer(event('mention_sent', { source: 'comment' }), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }
    await awardReputation(admin, {
      userId: ctx.appUser.id,
      eventType: 'comment_created',
      entityType: 'comment',
      entityId: row.id,
    });

    const [comment] = await hydrateComments(admin, ctx.appUser.id, [row]);
    if (!comment) throw new Error('comment hydration returned no view');

    return apiOk({ comment }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
