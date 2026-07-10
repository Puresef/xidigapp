import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { applyLocationGranularity } from '@/lib/profile-view';
import { normalizeSearchName } from '@/lib/search-norm';

/**
 * Global-search projections (§18/§24-baseline, extras item 3). One module owns
 * every row that search may emit, per entity, per caller class — because
 * search is the classic RLS leak path, the rules live here where
 * search-view.test.ts can pin them:
 *
 * - MEMBER callers query under their own RLS client. RLS already hides
 *   unpublished content and suspended authors' content (Phase 6
 *   author_is_active); this module ADDS the discovery-only rules RLS cannot
 *   express: directory opt-outs, unlisted-Space exclusion, the
 *   location-granularity fold, and the people account-status gate (profiles
 *   RLS is `using (true)`, so a suspended member's profile row is readable —
 *   but a discovery surface must not resurface it).
 * - ANONYMOUS callers get service-role narrow projections (share-page
 *   pattern). The service role bypasses RLS entirely, so EVERY gate is this
 *   module's responsibility: published-only, active-owner-only, public+listed
 *   Spaces only, and the §21 organic-proof invariant for the signed-out
 *   surface — `source = 'member'` where the column exists, AI-assistant
 *   accounts excluded.
 * - Posts are members-only in v1 (§28): the anonymous searcher returns empty
 *   WITHOUT issuing a query.
 *
 * Callers hand in both clients explicitly (no module-level getSupabaseAdmin)
 * so the projection tests can prove which client each query rides on.
 */

export const SEARCH_GROUP_LIMIT = 5;

/**
 * The people/listings account-status gate filters AFTER the row fetch (users
 * status is not joinable under the caller's RLS), so fetch headroom to still
 * fill a group when some matches are suspended.
 */
const STATUS_OVERFETCH = 3;

type AnyClient = SupabaseClient<Database>;

export interface SearchClients {
  /** Caller's RLS client — null for anonymous or blocked (suspended/…) callers. */
  member: AnyClient | null;
  /** The caller's user id when `member` is set. */
  memberUserId: string | null;
  /** Service role: narrow public projections + payload-free lookups only. */
  admin: AnyClient;
}

/** Strip characters with meaning inside a PostgREST `.or()` pattern. */
export function sanitizeTerm(raw: string): string {
  return raw.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// --- account flags (users.status / users.is_ai) ---------------------------

interface AccountFlags {
  status: string;
  isAi: boolean;
}

/**
 * users.status/is_ai for a candidate set — service role (another member's
 * users row is unreadable under RLS; the flags never leave the server).
 * Missing row = fail closed (not discoverable).
 */
async function loadAccountFlags(
  admin: AnyClient,
  userIds: string[],
): Promise<Map<string, AccountFlags>> {
  const flags = new Map<string, AccountFlags>();
  if (userIds.length === 0) return flags;
  const { data, error } = await admin.from('users').select('id, status, is_ai').in('id', userIds);
  if (error) throw new Error(`account flags lookup failed: ${error.message}`);
  for (const row of data ?? []) flags.set(row.id, { status: row.status, isAi: row.is_ai });
  return flags;
}

// --- People ------------------------------------------------------------

export const SEARCH_PEOPLE_MEMBER_COLUMNS =
  'user_id, display_name, handle, location_city, location_country, verification_status, created_at, avatar_path, avatar_blurhash';
/** Anonymous projection: identity only — no location (share-page parity). */
export const SEARCH_PEOPLE_PUBLIC_COLUMNS =
  'user_id, display_name, handle, verification_status, created_at, avatar_path, avatar_blurhash';

interface PersonRow {
  user_id: string;
  display_name: string;
  handle: string;
  location_city?: string | null;
  location_country?: string | null;
  verification_status: string;
  created_at: string;
  avatar_path: string | null;
  avatar_blurhash: string | null;
}

export interface SearchPerson {
  userId: string;
  displayName: string;
  handle: string;
  locationCity: string | null;
  locationCountry: string | null;
  verificationStatus: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

/**
 * user_ids that opted out of the directory. Service role (user_settings is
 * own-rows-only under RLS; the id list carries no payload). Bounded at 500 —
 * same noted debt as GET /api/profiles, which owns the canonical copy.
 */
async function directoryOptOutIds(admin: AnyClient): Promise<string[]> {
  const { data, error } = await admin
    .from('user_settings')
    .select('user_id')
    .eq('discoverable_directory', false)
    .limit(500);
  if (error) throw new Error(`directory opt-out lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.user_id);
}

/**
 * location_granularity for the surviving member-view rows (service role —
 * own-rows RLS, no payload). Absent row = 'city' default, same as
 * lib/profile-view.loadLocationGranularities (kept local so the injectable
 * admin client reaches it).
 */
async function loadGranularities(
  admin: AnyClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  const { data, error } = await admin
    .from('user_settings')
    .select('user_id, location_granularity')
    .in('user_id', userIds);
  if (error) throw new Error(`granularity lookup failed: ${error.message}`);
  for (const row of data ?? []) result.set(row.user_id, row.location_granularity);
  return result;
}

export async function searchPeople(clients: SearchClients, q: string): Promise<SearchPerson[]> {
  const anon = clients.member === null;
  const client = clients.member ?? clients.admin;
  let query = client
    .from('profiles')
    .select(anon ? SEARCH_PEOPLE_PUBLIC_COLUMNS : SEARCH_PEOPLE_MEMBER_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(SEARCH_GROUP_LIMIT * STATUS_OVERFETCH);

  const optOutIds = await directoryOptOutIds(clients.admin);
  if (optOutIds.length > 0) {
    query = query.not('user_id', 'in', `(${optOutIds.join(',')})`);
  }

  // Same folding ladder as GET /api/profiles: search_norm substring when the
  // query survives transliteration folding, raw name/handle contains when it
  // does not (emoji / other-script input).
  const folded = normalizeSearchName(q);
  if (folded) {
    query = query.ilike('search_norm', `%${folded}%`);
  } else {
    const term = sanitizeTerm(q);
    if (!term) return [];
    query = query.or(`display_name.ilike.%${term}%,handle.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(`people search failed: ${error.message}`);

  // Account-status gate: only ACTIVE accounts are discoverable (profiles RLS
  // is `using (true)`, so suspended/deactivated/deleted members would
  // otherwise resurface here). Anonymous additionally drops badged AI
  // assistants (§21 organic-proof invariant on the signed-out surface).
  const rows = (data ?? []) as unknown as PersonRow[];
  const flags = await loadAccountFlags(
    clients.admin,
    rows.map((row) => row.user_id),
  );
  let visible = rows.filter((row) => flags.get(row.user_id)?.status === 'active');
  if (anon) visible = visible.filter((row) => flags.get(row.user_id)?.isAi !== true);
  visible = visible.slice(0, SEARCH_GROUP_LIMIT);

  // Member view carries city/country — fold each member's chosen
  // location_granularity before the row leaves the server ('region' →
  // country only, 'hidden' → nothing), parity with GET /api/profiles.
  if (!anon) {
    const granularities = await loadGranularities(
      clients.admin,
      visible.map((row) => row.user_id),
    );
    visible = visible.map((row) =>
      applyLocationGranularity(row, granularities.get(row.user_id) ?? 'city'),
    );
  }

  return visible.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    locationCity: anon ? null : (row.location_city ?? null),
    locationCountry: anon ? null : (row.location_country ?? null),
    verificationStatus: row.verification_status,
    avatarThumbUrl: row.avatar_path ? publicMediaUrl(derivedThumbPath(row.avatar_path)) : null,
    avatarBlurhash: row.avatar_blurhash,
  }));
}

// --- Listings ------------------------------------------------------------

/** owner_user_id rides for the server-side active-owner gate only. */
export const SEARCH_LISTING_COLUMNS =
  'id, owner_user_id, business_name, short_description, city, country, price_range, created_at, primary_photo_path, primary_photo_blurhash, primary_photo_alt';

interface ListingRow {
  id: string;
  owner_user_id: string | null;
  business_name: string;
  short_description: string | null;
  city: string | null;
  country: string | null;
  price_range: number | null;
  created_at: string;
  primary_photo_path: string | null;
  primary_photo_blurhash: string | null;
  primary_photo_alt: string | null;
}

export interface SearchListing {
  id: string;
  businessName: string;
  shortDescription: string | null;
  city: string | null;
  country: string | null;
  priceRange: number | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  photoBlurhash: string | null;
  photoAlt: string | null;
}

export async function searchListings(clients: SearchClients, q: string): Promise<SearchListing[]> {
  const anon = clients.member === null;
  const client = clients.member ?? clients.admin;
  let query = client
    .from('business_listings')
    .select(SEARCH_LISTING_COLUMNS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(anon ? SEARCH_GROUP_LIMIT * STATUS_OVERFETCH : SEARCH_GROUP_LIMIT);

  // Signed-out surface: organic listings only (§21 organic-proof invariant —
  // seeded/AI entries never masquerade as community proof to visitors).
  if (anon) query = query.eq('source', 'member');

  // Folded business name (search_norm, Maxamed↔Mohamed tolerant) OR the raw
  // description — parity with GET /api/listings free-text recall.
  const folded = normalizeSearchName(q);
  const term = sanitizeTerm(q);
  if (folded && term) {
    query = query.or(`search_norm.ilike.%${folded}%,short_description.ilike.%${term}%`);
  } else if (folded) {
    query = query.ilike('search_norm', `%${folded}%`);
  } else if (term) {
    query = query.or(`business_name.ilike.%${term}%,short_description.ilike.%${term}%`);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(`listing search failed: ${error.message}`);
  let rows = (data ?? []) as unknown as ListingRow[];

  // Anonymous rides the service role, which bypasses the Phase 6
  // author_is_active RLS clause — re-apply it here: a suspended owner's
  // published listing must not leak to visitors. Ownerless (imported) rows
  // stay, matching the RLS `owner_user_id is null or author_is_active(...)`.
  if (anon) {
    const ownerIds = rows.map((row) => row.owner_user_id).filter((id): id is string => id !== null);
    const flags = await loadAccountFlags(clients.admin, ownerIds);
    rows = rows
      .filter(
        (row) => row.owner_user_id === null || flags.get(row.owner_user_id)?.status === 'active',
      )
      .slice(0, SEARCH_GROUP_LIMIT);
  }

  return rows.map((row) => ({
    id: row.id,
    businessName: row.business_name,
    shortDescription: row.short_description,
    city: row.city,
    country: row.country,
    priceRange: row.price_range,
    photoUrl: row.primary_photo_path ? publicMediaUrl(row.primary_photo_path) : null,
    photoThumbUrl: row.primary_photo_path
      ? publicMediaUrl(derivedThumbPath(row.primary_photo_path))
      : null,
    photoBlurhash: row.primary_photo_blurhash,
    photoAlt: row.primary_photo_alt,
  }));
}

// --- Labs / Spaces ---------------------------------------------------------

export const SEARCH_LAB_COLUMNS =
  'id, name, slug, space_mode, short_description, stage, last_activity_at';

interface LabSearchRow {
  id: string;
  name: string;
  slug: string;
  space_mode: string;
  short_description: string | null;
  stage: string;
  last_activity_at: string;
}

export interface SearchLab {
  id: string;
  name: string;
  slug: string;
  spaceMode: string;
  shortDescription: string | null;
  stage: string;
}

export async function searchLabs(clients: SearchClients, q: string): Promise<SearchLab[]> {
  const term = sanitizeTerm(q);
  if (!term) return [];

  let query;
  if (clients.member !== null && clients.memberUserId !== null) {
    // Caller's RLS (can_read_lab) enforces the §16 visibility model; on top
    // of that, search only surfaces LISTED Spaces plus the caller's own
    // memberships (an unlisted-but-public Space opted out of discovery).
    const { data: memberships, error: memberError } = await clients.admin
      .from('lab_members')
      .select('lab_id')
      .eq('user_id', clients.memberUserId)
      .eq('status', 'active');
    if (memberError) throw new Error(`membership scan failed: ${memberError.message}`);
    const mine = (memberships ?? []).map((row) => row.lab_id);

    query = clients.member.from('labs').select(SEARCH_LAB_COLUMNS);
    query =
      mine.length > 0
        ? query.or(`is_listed.eq.true,id.in.(${mine.join(',')})`)
        : query.eq('is_listed', true);
  } else {
    // Anonymous: the same build-in-public projection as /labs/[slug] —
    // service role, public + listed Spaces only, narrow columns. Organic
    // Spaces only on the signed-out surface (§21 invariant).
    query = clients.admin
      .from('labs')
      .select(SEARCH_LAB_COLUMNS)
      .eq('visibility', 'public')
      .eq('is_listed', true)
      .eq('source', 'member');
  }

  const { data, error } = await query
    .or(`name.ilike.%${term}%,short_description.ilike.%${term}%`)
    .order('last_activity_at', { ascending: false })
    .limit(SEARCH_GROUP_LIMIT);
  if (error) throw new Error(`lab search failed: ${error.message}`);

  return ((data ?? []) as unknown as LabSearchRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    spaceMode: row.space_mode,
    shortDescription: row.short_description,
    stage: row.stage,
  }));
}

// --- Posts -------------------------------------------------------------

export interface SearchPost {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

export async function searchPosts(clients: SearchClients, q: string): Promise<SearchPost[]> {
  // Posts are members-only in v1 (§28) — visitors get an empty group without
  // a query ever being issued (the strongest non-leak guarantee).
  if (clients.member === null) return [];
  const term = sanitizeTerm(q);
  if (!term) return [];

  const { data, error } = await clients.member
    .from('posts')
    .select('id, title, type, created_at')
    .eq('status', 'published')
    .is('lab_id', null)
    .not('title', 'is', null)
    .ilike('title', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(SEARCH_GROUP_LIMIT);
  if (error) throw new Error(`post search failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title as string,
    type: row.type,
    createdAt: row.created_at,
  }));
}
