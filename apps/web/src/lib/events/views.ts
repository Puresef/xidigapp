import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import type { AuthContext } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { EMBEDDED_EVENTS_LIMIT, EVENTS_INDEX_LIMIT, RSVP_COUNT_FLOOR } from './constants';

/**
 * Event display projections (extras item 8). Same split as
 * lib/profile-view.ts / lib/listing-view.ts:
 *
 *   * signed-in reads go through the caller's RLS client (visibility policy),
 *     then hydrate via the service role (host names, aggregate counts);
 *   * anonymous reads are service-role with an explicitly NARROWER projection
 *     AND hard-coded predicates (visibility='public', published, organic).
 *
 * Locked privacy rules THIS module owns (the API/pages just render):
 *   * the public projection NEVER carries venue_address / online_url;
 *   * venue_address reveals per the host's address_visibility toggle
 *     ('everyone' = any member who can read the event; 'attendees' =
 *     confirmed 'going' + host); online_url reveals to 'going' + host only;
 *   * aggregate RSVP counts render only at/above the N>=5 floor (host exempt
 *     — it's their attendee list);
 *   * attendee NAMES: host sees all; members see only opted-in
 *     (show_publicly) names; the login-free surface sees none;
 *   * organic-proof invariant: every signed-out surface filters
 *     source='member' AND drops rows hosted by AI accounts (users.is_ai).
 */

/**
 * What a member's RLS client may select — matches the column grant in the
 * migration (venue_address / online_url are NOT granted; a `select *` fails).
 */
export const EVENT_MEMBER_COLUMNS =
  'id, slug, title, description, category_id, starts_at, ends_at, timezone, mode, venue_name, address_visibility, host_user_id, lab_id, listing_id, candidate_id, visibility, capacity, featured_at, status, moderation_status, source, created_at';

/** Narrower login-free projection: no venue_address / online_url / moderation. */
export const EVENT_PUBLIC_COLUMNS =
  'id, slug, title, description, category_id, starts_at, ends_at, timezone, mode, venue_name, host_user_id, lab_id, listing_id, visibility, capacity, featured_at, status, source, created_at';

export interface EventViewRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  mode: string;
  venue_name: string | null;
  venue_address?: string | null;
  address_visibility?: string;
  online_url?: string | null;
  host_user_id: string;
  lab_id: string | null;
  listing_id: string | null;
  candidate_id?: string | null;
  visibility: string;
  capacity: number | null;
  featured_at: string | null;
  status: string;
  moderation_status?: string;
  source: string;
  created_at: string;
}

export interface EventListItem {
  slug: string;
  title: string;
  categoryId: string;
  startsAt: string;
  timezone: string;
  mode: string;
  status: string;
}

export interface EventAttendee {
  displayName: string;
  handle: string;
  status: 'going' | 'interested';
}

export interface EventView {
  event: EventViewRow;
  host: { displayName: string; handle: string } | null;
  category: { slug: string; nameEn: string; nameSo: string | null } | null;
  container:
    | { kind: 'lab'; name: string; href: string }
    | { kind: 'listing'; name: string; href: string }
    | { kind: 'candidate'; name: string; href: string }
    | null;
  /** Floored aggregates — null means "below the floor, don't render". */
  counts: { going: number | null; interested: number | null };
  /** Exact going count for the host's capacity math (null for non-hosts). */
  goingExact: number | null;
  viewer: {
    isHost: boolean;
    rsvp: { status: 'going' | 'interested'; showPublicly: boolean } | null;
  };
  /** Privacy-folded reveals — null means "not for this caller". */
  reveal: { venueAddress: string | null; onlineUrl: string | null };
  /** Host: everyone. Member: opted-in only. Public: empty. */
  attendees: EventAttendee[];
  /** Soft capacity reached ('going' blocked; 'interested' keeps working). */
  isFull: boolean;
}

type AnyClient = SupabaseClient<Database>;

/** N>=5 floor on aggregate counts; the host always sees their own numbers. */
export function foldRsvpCounts(
  going: number,
  interested: number,
  isHost: boolean,
): { going: number | null; interested: number | null } {
  if (isHost) return { going, interested };
  return {
    going: going >= RSVP_COUNT_FLOOR ? going : null,
    interested: interested >= RSVP_COUNT_FLOOR ? interested : null,
  };
}

/**
 * Fold the sensitive location/link fields for a caller. `isGoing` = confirmed
 * attendee (status 'going' — "interested" is a bookmark, not a confirmation).
 */
export function foldEventReveal(
  row: Pick<EventViewRow, 'venue_address' | 'address_visibility' | 'online_url'>,
  viewer: { isHost: boolean; isGoing: boolean },
): { venueAddress: string | null; onlineUrl: string | null } {
  const trusted = viewer.isHost || viewer.isGoing;
  return {
    venueAddress:
      row.venue_address == null
        ? null
        : row.address_visibility === 'everyone' || trusted
          ? row.venue_address
          : null,
    onlineUrl: row.online_url == null ? null : trusted ? row.online_url : null,
  };
}

/**
 * Organic-proof invariant for signed-out surfaces: drop rows hosted by AI
 * accounts. (source='member' is filtered SQL-side; is_ai needs the users join.)
 */
async function dropAiHosted<T extends { host_user_id: string }>(
  admin: AnyClient,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const { data } = await admin.from('users').select('id').in('id', hostIds).eq('is_ai', true);
  const aiIds = new Set((data ?? []).map((row) => row.id));
  return rows.filter((row) => !aiIds.has(row.host_user_id));
}

async function loadCategory(
  admin: AnyClient,
  slug: string,
): Promise<EventView['category']> {
  const { data } = await admin
    .from('event_categories')
    .select('slug, name_en, name_so')
    .eq('slug', slug)
    .maybeSingle();
  return data ? { slug: data.slug, nameEn: data.name_en, nameSo: data.name_so } : null;
}

async function loadHost(
  admin: AnyClient,
  userId: string,
): Promise<EventView['host']> {
  const { data } = await admin
    .from('profiles')
    .select('display_name, handle')
    .eq('user_id', userId)
    .maybeSingle();
  return data ? { displayName: data.display_name, handle: data.handle } : null;
}

async function loadContainer(
  admin: AnyClient,
  row: Pick<EventViewRow, 'lab_id' | 'listing_id' | 'candidate_id'>,
): Promise<EventView['container']> {
  if (row.lab_id) {
    const { data } = await admin.from('labs').select('name, slug').eq('id', row.lab_id).maybeSingle();
    return data ? { kind: 'lab', name: data.name, href: `/labs/${data.slug}` } : null;
  }
  if (row.listing_id) {
    const { data } = await admin
      .from('business_listings')
      .select('id, business_name')
      .eq('id', row.listing_id)
      .maybeSingle();
    return data ? { kind: 'listing', name: data.business_name, href: `/l/${data.id}` } : null;
  }
  if (row.candidate_id) {
    const { data } = await admin
      .from('venture_candidates')
      .select('id, name')
      .eq('id', row.candidate_id)
      .maybeSingle();
    return data ? { kind: 'candidate', name: data.name, href: `/c/${data.id}` } : null;
  }
  return null;
}

async function loadRsvpAggregates(
  admin: AnyClient,
  eventId: string,
): Promise<{ going: number; interested: number }> {
  const [going, interested] = await Promise.all([
    admin
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'going'),
    admin
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'interested'),
  ]);
  return { going: going.count ?? 0, interested: interested.count ?? 0 };
}

/**
 * Attendee names. Host: every RSVP (their list). Member: opted-in
 * (show_publicly) rows only. Never called on the login-free path.
 */
async function loadAttendees(
  admin: AnyClient,
  eventId: string,
  audience: 'host' | 'member',
): Promise<EventAttendee[]> {
  let query = admin
    .from('event_rsvps')
    .select('user_id, status, show_publicly')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (audience === 'member') query = query.eq('show_publicly', true);
  const { data: rsvps, error } = await query;
  if (error) throw new Error(`attendee lookup failed: ${error.message}`);
  const rows = rsvps ?? [];
  if (rows.length === 0) return [];

  const { data: profiles } = await admin
    .from('profiles')
    .select('user_id, display_name, handle')
    .in('user_id', rows.map((row) => row.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  const attendees: EventAttendee[] = [];
  for (const row of rows) {
    const profile = byId.get(row.user_id);
    if (!profile) continue;
    attendees.push({
      displayName: profile.display_name,
      handle: profile.handle,
      status: row.status as 'going' | 'interested',
    });
  }
  return attendees;
}

/**
 * Signed-in view: the event row under the caller's RLS, hydration via the
 * service role. Returns null when the slug doesn't resolve (RLS-invisible
 * rows land here too — a private event is a plain 404, never a hint).
 */
export async function getMemberEventView(
  ctx: AuthContext,
  slug: string,
): Promise<EventView | null> {
  const { data: row, error } = await ctx.supabase
    .from('events')
    .select(EVENT_MEMBER_COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`event lookup failed: ${error.message}`);
  if (!row) return null;

  const event = row as unknown as EventViewRow;
  const admin = getSupabaseAdmin();
  const isHost = event.host_user_id === ctx.appUser.id;

  const [host, category, container, aggregates, rsvpRow, revealRow] = await Promise.all([
    loadHost(admin, event.host_user_id),
    loadCategory(admin, event.category_id),
    loadContainer(admin, event),
    loadRsvpAggregates(admin, event.id),
    ctx.supabase
      .from('event_rsvps')
      .select('status, show_publicly')
      .eq('event_id', event.id)
      .eq('user_id', ctx.appUser.id)
      .maybeSingle(),
    // The two reveal-gated columns are not member-selectable (column grant);
    // fetch via service role, then fold per the locked rules below.
    admin
      .from('events')
      .select('venue_address, online_url, address_visibility')
      .eq('id', event.id)
      .maybeSingle(),
  ]);

  const viewerRsvp = rsvpRow.data
    ? {
        status: rsvpRow.data.status as 'going' | 'interested',
        showPublicly: rsvpRow.data.show_publicly,
      }
    : null;
  const isGoing = viewerRsvp?.status === 'going';
  const attendees = await loadAttendees(admin, event.id, isHost ? 'host' : 'member');

  return {
    event,
    host,
    category,
    container,
    counts: foldRsvpCounts(aggregates.going, aggregates.interested, isHost),
    goingExact: isHost ? aggregates.going : null,
    viewer: { isHost, rsvp: viewerRsvp },
    reveal: foldEventReveal(
      {
        venue_address: revealRow.data?.venue_address ?? null,
        online_url: revealRow.data?.online_url ?? null,
        address_visibility: revealRow.data?.address_visibility ?? 'attendees',
      },
      { isHost, isGoing },
    ),
    attendees,
    isFull: event.capacity !== null && aggregates.going >= event.capacity,
  };
}

/**
 * Login-free view: PUBLIC events only, service-role with the narrow
 * projection + organic-proof filters. No address, no online link, no
 * attendee identities, floor-gated counts — by construction.
 */
export async function getPublicEventView(slug: string): Promise<EventView | null> {
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from('events')
    .select(EVENT_PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('visibility', 'public')
    .in('status', ['published', 'cancelled'])
    .eq('moderation_status', 'published')
    .eq('source', 'member')
    .maybeSingle();
  if (error) throw new Error(`public event lookup failed: ${error.message}`);
  if (!row) return null;

  const [event] = await dropAiHosted(admin, [row as unknown as EventViewRow]);
  if (!event) return null;

  const [host, category, container, aggregates] = await Promise.all([
    loadHost(admin, event.host_user_id),
    loadCategory(admin, event.category_id),
    loadContainer(admin, event),
    loadRsvpAggregates(admin, event.id),
  ]);

  return {
    event,
    host,
    category,
    container,
    counts: foldRsvpCounts(aggregates.going, aggregates.interested, false),
    goingExact: null,
    viewer: { isHost: false, rsvp: null },
    reveal: { venueAddress: null, onlineUrl: null },
    attendees: [],
    isFull: event.capacity !== null && aggregates.going >= event.capacity,
  };
}

function upcomingPredicate(nowIso: string) {
  // "Upcoming" = hasn't started yet, or is still running (ends_at future).
  return `starts_at.gte.${nowIso},ends_at.gte.${nowIso}`;
}

/** Signed-in /events index: chronological upcoming events under RLS. */
export async function listMemberEvents(
  ctx: AuthContext,
  options: { category?: string | undefined; now?: Date } = {},
): Promise<EventViewRow[]> {
  const nowIso = (options.now ?? new Date()).toISOString();
  let query = ctx.supabase
    .from('events')
    .select(EVENT_MEMBER_COLUMNS)
    .eq('status', 'published')
    .or(upcomingPredicate(nowIso))
    .order('starts_at', { ascending: true })
    .limit(EVENTS_INDEX_LIMIT);
  if (options.category) query = query.eq('category_id', options.category);
  const { data, error } = await query;
  if (error) throw new Error(`events index query failed: ${error.message}`);
  return (data ?? []) as unknown as EventViewRow[];
}

/** Signed-out /events index: public + organic, narrow projection. */
export async function listPublicEvents(
  options: { category?: string | undefined; now?: Date } = {},
): Promise<EventViewRow[]> {
  const admin = getSupabaseAdmin();
  const nowIso = (options.now ?? new Date()).toISOString();
  let query = admin
    .from('events')
    .select(EVENT_PUBLIC_COLUMNS)
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .eq('source', 'member')
    .or(upcomingPredicate(nowIso))
    .order('starts_at', { ascending: true })
    .limit(EVENTS_INDEX_LIMIT);
  if (options.category) query = query.eq('category_id', options.category);
  const { data, error } = await query;
  if (error) throw new Error(`public events query failed: ${error.message}`);
  return dropAiHosted(admin, (data ?? []) as unknown as EventViewRow[]);
}

/**
 * Embedded upcoming-events sections (Lab page / listing page / host profile).
 * Count-limited; space_only events are deliberately EXCLUDED — an embedded
 * section renders to broader audiences than a Space roster, so it only ever
 * carries public/members rows ('publicOnly' narrows further for signed-out
 * surfaces, with the full organic-proof treatment).
 */
export async function listUpcomingEventsFor(
  target:
    | { labId: string }
    | { listingId: string }
    | { hostUserId: string },
  options: { publicOnly: boolean; now?: Date } = { publicOnly: false },
): Promise<EventListItem[]> {
  const admin = getSupabaseAdmin();
  const nowIso = (options.now ?? new Date()).toISOString();
  let query = admin
    .from('events')
    .select('slug, title, category_id, starts_at, timezone, mode, status, host_user_id, source')
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .or(upcomingPredicate(nowIso))
    .order('starts_at', { ascending: true })
    .limit(EMBEDDED_EVENTS_LIMIT);

  if ('labId' in target) query = query.eq('lab_id', target.labId);
  else if ('listingId' in target) query = query.eq('listing_id', target.listingId);
  else query = query.eq('host_user_id', target.hostUserId);

  if (options.publicOnly) {
    query = query.eq('visibility', 'public').eq('source', 'member');
  } else {
    query = query.in('visibility', ['public', 'members']);
  }

  const { data, error } = await query;
  if (error) throw new Error(`upcoming events query failed: ${error.message}`);
  let rows = (data ?? []) as unknown as (EventViewRow & { source: string })[];
  if (options.publicOnly) rows = await dropAiHosted(admin, rows);
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    categoryId: row.category_id,
    startsAt: row.starts_at,
    timezone: row.timezone,
    mode: row.mode,
    status: row.status,
  }));
}

/**
 * Homepage "next up" card (front door): the admin-featured upcoming PUBLIC
 * event first, else the soonest. Null when none exists — the block is then
 * absent entirely (no empty rooms). Full organic-proof treatment.
 */
export async function getFeaturedUpcomingPublicEvent(
  now: Date = new Date(),
): Promise<EventListItem | null> {
  const admin = getSupabaseAdmin();
  const nowIso = now.toISOString();
  const base = () =>
    admin
      .from('events')
      .select('slug, title, category_id, starts_at, timezone, mode, status, host_user_id')
      .eq('visibility', 'public')
      .eq('status', 'published')
      .eq('moderation_status', 'published')
      .eq('source', 'member')
      .gte('starts_at', nowIso);

  const featured = await base()
    .not('featured_at', 'is', null)
    .order('featured_at', { ascending: false })
    .limit(5);
  if (featured.error) throw new Error(`featured event query failed: ${featured.error.message}`);
  let rows = await dropAiHosted(admin, (featured.data ?? []) as unknown as EventViewRow[]);

  if (rows.length === 0) {
    const soonest = await base().order('starts_at', { ascending: true }).limit(5);
    if (soonest.error) throw new Error(`soonest event query failed: ${soonest.error.message}`);
    rows = await dropAiHosted(admin, (soonest.data ?? []) as unknown as EventViewRow[]);
  }

  const row = rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    categoryId: row.category_id,
    startsAt: row.starts_at,
    timezone: row.timezone,
    mode: row.mode,
    status: row.status,
  };
}
