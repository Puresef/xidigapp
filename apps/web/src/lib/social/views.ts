import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import type { AuthContext } from '@/lib/auth/guards';
import { hydrateLabs, LAB_COLUMNS, type LabRow, type LabView } from '@/lib/labs/views';
import { getMemberListingView, type ListingView } from '@/lib/listing-view';
import { hydratePosts, POST_COLUMNS, type PostRow, type PostView } from '@/lib/plaza/views';

import type { BookmarkEntityType, MuteEntityType } from './entities';

/**
 * Read models for the Saved page and the mutes management UI (Phase 4.5).
 * Bookmark/mute rows are own-rows under RLS; the referenced entities hydrate
 * through the SAME view helpers their home surfaces use (posts via
 * lib/plaza/views, listings via lib/listing-view, labs via lib/labs/views) so
 * cards render identically everywhere. Entities the caller can no longer read
 * (deleted, made private) are silently dropped from the page — the bookmark
 * row itself is harmless and stays.
 */

export interface BookmarkRow {
  entity_type: string;
  entity_id: string;
  created_at: string;
}

export interface CandidateRef {
  id: string;
  name: string;
  one_liner: string | null;
  status: string;
}

export interface BookmarkItem {
  entityType: BookmarkEntityType;
  entityId: string;
  createdAt: string;
  post?: PostView;
  listing?: ListingView;
  lab?: LabView;
  candidate?: CandidateRef;
}

function idsOfType(rows: BookmarkRow[], type: BookmarkEntityType): string[] {
  return rows.filter((row) => row.entity_type === type).map((row) => row.entity_id);
}

export async function hydrateBookmarks(
  ctx: AuthContext,
  admin: SupabaseClient<Database>,
  rows: BookmarkRow[],
): Promise<BookmarkItem[]> {
  if (rows.length === 0) return [];

  const postIds = idsOfType(rows, 'post');
  const listingIds = idsOfType(rows, 'listing');
  const labIds = idsOfType(rows, 'lab');
  const candidateIds = idsOfType(rows, 'candidate');

  const [postViews, listingViews, labViews, candidateRefs] = await Promise.all([
    (async (): Promise<Map<string, PostView>> => {
      const map = new Map<string, PostView>();
      if (postIds.length === 0) return map;
      // Caller's RLS decides which posts are still visible.
      const { data, error } = await ctx.supabase
        .from('posts')
        .select(POST_COLUMNS)
        .in('id', postIds);
      if (error) throw new Error(`bookmarked posts lookup failed: ${error.message}`);
      // No mute filter: a bookmark is an explicit "keep this" — it always shows.
      const views = await hydratePosts(admin, ctx.appUser.id, (data ?? []) as PostRow[], {
        applyMuteFilter: false,
      });
      for (const view of views) map.set(view.post.id, view);
      return map;
    })(),
    (async (): Promise<Map<string, ListingView>> => {
      const map = new Map<string, ListingView>();
      const views = await Promise.all(
        listingIds.map((id) => getMemberListingView(ctx.supabase, id)),
      );
      for (const view of views) {
        if (view) map.set(view.listing.id, view);
      }
      return map;
    })(),
    (async (): Promise<Map<string, LabView>> => {
      const map = new Map<string, LabView>();
      if (labIds.length === 0) return map;
      const { data, error } = await ctx.supabase.from('labs').select(LAB_COLUMNS).in('id', labIds);
      if (error) throw new Error(`bookmarked labs lookup failed: ${error.message}`);
      const views = await hydrateLabs(admin, ctx.appUser.id, (data ?? []) as LabRow[]);
      for (const view of views) map.set(view.lab.id, view);
      return map;
    })(),
    (async (): Promise<Map<string, CandidateRef>> => {
      const map = new Map<string, CandidateRef>();
      if (candidateIds.length === 0) return map;
      const { data, error } = await ctx.supabase
        .from('venture_candidates')
        .select('id, name, one_liner, status')
        .in('id', candidateIds);
      if (error) throw new Error(`bookmarked candidates lookup failed: ${error.message}`);
      for (const row of data ?? []) map.set(row.id, row as CandidateRef);
      return map;
    })(),
  ]);

  const items: BookmarkItem[] = [];
  for (const row of rows) {
    const base = {
      entityType: row.entity_type as BookmarkEntityType,
      entityId: row.entity_id,
      createdAt: row.created_at,
    };
    switch (row.entity_type) {
      case 'post': {
        const post = postViews.get(row.entity_id);
        if (post) items.push({ ...base, post });
        break;
      }
      case 'listing': {
        const listing = listingViews.get(row.entity_id);
        if (listing) items.push({ ...base, listing });
        break;
      }
      case 'lab': {
        const lab = labViews.get(row.entity_id);
        if (lab) items.push({ ...base, lab });
        break;
      }
      case 'candidate': {
        const candidate = candidateRefs.get(row.entity_id);
        if (candidate) items.push({ ...base, candidate });
        break;
      }
    }
  }
  return items;
}

// --- mutes -------------------------------------------------------------------

export interface MuteItem {
  entityType: MuteEntityType;
  entityId: string;
  createdAt: string;
  /** Display name / tag name / Space name. */
  label: string;
  /** user mutes only — profile link. */
  handle: string | null;
  /** lab mutes only — Space link. */
  slug: string | null;
}

interface MuteRow {
  entity_type: string;
  entity_id: string;
  created_at: string;
}

/**
 * Attach display labels to mute rows. Hydration runs through the service role
 * on purpose: you must be able to SEE your mute list (and unmute) even when
 * the muted Space has since gone private — only name-level fields ever leave.
 */
export async function hydrateMutes(
  admin: SupabaseClient<Database>,
  rows: MuteRow[],
): Promise<MuteItem[]> {
  if (rows.length === 0) return [];

  const userIds = rows.filter((r) => r.entity_type === 'user').map((r) => r.entity_id);
  const tagIds = rows.filter((r) => r.entity_type === 'tag').map((r) => r.entity_id);
  const labIds = rows.filter((r) => r.entity_type === 'lab').map((r) => r.entity_id);

  const [usersResult, tagsResult, labsResult] = await Promise.all([
    userIds.length > 0
      ? admin.from('profiles').select('user_id, display_name, handle').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    tagIds.length > 0
      ? admin.from('tags').select('id, name').in('id', tagIds)
      : Promise.resolve({ data: [], error: null }),
    labIds.length > 0
      ? admin.from('labs').select('id, name, slug').in('id', labIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (usersResult.error) throw new Error(`muted users lookup failed: ${usersResult.error.message}`);
  if (tagsResult.error) throw new Error(`muted tags lookup failed: ${tagsResult.error.message}`);
  if (labsResult.error) throw new Error(`muted labs lookup failed: ${labsResult.error.message}`);

  const users = new Map(
    (usersResult.data ?? []).map((row) => [
      row.user_id,
      { label: row.display_name, handle: row.handle },
    ]),
  );
  const tags = new Map((tagsResult.data ?? []).map((row) => [row.id, row.name]));
  const labs = new Map(
    (labsResult.data ?? []).map((row) => [row.id, { label: row.name, slug: row.slug }]),
  );

  const items: MuteItem[] = [];
  for (const row of rows) {
    const base = {
      entityType: row.entity_type as MuteEntityType,
      entityId: row.entity_id,
      createdAt: row.created_at,
      handle: null,
      slug: null,
    };
    if (row.entity_type === 'user') {
      const user = users.get(row.entity_id);
      if (user) items.push({ ...base, label: user.label, handle: user.handle });
    } else if (row.entity_type === 'tag') {
      const name = tags.get(row.entity_id);
      if (name) items.push({ ...base, label: name });
    } else if (row.entity_type === 'lab') {
      const lab = labs.get(row.entity_id);
      if (lab) items.push({ ...base, label: lab.label, slug: lab.slug });
    }
  }
  return items;
}
