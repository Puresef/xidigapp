import { after } from 'next/server';
import { z } from 'zod';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { scanTextContent } from '@/lib/moderation/scan';
import { notifyMentions } from '@/lib/notifications/mentions';
import { decodeCursor, encodeCursor, keysetBefore, pageSizeSchema } from '@/lib/pagination';
import {
  POST_LIMIT_FREE,
  POST_LIMIT_SUPPORTER,
  RATE_WINDOW_DAY_SECONDS,
} from '@/lib/plaza/constants';
import { feedQuerySchema, postCreateSchema } from '@/lib/plaza/schemas';
import { hydratePosts, POST_COLUMNS } from '@/lib/plaza/views';
import { hydrateOnePost, isSupporter, postScanText } from '@/lib/posts-api';
import { checkRateLimit } from '@/lib/rate-limit';
import { awardReputation } from '@/lib/reputation/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { TablesInsert } from '@xidig/db';

/**
 * Global Plaza feed (§15). GET is chronological (created_at desc keyset) with
 * an optional post-type filter, plus a `?pinned=1` variant serving the weekly
 * highlights slot (≤3 pinned posts). Reads run under the caller's RLS;
 * hydration (authors, reaction tallies, poll counts) via the service role.
 *
 * POST creates one of the five §15 post types. Everything is validated BEFORE
 * any write; inserts go through the service role (no client write policies —
 * pre-scan + rate limits are API obligations), and the §15 AI text pre-scan
 * runs fire-and-forget after the response.
 */

const querySchema = feedQuerySchema.extend({
  pinned: z.string().optional(),
  limit: pageSizeSchema,
});

const PINNED_SLOTS = 3;

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const admin = getSupabaseAdmin();

    if (params.pinned === '1') {
      const { data, error } = await ctx.supabase
        .from('posts')
        .select(POST_COLUMNS)
        .not('pinned_at', 'is', null)
        .eq('status', 'published')
        .is('lab_id', null)
        .order('pinned_at', { ascending: false })
        .limit(PINNED_SLOTS);
      if (error) throw new Error(`pinned posts query failed: ${error.message}`);

      const items = await hydratePosts(admin, ctx.appUser.id, data ?? []);
      return apiOk({ items });
    }

    let query = ctx.supabase
      .from('posts')
      .select(POST_COLUMNS)
      .eq('status', 'published')
      .is('lab_id', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(params.limit + 1);

    if (params.type) query = query.eq('type', params.type);

    const cursor = decodeCursor(params.cursor);
    if (cursor) query = query.or(keysetBefore(cursor, 'id'));

    const { data, error } = await query;
    if (error) throw new Error(`feed query failed: ${error.message}`);

    const rows = data ?? [];
    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

    const items = await hydratePosts(admin, ctx.appUser.id, page);
    return apiOk({ items, nextCursor });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = postCreateSchema.parse(await request.json());
    const admin = getSupabaseAdmin();

    // §26/§27 daily post cap by tier; the copy is post_limit's, not the
    // generic rate_limited, so check-then-throw instead of enforceRateLimit.
    const supporter = await isSupporter(ctx);
    const allowed = await checkRateLimit(`posts:${ctx.appUser.id}`, {
      max: supporter ? POST_LIMIT_SUPPORTER : POST_LIMIT_FREE,
      windowSeconds: RATE_WINDOW_DAY_SECONDS,
    });
    if (!allowed) throw new ApiError('post_limit', 429);

    // Validate every referenced row BEFORE writing anything.
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (tagIds.length > 0) {
      const { data: tags, error } = await admin.from('tags').select('id').in('id', tagIds);
      if (error) throw new Error(`tag validation failed: ${error.message}`);
      if ((tags ?? []).length !== tagIds.length) throw new ApiError('tag_invalid', 400);
    }

    const imageIds = [...new Set(input.imageIds ?? [])];
    const imagePaths: string[] = [];
    if (imageIds.length > 0) {
      const { data: media, error } = await admin
        .from('media_uploads')
        .select('id, owner_user_id, post_id, scan_status, storage_path')
        .in('id', imageIds);
      if (error) throw new Error(`media validation failed: ${error.message}`);

      const byId = new Map((media ?? []).map((row) => [row.id, row]));
      for (const id of imageIds) {
        const row = byId.get(id);
        const usable =
          row &&
          row.owner_user_id === ctx.appUser.id &&
          row.post_id === null &&
          (row.scan_status === 'passed' ||
            row.scan_status === 'uncertain' ||
            row.scan_status === 'skipped');
        if (!usable) throw new ApiError('media_not_ready', 409);
        imagePaths.push(row.storage_path);
      }
    }

    const insert: TablesInsert<'posts'> = {
      author_user_id: ctx.appUser.id,
      type: input.type,
      title: input.title ?? null,
      body: input.body,
      link_url: input.linkUrl ?? null,
      image_urls: imagePaths,
    };
    if (input.type === 'ask') insert.ask_status = 'open';
    if (input.type === 'poll') {
      insert.poll_status = 'open';
      insert.poll_closes_at = new Date(
        Date.now() + input.closesInDays * 86_400_000,
      ).toISOString();
    }

    const { data: post, error: insertError } = await admin
      .from('posts')
      .insert(insert)
      .select(POST_COLUMNS)
      .single();
    if (insertError || !post) {
      throw new Error(`post insert failed: ${insertError?.message ?? 'no row returned'}`);
    }

    // Attach tags / poll options / media. If any of these fail the post is
    // torn down (best-effort) so no half-created post lingers in the feed.
    try {
      if (tagIds.length > 0) {
        const { error } = await admin
          .from('post_tags')
          .insert(tagIds.map((tagId) => ({ post_id: post.id, tag_id: tagId })));
        if (error) throw new Error(`post tags insert failed: ${error.message}`);
      }

      if (input.type === 'poll') {
        const { error } = await admin.from('poll_options').insert(
          input.options.map((label, index) => ({
            post_id: post.id,
            label,
            position: index,
          })),
        );
        if (error) throw new Error(`poll options insert failed: ${error.message}`);
      }

      if (imageIds.length > 0) {
        const { error } = await admin
          .from('media_uploads')
          .update({ post_id: post.id })
          .in('id', imageIds);
        if (error) throw new Error(`media attach failed: ${error.message}`);
      }
    } catch (writeError) {
      await admin
        .from('posts')
        .delete()
        .eq('id', post.id)
        .then(({ error }) => {
          if (error) console.error('[posts] rollback delete failed:', error.message);
        });
      throw writeError;
    }

    after(() =>
      scanTextContent(admin, {
        entityType: 'post',
        entityId: post.id,
        authorUserId: ctx.appUser.id,
        text: postScanText(input.title, input.body),
      }),
    );

    // @mention notifications (§13). Plaza posts are member-visible, so no
    // access gate; parse title + body. Best-effort, post-response.
    after(() =>
      notifyMentions(admin, {
        text: `${input.title ?? ''} ${input.body}`,
        actorUserId: ctx.appUser.id,
        entityType: 'post',
        entityId: post.id,
        bundleKey: `mention:post:${post.id}`,
      }),
    );

    emitServer(event('post_created', { type: input.type }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });
    await awardReputation(admin, {
      userId: ctx.appUser.id,
      eventType: 'post_created',
      entityType: 'post',
      entityId: post.id,
    });

    const view = await hydrateOnePost(admin, ctx.appUser.id, post);
    return apiOk({ post: view }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
