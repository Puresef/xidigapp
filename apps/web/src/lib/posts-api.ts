import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/guards';
import { hydratePosts, POST_COLUMNS, type PostRow, type PostView } from '@/lib/plaza/views';

/**
 * Small shared helpers for the /api/posts* route family. Reads go through the
 * CALLER's RLS client (authors see their own hidden/removed posts, mods see
 * everything); hydration and privileged writes use the service role after the
 * route has done its own authz checks.
 */

const postIdSchema = z.string().uuid();

/** Invalid uuid → 404 (don't leak that the path shape was the problem). */
export function parsePostId(raw: string): string {
  const parsed = postIdSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError('not_found', 404);
  return parsed.data;
}

/** RLS-scoped single-post load; whatever RLS hides is a plain 404. */
export async function loadPostForViewer(ctx: AuthContext, id: string): Promise<PostRow> {
  const { data, error } = await ctx.supabase
    .from('posts')
    .select(POST_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`post lookup failed: ${error.message}`);
  if (!data) throw new ApiError('not_found', 404);
  return data;
}

export async function hydrateOnePost(
  admin: SupabaseClient<Database>,
  viewerId: string,
  row: PostRow,
): Promise<PostView> {
  // No mute filter on single-post surfaces: a mute hides content from FEEDS
  // only — permalinks and the caller's own action echoes must still resolve.
  const [view] = await hydratePosts(admin, viewerId, [row], { applyMuteFilter: false });
  if (!view) throw new Error('post hydration produced no view');
  return view;
}

/** §26 RBAC: admins inherit mod powers (mirrors requireRole('mod')). */
export function isModOrAdmin(ctx: AuthContext): boolean {
  return ctx.appUser.role === 'mod' || ctx.appUser.role === 'admin';
}

/** §26 tier check: any non-free membership tier gets the Supporter limits. */
export async function isSupporter(ctx: AuthContext): Promise<boolean> {
  const { data } = await ctx.supabase
    .from('profiles')
    .select('membership_tier_id')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();
  return (data?.membership_tier_id ?? 'free').toLowerCase() !== 'free';
}

/** The text blob the AI pre-scan judges (§15): title + body when both exist. */
export function postScanText(title: string | null | undefined, body: string): string {
  return [title, body].filter(Boolean).join('\n\n');
}
