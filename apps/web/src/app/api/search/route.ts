import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { getAuthContext, type AuthContext } from '@/lib/auth/guards';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { normalizeSearchName } from '@/lib/search-norm';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Global search (Phase 4.5 DISCOVERY, §18/§24-baseline). One box → grouped
 * results: people, business listings, Spaces, Plaza posts — top 5 per group.
 *
 * Recall model mirrors the per-surface directories exactly:
 * - People: the transliteration-tolerant `search_norm` generated column
 *   (Maxamed ↔ Mohamed), same folding as GET /api/profiles. Members who
 *   opted out of the directory (user_settings.discoverable_directory=false;
 *   absent row = discoverable) are excluded server-side.
 * - Listings: `search_norm` (folded business name) OR short_description,
 *   published only.
 * - Spaces: name/short_description ILIKE under the CALLER's RLS
 *   (can_read_lab), constrained to listed Spaces plus the caller's own
 *   memberships — search is discovery, so unlisted Spaces stay findable only
 *   by their members.
 * - Posts: title ILIKE (trgm-indexed) on published, non-lab posts under RLS.
 *
 * Works signed-out: people/listings/labs fall back to the same narrow public
 * projections as the §28 share pages (service role, public-safe fields only —
 * no location for anonymous people results). Posts are members-only in v1
 * (§28), so the group is empty for visitors.
 *
 * Privacy: `search_performed` carries only a result count — the query text is
 * NEVER logged or emitted (PII guard: names are searched here).
 */

const GROUP_LIMIT = 5;
const RATE_RULE = { max: 30, windowSeconds: 60 };

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

/** Strip characters with meaning inside a PostgREST `.or()` pattern. */
function sanitizeTerm(raw: string): string {
  return raw.replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// --- People ------------------------------------------------------------

const PEOPLE_MEMBER_COLUMNS =
  'user_id, display_name, handle, location_city, location_country, verification_status, created_at, avatar_path, avatar_blurhash';
/** Anonymous projection: identity only — no location (share-page parity). */
const PEOPLE_PUBLIC_COLUMNS =
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

interface SearchPerson {
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
async function directoryOptOutIds(): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('user_settings')
    .select('user_id')
    .eq('discoverable_directory', false)
    .limit(500);
  if (error) throw new Error(`directory opt-out lookup failed: ${error.message}`);
  return (data ?? []).map((row) => row.user_id);
}

async function searchPeople(ctx: AuthContext | null, q: string): Promise<SearchPerson[]> {
  const client = ctx ? ctx.supabase : getSupabaseAdmin();
  let query = client
    .from('profiles')
    .select(ctx ? PEOPLE_MEMBER_COLUMNS : PEOPLE_PUBLIC_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(GROUP_LIMIT);

  const optOutIds = await directoryOptOutIds();
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

  return ((data ?? []) as unknown as PersonRow[]).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    locationCity: ctx ? (row.location_city ?? null) : null,
    locationCountry: ctx ? (row.location_country ?? null) : null,
    verificationStatus: row.verification_status,
    avatarThumbUrl: row.avatar_path ? publicMediaUrl(derivedThumbPath(row.avatar_path)) : null,
    avatarBlurhash: row.avatar_blurhash,
  }));
}

// --- Listings ------------------------------------------------------------

const LISTING_COLUMNS =
  'id, business_name, short_description, city, country, price_range, created_at, primary_photo_path, primary_photo_blurhash, primary_photo_alt';

interface ListingRow {
  id: string;
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

interface SearchListing {
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

async function searchListings(ctx: AuthContext | null, q: string): Promise<SearchListing[]> {
  const client = ctx ? ctx.supabase : getSupabaseAdmin();
  let query = client
    .from('business_listings')
    .select(LISTING_COLUMNS)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(GROUP_LIMIT);

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

  return ((data ?? []) as unknown as ListingRow[]).map((row) => ({
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

const LAB_SEARCH_COLUMNS = 'id, name, slug, space_mode, short_description, stage, last_activity_at';

interface LabSearchRow {
  id: string;
  name: string;
  slug: string;
  space_mode: string;
  short_description: string | null;
  stage: string;
  last_activity_at: string;
}

interface SearchLab {
  id: string;
  name: string;
  slug: string;
  spaceMode: string;
  shortDescription: string | null;
  stage: string;
}

async function searchLabs(ctx: AuthContext | null, q: string): Promise<SearchLab[]> {
  const term = sanitizeTerm(q);
  if (!term) return [];

  let query;
  if (ctx) {
    // Caller's RLS (can_read_lab) enforces the §16 visibility model; on top
    // of that, search only surfaces LISTED Spaces plus the caller's own
    // memberships (an unlisted-but-public Space opted out of discovery).
    const { data: memberships, error: memberError } = await getSupabaseAdmin()
      .from('lab_members')
      .select('lab_id')
      .eq('user_id', ctx.appUser.id)
      .eq('status', 'active');
    if (memberError) throw new Error(`membership scan failed: ${memberError.message}`);
    const mine = (memberships ?? []).map((row) => row.lab_id);

    query = ctx.supabase.from('labs').select(LAB_SEARCH_COLUMNS);
    query = mine.length > 0
      ? query.or(`is_listed.eq.true,id.in.(${mine.join(',')})`)
      : query.eq('is_listed', true);
  } else {
    // Anonymous: the same build-in-public projection as /labs/[slug] —
    // service role, public + listed Spaces only, narrow columns.
    query = getSupabaseAdmin()
      .from('labs')
      .select(LAB_SEARCH_COLUMNS)
      .eq('visibility', 'public')
      .eq('is_listed', true);
  }

  const { data, error } = await query
    .or(`name.ilike.%${term}%,short_description.ilike.%${term}%`)
    .order('last_activity_at', { ascending: false })
    .limit(GROUP_LIMIT);
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

interface SearchPost {
  id: string;
  title: string;
  type: string;
  createdAt: string;
}

async function searchPosts(ctx: AuthContext | null, q: string): Promise<SearchPost[]> {
  // Posts are members-only in v1 (§28) — visitors get an empty group.
  if (!ctx) return [];
  const term = sanitizeTerm(q);
  if (!term) return [];

  const { data, error } = await ctx.supabase
    .from('posts')
    .select('id, title, type, created_at')
    .eq('status', 'published')
    .is('lab_id', null)
    .not('title', 'is', null)
    .ilike('title', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(GROUP_LIMIT);
  if (error) throw new Error(`post search failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title as string,
    type: row.type,
    createdAt: row.created_at,
  }));
}

// --- Handler -------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    // Per-IP (not per-user): the route is public, and the limit exists to
    // stop scraping — 30/min matches interactive use.
    await enforceRateLimit(`search:${clientIp(request)}`, RATE_RULE);

    const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));

    // Public route: signed-out proceeds with the public projections; blocked
    // account states degrade to the same (parity with /labs/[slug]).
    const auth = await getAuthContext();
    const blocked =
      auth !== null &&
      (auth.appUser.status === 'suspended' ||
        auth.appUser.status === 'deactivated' ||
        auth.appUser.status === 'deleted');
    const ctx = auth !== null && !blocked ? auth : null;

    const [people, listings, labs, posts] = await Promise.all([
      searchPeople(ctx, q),
      searchListings(ctx, q),
      searchLabs(ctx, q),
      searchPosts(ctx, q),
    ]);

    // Count only — the query text is names/PII and never leaves this handler.
    if (ctx) {
      emitServer(
        event('search_performed', {
          result_count: people.length + listings.length + labs.length + posts.length,
        }),
        { distinctId: ctx.appUser.id, userId: ctx.appUser.id },
      );
    }

    return apiOk({ people, listings, labs, posts });
  } catch (error) {
    return handleApiError(error);
  }
}
