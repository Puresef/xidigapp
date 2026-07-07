import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import type { ListingRow } from '@/components/suuq/listing-card';
import { hydratePosts, POST_COLUMNS, type PostRow, type PostView } from '@/lib/plaza/views';
import {
  attachAuthors,
  UPDATE_COLUMNS,
  type AuthorRef,
  type UpdateRow,
} from '@/lib/labs/views';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';

import type {
  FeedItem,
  FeedSourceRow,
  LabUpdateFeedItem,
  ListingFeedItem,
  PostFeedItem,
} from './types';

/**
 * Following-feed hydration (§13). The `following_feed` view (security_invoker)
 * has already ORDERED and PRIVACY-FILTERED the rows under the CALLER's RLS —
 * private-lab updates, hidden/removed content, and the caller's muted/blocked
 * sources never appear in `sourceRows`. This module hydrates each surviving row
 * into a rich card view.
 *
 * VISIBILITY: base rows (posts / lab_updates) are re-fetched under the caller's
 * RLS (`caller` = ctx.supabase) so nothing re-widens what the view narrowed —
 * a row the view yielded but that RLS would now hide (e.g. status changed) is
 * simply dropped. Only the CROSS-USER AGGREGATES (author profiles, reaction /
 * poll tallies, listing photos) use the service role, exactly like /api/posts
 * and the lab-updates route. Listings are hydrated from the following_listings
 * view (also caller-RLS) for their card columns.
 *
 * The assembly step (assembleFeed) is a pure function over the hydrated maps +
 * the ordered source rows, so it is unit-testable without a database.
 */

/** Columns needed to render a listing card in the feed (mirrors LISTING_COLUMNS-lite). */
const FEED_LISTING_FIELDS =
  'id, owner_user_id, business_name, category_id, short_description, address, landmark, latitude, longitude, city, country, contact_links, verification_status, status, created_at, price_range, opening_hours, primary_photo_path, primary_photo_blurhash, primary_photo_alt, photo_count';

interface FeedListingSourceRow {
  id: string;
  owner_user_id: string | null;
  business_name: string;
  category_id: string;
  short_description: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  country: string | null;
  contact_links: unknown;
  verification_status: string;
  status: string;
  created_at: string;
  price_range: number | null;
  opening_hours: unknown;
  primary_photo_path: string | null;
  primary_photo_blurhash: string | null;
  primary_photo_alt: string | null;
  photo_count: number | null;
}

/** Minimal Space row the lab-update card needs (name/slug/mode). */
interface LabRefRow {
  id: string;
  slug: string;
  name: string;
  space_mode: 'club' | 'lab';
}

/** Map a following_listings source row into the ListingCard's optional-column shape. */
export function toListingRow(row: FeedListingSourceRow): ListingRow {
  const thumb = row.primary_photo_path ? derivedThumbPath(row.primary_photo_path) : null;
  return {
    id: row.id,
    owner_user_id: row.owner_user_id,
    business_name: row.business_name,
    category_id: row.category_id,
    short_description: row.short_description,
    address: row.address,
    landmark: row.landmark,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city,
    country: row.country,
    contact_links: row.contact_links,
    verification_status: row.verification_status,
    status: row.status,
    created_at: row.created_at,
    price_range: row.price_range,
    opening_hours: row.opening_hours,
    primary_photo_url: row.primary_photo_path ? publicMediaUrl(row.primary_photo_path) : null,
    primary_photo_thumb_url: thumb ? publicMediaUrl(thumb) : null,
    primary_photo_blurhash: row.primary_photo_blurhash,
    primary_photo_alt: row.primary_photo_alt,
    photo_count: row.photo_count ?? 0,
  };
}

/**
 * Assemble hydrated per-type maps back into feed order (pure — unit-testable).
 * A source row whose base row didn't hydrate (RLS re-drop, or a view/base race)
 * is skipped, so the feed never renders a broken card.
 */
export function assembleFeed(
  sourceRows: FeedSourceRow[],
  posts: Map<string, PostView>,
  labUpdates: Map<string, LabUpdateFeedItem['update']>,
  listings: Map<string, ListingFeedItem>,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (const row of sourceRows) {
    if (row.item_type === 'post') {
      const view = posts.get(row.item_id);
      if (view) items.push({ type: 'post', sortTs: row.sort_ts, view } satisfies PostFeedItem);
    } else if (row.item_type === 'lab_update') {
      const update = labUpdates.get(row.item_id);
      if (update)
        items.push({ type: 'lab_update', sortTs: row.sort_ts, update } satisfies LabUpdateFeedItem);
    } else if (row.item_type === 'listing') {
      const item = listings.get(row.item_id);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * Hydrate the ordered source rows into rich feed items. `caller` reads base
 * rows under the caller's RLS; `admin` hydrates cross-user aggregates only.
 */
export async function hydrateFeed(
  caller: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  viewerId: string,
  sourceRows: FeedSourceRow[],
): Promise<FeedItem[]> {
  const postIds = sourceRows.filter((r) => r.item_type === 'post').map((r) => r.item_id);
  const updateIds = sourceRows.filter((r) => r.item_type === 'lab_update').map((r) => r.item_id);
  const listingIds = sourceRows.filter((r) => r.item_type === 'listing').map((r) => r.item_id);

  const [postViews, updateItems, listingItems] = await Promise.all([
    hydratePostItems(caller, admin, viewerId, postIds),
    hydrateLabUpdateItems(caller, admin, updateIds),
    hydrateListingItems(caller, admin, listingIds),
  ]);

  return assembleFeed(sourceRows, postViews, updateItems, listingItems);
}

async function hydratePostItems(
  caller: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  viewerId: string,
  ids: string[],
): Promise<Map<string, PostView>> {
  const byId = new Map<string, PostView>();
  if (ids.length === 0) return byId;
  const { data, error } = await caller.from('posts').select(POST_COLUMNS).in('id', ids);
  if (error) throw new Error(`feed post read failed: ${error.message}`);
  // The view already applied the caller's mute filter, so don't re-drop here
  // (applyMuteFilter:false) — that also keeps the caller's own posts if a
  // followed relationship ever surfaces one.
  const views = await hydratePosts(admin, viewerId, (data ?? []) as PostRow[], {
    applyMuteFilter: false,
  });
  for (const view of views) byId.set(view.post.id, view);
  return byId;
}

async function hydrateLabUpdateItems(
  caller: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, LabUpdateFeedItem['update']>> {
  const byId = new Map<string, LabUpdateFeedItem['update']>();
  if (ids.length === 0) return byId;

  const { data, error } = await caller.from('lab_updates').select(UPDATE_COLUMNS).in('id', ids);
  if (error) throw new Error(`feed lab-update read failed: ${error.message}`);
  const rows = (data ?? []) as UpdateRow[];
  if (rows.length === 0) return byId;

  const labIds = [...new Set(rows.map((r) => r.lab_id))];
  const withAuthors = await attachAuthors(admin, rows, 'author_user_id');

  // Space name/slug/mode for the card chrome + permalink (service role: labs
  // metadata is member-visible, and these ids already passed the caller's RLS
  // via lab_updates_select_readable in the view).
  const labs = new Map<string, LabRefRow>();
  const { data: labData, error: labError } = await admin
    .from('labs')
    .select('id, slug, name, space_mode')
    .in('id', labIds);
  if (labError) throw new Error(`feed lab-ref read failed: ${labError.message}`);
  for (const lab of labData ?? []) labs.set(lab.id, lab as unknown as LabRefRow);

  for (const row of withAuthors) {
    const lab = labs.get(row.lab_id);
    const author = (row as { author: AuthorRef | null }).author;
    byId.set(row.id, {
      id: row.id,
      labId: row.lab_id,
      labSlug: lab?.slug ?? null,
      labName: lab?.name ?? '',
      spaceMode: lab?.space_mode ?? 'lab',
      title: row.title,
      body: row.body,
      isCrossPost: row.collaboration_id !== null,
      createdAt: row.created_at,
      author: author ? { display_name: author.display_name, handle: author.handle } : null,
    });
  }
  return byId;
}

async function hydrateListingItems(
  caller: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  ids: string[],
): Promise<Map<string, ListingFeedItem>> {
  const byId = new Map<string, ListingFeedItem>();
  if (ids.length === 0) return byId;

  // Read listing card columns under the caller's RLS (published + own + mod).
  const { data, error } = await caller
    .from('business_listings')
    .select(FEED_LISTING_FIELDS)
    .in('id', ids);
  if (error) throw new Error(`feed listing read failed: ${error.message}`);
  const rows = (data ?? []) as unknown as FeedListingSourceRow[];
  if (rows.length === 0) return byId;

  // Owner bylines: profiles are member-visible; batch via service role.
  const ownerIds = [...new Set(rows.map((r) => r.owner_user_id).filter(Boolean))] as string[];
  const owners = new Map<string, { display_name: string; handle: string }>();
  if (ownerIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from('profiles')
      .select('user_id, display_name, handle')
      .in('user_id', ownerIds);
    if (profileError) throw new Error(`feed owner read failed: ${profileError.message}`);
    for (const p of profiles ?? [])
      owners.set(p.user_id, { display_name: p.display_name, handle: p.handle });
  }

  for (const row of rows) {
    byId.set(row.id, {
      type: 'listing',
      sortTs: row.created_at,
      listing: toListingRow(row),
      owner: row.owner_user_id ? (owners.get(row.owner_user_id) ?? null) : null,
    });
  }
  return byId;
}
