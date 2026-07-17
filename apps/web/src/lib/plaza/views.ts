import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { detectLink, type LinkKind } from '@/lib/embeds';
import { publicMediaUrl } from '@/lib/media/storage';

/**
 * Plaza read models. Routes fetch post/comment rows under the CALLER's RLS
 * (so authors see their own hidden/removed content, mods see everything),
 * then hydrate through the service role:
 *
 *   - authors           profiles are member-visible, but batching via the
 *                       admin client skips N per-row RLS checks
 *   - reaction tallies  reactions are own-rows-only under RLS (§13-style
 *                       "aggregates without enumeration") — counts must come
 *                       from the service role
 *   - poll tallies      ballots are anonymous (Seq 14): counts only, and the
 *                       caller's own ballot is the only row ever echoed back
 *   - comment counts    published comments only
 *
 * Aggregation happens in JS over rows fetched per page (20 posts) with a hard
 * row cap — fine at beta scale; revisit with materialized counters if the
 * Plaza outgrows it.
 */

export const POST_COLUMNS =
  'id, author_user_id, lab_id, type, title, body, link_url, image_urls, ask_status, ask_nudged_at, poll_status, poll_closes_at, status, source, pinned_at, edited_at, created_at';

export const COMMENT_COLUMNS =
  'id, post_id, author_user_id, body, is_credited_answer, status, source, edited_at, created_at';

/** Row-fetch cap for JS-side aggregation (see module doc). */
const AGGREGATE_ROW_CAP = 10_000;

export type ReactionType = Enums<'reaction_type'>;

export const REACTION_TYPES: readonly ReactionType[] = [
  'fire',
  'strong',
  'mashallah',
  'idea',
  'watching',
];

export type ReactionCounts = Record<ReactionType, number>;

export interface PostRow {
  id: string;
  author_user_id: string;
  lab_id: string | null;
  type: Enums<'post_type'>;
  title: string | null;
  body: string;
  link_url: string | null;
  image_urls: string[];
  ask_status: Enums<'ask_status'> | null;
  ask_nudged_at: string | null;
  poll_status: Enums<'poll_status'> | null;
  poll_closes_at: string | null;
  status: Enums<'content_status'>;
  source: Enums<'content_source'>;
  pinned_at: string | null;
  edited_at: string | null;
  created_at: string;
}

export interface CommentRow {
  id: string;
  post_id: string | null;
  author_user_id: string;
  body: string;
  is_credited_answer: boolean;
  status: Enums<'content_status'>;
  source: Enums<'content_source'>;
  edited_at: string | null;
  created_at: string;
}

export interface AuthorRef {
  display_name: string;
  handle: string;
  /** Profile city (member-visible, §22 directory field) — feed bylines render
   *  it when set so every scroll shows the diaspora's geography. */
  location_city: string | null;
}

export interface PollOptionView {
  id: string;
  label: string;
  position: number;
  votes: number;
}

export interface PollView {
  options: PollOptionView[];
  totalVotes: number;
  myOptionId: string | null;
}

/**
 * One post image with its Lite metadata (Phase 4.5): thumb for feed cards,
 * blurhash + alt + bytes for the MediaSlot placeholder. Fields are null for
 * uploads that predate the per-kind pipeline.
 */
export interface PostImageView {
  url: string;
  thumbUrl: string | null;
  alt: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

export interface PostView {
  post: PostRow;
  author: AuthorRef | null;
  /**
   * Public CDN URLs derived from posts.image_urls storage paths.
   * @deprecated Back-compat during the Phase 4.5 transition — new surfaces
   * read `images` (same order, plus thumb/alt/blurhash).
   */
  imageUrls: string[];
  /** Enriched image hydration (posts.image_urls order preserved). */
  images: PostImageView[];
  /** Server-classified link (§15 embed whitelist / interstitial). */
  link: LinkKind | null;
  tags: { id: string; name: string }[];
  commentCount: number;
  reactions: ReactionCounts;
  myReactions: ReactionType[];
  poll: PollView | null;
  /** Whether the VIEWER has bookmarked this post (Phase 4.5 Saved). */
  bookmarked: boolean;
}

export interface CommentView {
  comment: CommentRow;
  author: AuthorRef | null;
  reactions: ReactionCounts;
  myReactions: ReactionType[];
}

export function emptyReactionCounts(): ReactionCounts {
  return { fire: 0, strong: 0, mashallah: 0, idea: 0, watching: 0 };
}

async function fetchAuthors(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, AuthorRef>> {
  const authors = new Map<string, AuthorRef>();
  if (userIds.length === 0) return authors;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, display_name, handle, location_city')
    .in('user_id', userIds);
  if (error) throw new Error(`author hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    authors.set(row.user_id, {
      display_name: row.display_name,
      handle: row.handle,
      location_city: row.location_city ?? null,
    });
  }
  return authors;
}

interface ReactionAggregates {
  counts: Map<string, ReactionCounts>;
  mine: Map<string, ReactionType[]>;
}

async function fetchReactionAggregates(
  admin: SupabaseClient<Database>,
  target: 'post_id' | 'comment_id',
  ids: string[],
  viewerId: string,
): Promise<ReactionAggregates> {
  const counts = new Map<string, ReactionCounts>();
  const mine = new Map<string, ReactionType[]>();
  if (ids.length === 0) return { counts, mine };

  const [countsResult, mineResult] = await Promise.all([
    admin.from('reactions').select(`${target}, type`).in(target, ids).limit(AGGREGATE_ROW_CAP),
    admin.from('reactions').select(`${target}, type`).in(target, ids).eq('user_id', viewerId),
  ]);
  if (countsResult.error) {
    throw new Error(`reaction hydration failed: ${countsResult.error.message}`);
  }
  if (mineResult.error) {
    throw new Error(`own-reaction hydration failed: ${mineResult.error.message}`);
  }

  for (const raw of countsResult.data ?? []) {
    const row = raw as unknown as Record<string, string>;
    const id = row[target];
    const type = row.type as ReactionType | undefined;
    if (!id || !type) continue;
    const bucket = counts.get(id) ?? emptyReactionCounts();
    bucket[type] += 1;
    counts.set(id, bucket);
  }
  for (const raw of mineResult.data ?? []) {
    const row = raw as unknown as Record<string, string>;
    const id = row[target];
    const type = row.type as ReactionType | undefined;
    if (!id || !type) continue;
    mine.set(id, [...(mine.get(id) ?? []), type]);
  }
  return { counts, mine };
}

async function fetchPolls(
  admin: SupabaseClient<Database>,
  pollPostIds: string[],
  viewerId: string,
): Promise<Map<string, PollView>> {
  const polls = new Map<string, PollView>();
  if (pollPostIds.length === 0) return polls;

  const [optionsResult, votesResult, mineResult] = await Promise.all([
    admin
      .from('poll_options')
      .select('id, post_id, label, position')
      .in('post_id', pollPostIds)
      .order('position', { ascending: true }),
    admin
      .from('poll_votes')
      .select('post_id, poll_option_id')
      .in('post_id', pollPostIds)
      .limit(AGGREGATE_ROW_CAP),
    admin
      .from('poll_votes')
      .select('post_id, poll_option_id')
      .in('post_id', pollPostIds)
      .eq('voter_user_id', viewerId),
  ]);
  if (optionsResult.error) throw new Error(`poll options failed: ${optionsResult.error.message}`);
  if (votesResult.error) throw new Error(`poll tallies failed: ${votesResult.error.message}`);
  if (mineResult.error) throw new Error(`own ballot lookup failed: ${mineResult.error.message}`);

  const votesByOption = new Map<string, number>();
  for (const vote of votesResult.data ?? []) {
    votesByOption.set(vote.poll_option_id, (votesByOption.get(vote.poll_option_id) ?? 0) + 1);
  }
  const myVoteByPost = new Map<string, string>();
  for (const vote of mineResult.data ?? []) {
    myVoteByPost.set(vote.post_id, vote.poll_option_id);
  }

  for (const option of optionsResult.data ?? []) {
    const view = polls.get(option.post_id) ?? { options: [], totalVotes: 0, myOptionId: null };
    const votes = votesByOption.get(option.id) ?? 0;
    view.options.push({ id: option.id, label: option.label, position: option.position, votes });
    view.totalVotes += votes;
    view.myOptionId = myVoteByPost.get(option.post_id) ?? null;
    polls.set(option.post_id, view);
  }
  return polls;
}

async function fetchPostTags(
  admin: SupabaseClient<Database>,
  postIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const tagsByPost = new Map<string, { id: string; name: string }[]>();
  if (postIds.length === 0) return tagsByPost;
  const { data, error } = await admin
    .from('post_tags')
    .select('post_id, tags ( id, name )')
    .in('post_id', postIds);
  if (error) throw new Error(`post tags hydration failed: ${error.message}`);
  for (const row of data ?? []) {
    const tag = row.tags as unknown as { id: string; name: string } | null;
    if (!tag) continue;
    tagsByPost.set(row.post_id, [...(tagsByPost.get(row.post_id) ?? []), tag]);
  }
  return tagsByPost;
}

interface PostImageMetaRow {
  post_id: string | null;
  storage_path: string;
  thumb_path: string | null;
  alt_text: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
}

/**
 * Lite metadata for attached images (Phase 4.5), keyed post → storage_path.
 * media_uploads reads are own-rows-only under RLS, so this hydrates through
 * the service role like every other aggregate here; only render-safe fields
 * leave this function (scan verdicts stay server-side).
 */
async function fetchPostImageMeta(
  admin: SupabaseClient<Database>,
  postIds: string[],
): Promise<Map<string, Map<string, PostImageMetaRow>>> {
  const byPost = new Map<string, Map<string, PostImageMetaRow>>();
  if (postIds.length === 0) return byPost;
  const { data, error } = await admin
    .from('media_uploads')
    .select('post_id, storage_path, thumb_path, alt_text, blurhash, width, height, bytes')
    .in('post_id', postIds);
  if (error) throw new Error(`post image hydration failed: ${error.message}`);
  for (const raw of data ?? []) {
    const row = raw as unknown as PostImageMetaRow;
    if (!row.post_id) continue;
    const bucket = byPost.get(row.post_id) ?? new Map<string, PostImageMetaRow>();
    bucket.set(row.storage_path, row);
    byPost.set(row.post_id, bucket);
  }
  return byPost;
}

/** The viewer's bookmarked ids among `postIds` (bookmarks are own-rows under RLS → service role). */
async function fetchViewerBookmarks(
  admin: SupabaseClient<Database>,
  viewerId: string,
  postIds: string[],
): Promise<Set<string>> {
  const bookmarked = new Set<string>();
  if (postIds.length === 0) return bookmarked;
  const { data, error } = await admin
    .from('bookmarks')
    .select('entity_id')
    .eq('user_id', viewerId)
    .eq('entity_type', 'post')
    .in('entity_id', postIds);
  if (error) throw new Error(`bookmark hydration failed: ${error.message}`);
  for (const row of data ?? []) bookmarked.add(row.entity_id);
  return bookmarked;
}

/** The viewer's mutes, bucketed by target type (Phase 4.5 §1f). */
export interface ViewerMutes {
  users: Set<string>;
  tags: Set<string>;
  labs: Set<string>;
}

export async function fetchViewerMutes(
  admin: SupabaseClient<Database>,
  viewerId: string,
): Promise<ViewerMutes> {
  const mutes: ViewerMutes = { users: new Set(), tags: new Set(), labs: new Set() };
  const { data, error } = await admin
    .from('mutes')
    .select('entity_type, entity_id')
    .eq('user_id', viewerId)
    .limit(AGGREGATE_ROW_CAP);
  if (error) throw new Error(`mute lookup failed: ${error.message}`);
  for (const row of data ?? []) {
    if (row.entity_type === 'user') mutes.users.add(row.entity_id);
    else if (row.entity_type === 'tag') mutes.tags.add(row.entity_id);
    else if (row.entity_type === 'lab') mutes.labs.add(row.entity_id);
  }
  return mutes;
}

/**
 * True when the viewer muted this post's author, its Space, or any of its
 * tags. A member's OWN posts are never muted away (you can't hide your own
 * content from yourself by muting a tag you also use).
 */
export function isPostMuted(
  view: Pick<PostView, 'post' | 'tags'>,
  viewerId: string,
  mutes: ViewerMutes,
): boolean {
  const { post, tags } = view;
  if (post.author_user_id === viewerId) return false;
  if (mutes.users.has(post.author_user_id)) return true;
  if (post.lab_id !== null && mutes.labs.has(post.lab_id)) return true;
  return tags.some((tag) => mutes.tags.has(tag.id));
}

async function fetchCommentCounts(
  admin: SupabaseClient<Database>,
  postIds: string[],
): Promise<Map<string, number>> {
  const countByPost = new Map<string, number>();
  if (postIds.length === 0) return countByPost;
  const { data, error } = await admin
    .from('comments')
    .select('post_id')
    .in('post_id', postIds)
    .eq('status', 'published')
    .limit(AGGREGATE_ROW_CAP);
  if (error) throw new Error(`comment counts failed: ${error.message}`);
  for (const row of data ?? []) {
    if (!row.post_id) continue;
    countByPost.set(row.post_id, (countByPost.get(row.post_id) ?? 0) + 1);
  }
  return countByPost;
}

export interface HydratePostsOptions {
  /**
   * Mute filtering (Phase 4.5 §1f): feeds drop posts from muted authors,
   * muted Spaces, and posts carrying muted tags — default ON so every list
   * surface gets it without threading flags. Single-post surfaces (permalink,
   * the author's own PATCH echo) pass false: a mute hides content from FEEDS,
   * it never 404s a direct link.
   */
  applyMuteFilter?: boolean;
}

export async function hydratePosts(
  admin: SupabaseClient<Database>,
  viewerId: string,
  rows: PostRow[],
  options: HydratePostsOptions = {},
): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const { applyMuteFilter = true } = options;

  const postIds = rows.map((row) => row.id);
  const pollPostIds = rows.filter((row) => row.type === 'poll').map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_user_id))];

  const [authors, reactions, polls, commentCounts, tags, imageMeta, bookmarkedIds, mutes] =
    await Promise.all([
      fetchAuthors(admin, authorIds),
      fetchReactionAggregates(admin, 'post_id', postIds, viewerId),
      fetchPolls(admin, pollPostIds, viewerId),
      fetchCommentCounts(admin, postIds),
      fetchPostTags(admin, postIds),
      fetchPostImageMeta(admin, postIds),
      fetchViewerBookmarks(admin, viewerId, postIds),
      applyMuteFilter ? fetchViewerMutes(admin, viewerId) : Promise.resolve(null),
    ]);

  const views = rows.map((post) => ({
    post,
    author: authors.get(post.author_user_id) ?? null,
    imageUrls: post.image_urls.map(publicMediaUrl),
    // posts.image_urls stays the attachment order of record; meta joins by
    // storage path and degrades to nulls for pre-Phase-4.5 uploads.
    images: post.image_urls.map((path): PostImageView => {
      const meta = imageMeta.get(post.id)?.get(path);
      return {
        url: publicMediaUrl(path),
        thumbUrl: meta?.thumb_path ? publicMediaUrl(meta.thumb_path) : null,
        alt: meta?.alt_text ?? null,
        blurhash: meta?.blurhash ?? null,
        width: meta?.width ?? null,
        height: meta?.height ?? null,
        bytes: meta?.bytes ?? null,
      };
    }),
    link: post.link_url ? detectLink(post.link_url) : null,
    tags: tags.get(post.id) ?? [],
    commentCount: commentCounts.get(post.id) ?? 0,
    reactions: reactions.counts.get(post.id) ?? emptyReactionCounts(),
    myReactions: reactions.mine.get(post.id) ?? [],
    poll: polls.get(post.id) ?? null,
    bookmarked: bookmarkedIds.has(post.id),
  }));

  if (!mutes) return views;
  return views.filter((view) => !isPostMuted(view, viewerId, mutes));
}

export async function hydrateComments(
  admin: SupabaseClient<Database>,
  viewerId: string,
  rows: CommentRow[],
): Promise<CommentView[]> {
  if (rows.length === 0) return [];

  const commentIds = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.author_user_id))];

  const [authors, reactions] = await Promise.all([
    fetchAuthors(admin, authorIds),
    fetchReactionAggregates(admin, 'comment_id', commentIds, viewerId),
  ]);

  return rows.map((comment) => ({
    comment,
    author: authors.get(comment.author_user_id) ?? null,
    reactions: reactions.counts.get(comment.id) ?? emptyReactionCounts(),
    myReactions: reactions.mine.get(comment.id) ?? [],
  }));
}
