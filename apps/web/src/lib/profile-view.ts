import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Shared profile-display fetch (§13 permalinks, §14 badges, §28 public share
 * pages). One code path feeds three consumers: GET /api/profiles/[handle]
 * (mobile parity), the signed-in /u/[handle] page, and the login-free public
 * variant of the same page.
 *
 * Column rules (see 20260704210000_phase1_api_surface.sql header):
 * - Signed-in reads go through the caller's RLS client with the granted
 *   column whitelist (a `select *` on profiles fails on revoked columns).
 * - Anonymous reads are service-role with an explicitly NARROWER projection:
 *   no contact_options, no links, no lat/lng/timezone. The member picked
 *   their contact channels for members (§13); logged-out visitors get a
 *   sign-in CTA instead — the share page is a top-of-funnel entry (§28).
 * - Counts always use the service role: follows/vouches RLS is party-scoped,
 *   but aggregate counts carry no PII.
 *
 * Phase 4.5 additions:
 * - avatar/cover paths + blurhashes hydrate into ready-to-render public URLs
 *   (`media`), so components never touch storage plumbing.
 * - `openTo` chips (profile_open_to, sorted by the lookup's sort_order).
 * - `pins` (profile_pins, up to 3) hydrate through the VIEWER's RLS client —
 *   a pin row is only a bare (type, uuid) pair; the target's own visibility
 *   rules decide whether it renders. The login-free public view deliberately
 *   hydrates NO pins (posts/labs/listings are member-visible surfaces and the
 *   service role would bypass their RLS).
 * - BOTH the member (signed-in) and public views honor
 *   user_settings.location_granularity: exact/city → as stored, region →
 *   country only, hidden → nothing. It is a member-audience privacy control
 *   (the member base is effectively the whole app), so the fold is applied to
 *   the member view too, not only the public/crawler surface.
 */

/** Columns any signed-in member may read (matches the RLS column grant). */
export const PROFILE_MEMBER_COLUMNS =
  'user_id, display_name, handle, bio, location_city, location_country, latitude, longitude, timezone, skills, lanes, links, contact_options, verification_status, created_at, avatar_path, avatar_blurhash, cover_path, cover_blurhash';

/** Narrower public projection for logged-out share pages (§28). */
export const PROFILE_PUBLIC_COLUMNS =
  'user_id, display_name, handle, bio, location_city, location_country, skills, lanes, verification_status, created_at, avatar_path, avatar_blurhash, cover_path, cover_blurhash';

export interface ProfileBadge {
  badge_id: string;
  awarded_at: string;
  context: string | null;
  badge_definitions: { slug: string; name: string; description: string | null } | null;
}

export interface ProfileCounts {
  followers: number;
  vouches: number;
}

/**
 * Aggregate reputation totals (§14). Public/non-sensitive — shown as stat chips
 * on the profile and driving the Top Helper leaderboard. Absent row = all zero.
 */
export interface ProfileReputation {
  contribution: number;
  helper: number;
}

interface ProfileViewRow {
  user_id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  location_city: string | null;
  location_country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  skills: string[];
  lanes: string[];
  links?: unknown;
  contact_options?: unknown;
  verification_status: string;
  created_at: string;
  avatar_path?: string | null;
  avatar_blurhash?: string | null;
  cover_path?: string | null;
  cover_blurhash?: string | null;
}

/** Ready-to-render media URLs (storage plumbing resolved server-side). */
export interface ProfileMediaView {
  avatarUrl: string | null;
  /** 96px pipeline thumb — what Avatar renders (<8KB, §22). */
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverBlurhash: string | null;
}

/** A hydrated profile pin (position 1..3). Unreadable targets are dropped. */
export type ProfilePinItem =
  | { entityType: 'post'; entityId: string; position: number; title: string | null; body: string; postType: string }
  | { entityType: 'lab'; entityId: string; position: number; name: string; slug: string; shortDescription: string | null }
  | { entityType: 'listing'; entityId: string; position: number; businessName: string; city: string | null };

export interface ProfileView {
  profile: ProfileViewRow;
  badges: ProfileBadge[];
  counts: ProfileCounts;
  /** Aggregate reputation totals (§14); zeroes when no score row exists. */
  reputation: ProfileReputation;
  media: ProfileMediaView;
  /** open_to_kinds slugs in lookup sort order. */
  openTo: string[];
  /** Hydrated pins (empty on the login-free view — see module header). */
  pins: ProfilePinItem[];
  /** Badged AI-assistant account (§21) — drives the "AI assistant" chip. */
  isAi: boolean;
}

type AnyClient = SupabaseClient<Database>;

export function profileMediaView(profile: {
  avatar_path?: string | null;
  avatar_blurhash?: string | null;
  cover_path?: string | null;
  cover_blurhash?: string | null;
}): ProfileMediaView {
  const avatarPath = profile.avatar_path ?? null;
  const coverPath = profile.cover_path ?? null;
  return {
    avatarUrl: avatarPath ? publicMediaUrl(avatarPath) : null,
    avatarThumbUrl: avatarPath ? publicMediaUrl(derivedThumbPath(avatarPath)) : null,
    avatarBlurhash: profile.avatar_blurhash ?? null,
    coverUrl: coverPath ? publicMediaUrl(coverPath) : null,
    coverThumbUrl: coverPath ? publicMediaUrl(derivedThumbPath(coverPath)) : null,
    coverBlurhash: profile.cover_blurhash ?? null,
  };
}

async function loadCounts(userId: string): Promise<ProfileCounts> {
  const admin = getSupabaseAdmin();
  const [{ count: followers }, { count: vouches }] = await Promise.all([
    admin
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'user')
      .eq('target_id', userId),
    admin
      .from('vouches')
      .select('*', { count: 'exact', head: true })
      .eq('vouchee_user_id', userId),
  ]);
  return { followers: followers ?? 0, vouches: vouches ?? 0 };
}

/**
 * Aggregate reputation totals (§14). reputation_scores is member-readable
 * (RLS `select_all`), so the signed-in view reads it under the caller's RLS
 * client and the public view passes the service role. No row yet = all zero
 * (a member only materialises a score once they earn points).
 */
export async function loadReputation(
  client: AnyClient,
  userId: string,
): Promise<ProfileReputation> {
  const { data } = await client
    .from('reputation_scores')
    .select('contribution_score, helper_score')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    contribution: data?.contribution_score ?? 0,
    helper: data?.helper_score ?? 0,
  };
}

/**
 * The member's "open to" chips, in lookup sort order. Readable wherever the
 * profile is readable — the RLS policy is authenticated-wide, and the public
 * view passes the service role (open-to is public identity, same class as
 * lanes).
 */
/**
 * Is this account a badged AI assistant (§21)? Read via the service role
 * because users.is_ai is not readable through another member's RLS client.
 */
export async function loadIsAi(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('users').select('is_ai').eq('id', userId).maybeSingle();
  return data?.is_ai ?? false;
}

export async function loadOpenTo(client: AnyClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('profile_open_to')
    .select('open_to_id, open_to_kinds(sort_order)')
    .eq('user_id', userId);
  if (error) throw new Error(`open-to lookup failed: ${error.message}`);
  return (data ?? [])
    .map((row) => ({
      id: row.open_to_id as string,
      sort: (row.open_to_kinds as unknown as { sort_order: number } | null)?.sort_order ?? 99,
    }))
    .sort((a, b) => a.sort - b.sort)
    .map((row) => row.id);
}

/**
 * Hydrate a member's pins THROUGH THE CALLER'S RLS. Each pin row only stores
 * (type, uuid); the target tables' own policies decide readability, so a
 * hidden post / unlisted Space / removed listing simply drops out.
 */
export async function hydrateProfilePins(
  client: AnyClient,
  userId: string,
): Promise<ProfilePinItem[]> {
  const { data: rows, error } = await client
    .from('profile_pins')
    .select('entity_type, entity_id, position')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw new Error(`pins lookup failed: ${error.message}`);
  if (!rows || rows.length === 0) return [];

  const idsOf = (type: string) =>
    rows.filter((row) => row.entity_type === type).map((row) => row.entity_id);
  const postIds = idsOf('post');
  const labIds = idsOf('lab');
  const listingIds = idsOf('listing');

  const [posts, labs, listings] = await Promise.all([
    postIds.length > 0
      ? client.from('posts').select('id, title, body, type').in('id', postIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null; body: string; type: string }[] }),
    labIds.length > 0
      ? client.from('labs').select('id, name, slug, short_description').in('id', labIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; slug: string; short_description: string | null }[],
        }),
    listingIds.length > 0
      ? client.from('business_listings').select('id, business_name, city').in('id', listingIds)
      : Promise.resolve({ data: [] as { id: string; business_name: string; city: string | null }[] }),
  ]);

  const postById = new Map((posts.data ?? []).map((row) => [row.id, row]));
  const labById = new Map((labs.data ?? []).map((row) => [row.id, row]));
  const listingById = new Map((listings.data ?? []).map((row) => [row.id, row]));

  const items: ProfilePinItem[] = [];
  for (const row of rows) {
    if (row.entity_type === 'post') {
      const post = postById.get(row.entity_id);
      if (post) {
        items.push({
          entityType: 'post',
          entityId: post.id,
          position: row.position,
          title: post.title,
          body: post.body,
          postType: post.type,
        });
      }
    } else if (row.entity_type === 'lab') {
      const lab = labById.get(row.entity_id);
      if (lab) {
        items.push({
          entityType: 'lab',
          entityId: lab.id,
          position: row.position,
          name: lab.name,
          slug: lab.slug,
          shortDescription: lab.short_description,
        });
      }
    } else if (row.entity_type === 'listing') {
      const listing = listingById.get(row.entity_id);
      if (listing) {
        items.push({
          entityType: 'listing',
          entityId: listing.id,
          position: row.position,
          businessName: listing.business_name,
          city: listing.city,
        });
      }
    }
  }
  return items;
}

/**
 * The location-bearing fields any granularity fold rounds. A projection only
 * needs to expose the subset it carries (the directory/suggested-follows rows
 * have city/country but no coordinates).
 */
export interface LocationFields {
  location_city?: string | null;
  location_country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
}

/**
 * Apply the member's location_granularity to ANY projection carrying location
 * fields. exact/city → as stored; region → country only (drop city + precise
 * coords/timezone); hidden → nothing. Returns a copy, never mutates the input.
 * Enforced on every reader-facing surface (member + public) — a member who
 * chooses 'hidden' expects their city hidden from the member base, not only
 * from search crawlers (§ privacy settings).
 */
export function applyLocationGranularity<T extends LocationFields>(
  profile: T,
  granularity: string,
): T {
  if (granularity === 'region') {
    return { ...profile, location_city: null, latitude: null, longitude: null, timezone: null };
  }
  if (granularity === 'hidden') {
    return {
      ...profile,
      location_city: null,
      location_country: null,
      latitude: null,
      longitude: null,
      timezone: null,
    };
  }
  return profile;
}

/**
 * Bulk-load location_granularity for a set of members (service role —
 * user_settings is own-rows under RLS, but the setting itself carries no
 * payload). Absent row = 'city' default. Used by list surfaces (directory,
 * suggested-follows) to fold each row's city/country before it leaves the
 * server.
 */
export async function loadLocationGranularities(
  userIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  const { data } = await getSupabaseAdmin()
    .from('user_settings')
    .select('user_id, location_granularity')
    .in('user_id', userIds);
  for (const row of data ?? []) result.set(row.user_id, row.location_granularity);
  return result;
}

/** user_settings row is lazy — absent means every default (§ settings spec). */
async function loadPublicSettings(
  userId: string,
): Promise<{ locationGranularity: string; searchEngines: boolean }> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('user_settings')
    .select('location_granularity, discoverable_search_engines')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    locationGranularity: data?.location_granularity ?? 'city',
    searchEngines: data?.discoverable_search_engines ?? true,
  };
}

/** Whether /u/[handle] may be indexed by search engines (§ privacy settings). */
export async function isProfileIndexable(userId: string): Promise<boolean> {
  const settings = await loadPublicSettings(userId);
  return settings.searchEngines;
}

async function loadBadges(client: AnyClient, userId: string): Promise<ProfileBadge[]> {
  const { data: badges } = await client
    .from('user_badges')
    .select('badge_id, awarded_at, context, badge_definitions(slug, name, description)')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('awarded_at', { ascending: false });
  return (badges ?? []) as unknown as ProfileBadge[];
}

/**
 * Signed-in view: profile + badges + pins under the caller's RLS, counts and
 * open-to via service role (aggregates / public identity). Returns null when
 * the handle doesn't resolve.
 *
 * location_granularity is a MEMBER-audience privacy control (the member base is
 * effectively the whole app), so it is folded for other members here too — not
 * only on the public/crawler surface. The owner viewing their OWN profile
 * always sees their real city/coords (pass `viewerId` = their id), so the
 * privacy setting never hides a member's data from themselves.
 */
export async function getMemberProfileView(
  supabase: SupabaseClient<Database>,
  handle: string,
  viewerId?: string,
): Promise<ProfileView | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(PROFILE_MEMBER_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (!profile) return null;

  const rawRow = profile as unknown as ProfileViewRow;
  const isOwner = viewerId !== undefined && viewerId === rawRow.user_id;
  const [badges, counts, reputation, openTo, pins, settings, isAi] = await Promise.all([
    loadBadges(supabase, rawRow.user_id),
    loadCounts(rawRow.user_id),
    loadReputation(supabase, rawRow.user_id),
    loadOpenTo(supabase, rawRow.user_id),
    hydrateProfilePins(supabase, rawRow.user_id),
    // Owners bypass the fold entirely — skip the settings read for them.
    isOwner
      ? Promise.resolve({ locationGranularity: 'city', searchEngines: true })
      : loadPublicSettings(rawRow.user_id),
    loadIsAi(rawRow.user_id),
  ]);
  const row = isOwner ? rawRow : applyLocationGranularity(rawRow, settings.locationGranularity);

  return { profile: row, badges, counts, reputation, media: profileMediaView(row), openTo, pins, isAi };
}

/**
 * Login-free view (§28 share pages): service role with the narrow public
 * projection, location rounded per the member's granularity setting. Badges
 * are public trust signals; active awards only. Pins stay empty here (their
 * targets are member-visible surfaces — see module header).
 */
export async function getPublicProfileView(handle: string): Promise<ProfileView | null> {
  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin
    .from('profiles')
    .select(PROFILE_PUBLIC_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw new Error(`public profile lookup failed: ${error.message}`);
  if (!profile) return null;

  let row = profile as unknown as ProfileViewRow;
  const [badges, counts, reputation, openTo, settings, isAi] = await Promise.all([
    loadBadges(admin, row.user_id),
    loadCounts(row.user_id),
    loadReputation(admin, row.user_id),
    loadOpenTo(admin, row.user_id),
    loadPublicSettings(row.user_id),
    loadIsAi(row.user_id),
  ]);
  row = applyLocationGranularity(row, settings.locationGranularity);

  return { profile: row, badges, counts, reputation, media: profileMediaView(row), openTo, pins: [], isAi };
}
