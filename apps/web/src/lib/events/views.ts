import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';
import type { Translator } from '@xidig/i18n';

import type { AuthContext } from '@/lib/auth/guards';
import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import {
  dropDeletedHostUpcoming,
  eventHostState,
  keepProjectableListings,
  loadStatuses,
  type EventHostState,
} from '@/lib/retained-content';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import {
  EMBEDDED_EVENTS_LIMIT,
  EVENT_CARD_SAMPLE_LIMIT,
  EVENT_PAST_STRIP_LIMIT,
  EVENTS_INDEX_LIMIT,
  RSVP_COUNT_FLOOR,
} from './constants';

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
 *   * aggregate RSVP counts: EXACT on member surfaces (Task 4 — the floor is
 *     retired for signed-in callers, flagged for Warya); the N>=5 floor
 *     remains ONLY on the signed-out projection (foldPublicRsvpCounts);
 *   * attendee NAMES: host sees all; members see the named wall — opted-in
 *     (show_publicly) 'going' names; the login-free surface sees none;
 *   * organic-proof invariant: every signed-out surface filters
 *     source='member' AND drops rows hosted by AI accounts (users.is_ai) or
 *     by quarantined test accounts (users.is_test) — dropAiOrTestHosted;
 *   * member lists (index, cards, embedded Space/profile lists) drop events
 *     hosted by quarantined test accounts — dropTestHosted. A fake member's
 *     event is never listed as community activity (AI-hosted events stay
 *     visible to members, labelled).
 */

/**
 * What a member's RLS client may select — matches the column grant in the
 * migration (venue_address / online_url are NOT granted; a `select *` fails).
 */
export const EVENT_MEMBER_COLUMNS =
  'id, slug, title, description, category_id, starts_at, ends_at, timezone, mode, venue_name, address_visibility, host_user_id, lab_id, listing_id, candidate_id, visibility, capacity, featured_at, status, moderation_status, source, created_at, cover_path, cover_blurhash, agenda';

/**
 * Narrower login-free projection: no venue_address / online_url / moderation.
 * Cover art + agenda ARE public content (Task 1/3 write them, Task 4 renders).
 */
export const EVENT_PUBLIC_COLUMNS =
  'id, slug, title, description, category_id, starts_at, ends_at, timezone, mode, venue_name, host_user_id, lab_id, listing_id, visibility, capacity, featured_at, status, source, created_at, cover_path, cover_blurhash, agenda';

/** Freeform programme row (Task 3 write side validates the shape). */
export interface EventAgendaItem {
  time: string;
  label: string;
}

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
  cover_path: string | null;
  cover_blurhash: string | null;
  agenda: EventAgendaItem[];
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

/** Cover art in wire form: public CDN pair + blurhash placeholder. */
export interface EventCoverView {
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverBlurhash: string | null;
}

/** Host's door list row (Task 4 check-in). */
export interface EventCheckinRow {
  userId: string;
  displayName: string;
  handle: string;
  status: 'going' | 'interested';
  checkedInAt: string | null;
}

export interface EventView {
  event: EventViewRow;
  host: { displayName: string; handle: string } | null;
  /**
   * Retained-content state of the host (lib/retained-content.ts). Anything but
   * 'host_present' means the host's account was deleted: an upcoming event is
   * no longer running (no RSVP, reveal, wall, calendar), a past one keeps its
   * record with the tombstone host (no profile link, no host stats).
   */
  hostState: EventHostState;
  category: { slug: string; nameEn: string; nameSo: string | null } | null;
  container:
    | { kind: 'lab'; name: string; href: string }
    | { kind: 'listing'; name: string; href: string }
    | { kind: 'candidate'; name: string; href: string }
    | null;
  /**
   * Aggregates — EXACT on member surfaces (Task 4); on the signed-out
   * projection null still means "below the floor, don't render".
   */
  counts: { going: number | null; interested: number | null };
  /** Exact going count for the host's capacity math (null for non-hosts). */
  goingExact: number | null;
  /**
   * Exact going total for the named wall's "+N kale" remainder math.
   * The login-free surface has no wall — always 0 there.
   */
  goingTotal: number;
  viewer: {
    isHost: boolean;
    rsvp: { status: 'going' | 'interested'; showPublicly: boolean } | null;
  };
  /** Privacy-folded reveals — null means "not for this caller". */
  reveal: { venueAddress: string | null; onlineUrl: string | null };
  /** Host: everyone. Member: the named wall (opted-in 'going'). Public: empty. */
  attendees: EventAttendee[];
  /** Soft capacity reached ('going' blocked; 'interested' keeps working). */
  isFull: boolean;
  /** Cover art (Task 3 writes, Task 4 renders). */
  cover: EventCoverView;
  /** Host social proof: ended published events for the same Lab, else host. */
  hostStats: { pastEventsCount: number };
  /**
   * Host-only door list — null for everyone else. `enabled` flips at
   * starts_at; the rows carry every RSVP with its checked_in_at state.
   */
  checkin: { enabled: boolean; rows: EventCheckinRow[] } | null;
  /**
   * Past events only: checked-in count when the host used the door list,
   * else the going count. Null for upcoming events (and floored on the
   * signed-out projection, same as every public aggregate).
   */
  attendedCount: number | null;
}

type AnyClient = SupabaseClient<Database>;

/**
 * Member surfaces show EXACT counts (Task 4 — the N>=5 floor is retired for
 * signed-in callers; flagged for Warya). The signature is kept so call sites
 * and the EventView shape stay put; the anon floor lives in
 * foldPublicRsvpCounts and NOWHERE else.
 */
export function foldRsvpCounts(
  going: number,
  interested: number,
  _isHost: boolean,
): { going: number | null; interested: number | null } {
  return { going, interested };
}

/**
 * N>=5 floor on aggregate counts — ONLY the signed-out projection
 * (getPublicEventView / the public index) folds through this.
 */
export function foldPublicRsvpCounts(
  going: number,
  interested: number,
): { going: number | null; interested: number | null } {
  return {
    going: going >= RSVP_COUNT_FLOOR ? going : null,
    interested: interested >= RSVP_COUNT_FLOOR ? interested : null,
  };
}

/** Cover art wire form via the shared media pipeline (profileMediaView twin). */
export function eventCoverView(
  row: Pick<EventViewRow, 'cover_path' | 'cover_blurhash'>,
): EventCoverView {
  const coverPath = row.cover_path ?? null;
  return {
    coverUrl: coverPath ? publicMediaUrl(coverPath) : null,
    coverThumbUrl: coverPath ? publicMediaUrl(derivedThumbPath(coverPath)) : null,
    coverBlurhash: row.cover_blurhash ?? null,
  };
}

/** Post-end boundary everywhere: ends_at when present, else starts_at. */
export function isEnded(row: Pick<EventViewRow, 'starts_at' | 'ends_at'>, now: Date): boolean {
  return Date.parse(row.ends_at ?? row.starts_at) < now.getTime();
}

/**
 * Frame 9a ordering: upcoming ascending (soonest first), past descending
 * (most recent first). Pure so the 'mine' tab merge is testable clientless.
 */
export function splitTabs<T extends Pick<EventViewRow, 'starts_at' | 'ends_at'>>(
  rows: T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const row of rows) (isEnded(row, now) ? past : upcoming).push(row);
  upcoming.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  past.sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return { upcoming, past };
}

/** One BATCHED rsvp read folded into per-event going + checked-in counts. */
export function foldCardCounts(
  rows: Array<{ event_id: string; status: string; checked_in_at: string | null }>,
): Map<string, { going: number; checkedIn: number }> {
  const map = new Map<string, { going: number; checkedIn: number }>();
  for (const row of rows) {
    const entry = map.get(row.event_id) ?? { going: 0, checkedIn: 0 };
    if (row.status === 'going') entry.going += 1;
    if (row.checked_in_at !== null) entry.checkedIn += 1;
    map.set(row.event_id, entry);
  }
  return map;
}

/** First `limit` sample user ids per event, in arrival (created_at) order. */
export function sliceAttendeeSamples(
  rows: Array<{ event_id: string; user_id: string }>,
  limit: number,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.event_id) ?? [];
    if (list.length < limit) {
      list.push(row.user_id);
      map.set(row.event_id, list);
    }
  }
  return map;
}

/**
 * Attendance for a finished event: the door count when the host used
 * check-in, else the going count. Upcoming events have no attendance yet.
 */
export function resolveAttendedCount(
  isPast: boolean,
  checkedIn: number,
  going: number,
): number | null {
  if (!isPast) return null;
  return checkedIn > 0 ? checkedIn : going;
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

/** The "Goobta" (Where) facts-card row: name (bold value) + revealed address
 *  (secondary line) or an attendees-only hint. Extracted from the detail page
 *  (Task 6 review fix 1) so the edge case is unit-testable: an in-person
 *  event can have `venue_name = null` while `reveal.venueAddress` is still
 *  set (an attendee/host viewer, or `address_visibility = 'everyone'`) — the
 *  row must still render with the address AS the primary value, not vanish
 *  because there's no name to gate on. This does not change reveal rules,
 *  only which already-revealed value the row is allowed to show. */
export interface VenueFacts {
  /** Bold dd value. Null means the row is omitted entirely. */
  primary: string | null;
  /** Sub-line under the primary value, or null when there's nothing to add. */
  secondary: string | null;
  /** True when `secondary` is the "shared with attendees" hint, not an address. */
  secondaryIsNote: boolean;
}

export function resolveVenueFacts(
  event: { venue_name: string | null; mode: string },
  reveal: { venueAddress: string | null },
  t: Translator,
): VenueFacts {
  const name = event.venue_name ?? (event.mode !== 'in_person' ? t('events.venueOnline') : null);

  if (name === null && reveal.venueAddress === null) {
    return { primary: null, secondary: null, secondaryIsNote: false };
  }
  if (name === null) {
    // No venue name to lead with — the revealed address IS the value.
    return { primary: reveal.venueAddress, secondary: null, secondaryIsNote: false };
  }
  if (reveal.venueAddress !== null) {
    return { primary: name, secondary: reveal.venueAddress, secondaryIsNote: false };
  }
  if (event.venue_name !== null) {
    // Named venue, address not revealed to this viewer — the attendees-only hint.
    return { primary: name, secondary: t('events.addressForAttendees'), secondaryIsNote: true };
  }
  return { primary: name, secondary: null, secondaryIsNote: false };
}

/**
 * Organic-proof invariant for signed-out surfaces: drop rows hosted by AI
 * accounts or by quarantined test accounts (users.is_test, migration
 * 20260912050000). source='member' is filtered SQL-side; the account flags
 * need the users lookup. A failed lookup throws rather than letting the rows
 * through unchecked (callers already treat a query error as a failure).
 */
async function dropAiOrTestHosted<T extends { host_user_id: string }>(
  admin: AnyClient,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const { data, error } = await admin
    .from('users')
    .select('id')
    .in('id', hostIds)
    .or('is_ai.eq.true,is_test.eq.true');
  if (error) throw new Error(`event host flags lookup failed: ${error.message}`);
  const excludedIds = new Set((data ?? []).map((row) => row.id));
  return rows.filter((row) => !excludedIds.has(row.host_user_id));
}

/**
 * Member-list half of the quarantine: drop rows hosted by a quarantined test
 * account (users.is_test), past and upcoming. Service role (another member's
 * users row is not RLS-readable). Throws on a failed lookup rather than
 * letting test-hosted rows through unchecked.
 */
async function dropTestHosted<T extends { host_user_id: string }>(
  admin: AnyClient,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const hostIds = [...new Set(rows.map((row) => row.host_user_id))];
  const { data, error } = await admin
    .from('users')
    .select('id')
    .in('id', hostIds)
    .eq('is_test', true);
  if (error) throw new Error(`event host test-flag lookup failed: ${error.message}`);
  const excludedIds = new Set((data ?? []).map((row) => row.id));
  return rows.filter((row) => !excludedIds.has(row.host_user_id));
}

async function loadCategory(admin: AnyClient, slug: string): Promise<EventView['category']> {
  const { data } = await admin
    .from('event_categories')
    .select('slug, name_en, name_so')
    .eq('slug', slug)
    .maybeSingle();
  return data ? { slug: data.slug, nameEn: data.name_en, nameSo: data.name_so } : null;
}

async function loadHost(admin: AnyClient, userId: string): Promise<EventView['host']> {
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
    const { data } = await admin
      .from('labs')
      .select('name, slug')
      .eq('id', row.lab_id)
      .maybeSingle();
    return data ? { kind: 'lab', name: data.name, href: `/labs/${data.slug}` } : null;
  }
  if (row.listing_id) {
    // Same rule as the listing page itself: published, and not a listing whose
    // owner is no longer live (suppressed pending review — retained-content).
    const { data } = await admin
      .from('business_listings')
      .select('id, business_name, owner_user_id')
      .eq('id', row.listing_id)
      .eq('status', 'published')
      .maybeSingle();
    if (!data) return null;
    const [kept] = await keepProjectableListings(admin, [data]);
    return kept ? { kind: 'listing', name: kept.business_name, href: `/l/${kept.id}` } : null;
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
): Promise<{ going: number; interested: number; checkedIn: number }> {
  const [going, interested, checkedIn] = await Promise.all([
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
    admin
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not('checked_in_at', 'is', null),
  ]);
  return {
    going: going.count ?? 0,
    interested: interested.count ?? 0,
    checkedIn: checkedIn.count ?? 0,
  };
}

/**
 * RSVP roster with names. Host: every RSVP (their list AND the door sheet).
 * Member: the named wall — opted-in (show_publicly) 'going' rows only.
 * Never called on the login-free path.
 */
async function loadRoster(
  admin: AnyClient,
  eventId: string,
  audience: 'host' | 'member',
): Promise<EventCheckinRow[]> {
  let query = admin
    .from('event_rsvps')
    .select('user_id, status, show_publicly, checked_in_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (audience === 'member') query = query.eq('show_publicly', true).eq('status', 'going');
  const { data: rsvps, error } = await query;
  if (error) throw new Error(`attendee lookup failed: ${error.message}`);
  const rows = rsvps ?? [];
  if (rows.length === 0) return [];

  const { data: profiles } = await admin
    .from('profiles')
    .select('user_id, display_name, handle')
    .in(
      'user_id',
      rows.map((row) => row.user_id),
    );
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  // The members' named wall never lists a deleted account as "going" — it
  // cannot attend. The host's own list keeps every RSVP (their record).
  const flags =
    audience === 'member'
      ? await loadStatuses(
          admin,
          rows.map((row) => row.user_id),
        )
      : null;

  const roster: EventCheckinRow[] = [];
  for (const row of rows) {
    const profile = byId.get(row.user_id);
    if (!profile) continue;
    if (flags?.get(row.user_id)?.status === 'deleted') continue;
    roster.push({
      userId: row.user_id,
      displayName: profile.display_name,
      handle: profile.handle,
      status: row.status as 'going' | 'interested',
      checkedInAt: row.checked_in_at,
    });
  }
  return roster;
}

/**
 * Host social proof: how many published events for the SAME container
 * already ended — the Lab's track record when the event has one, else the
 * host member's. The public path narrows to public + organic rows.
 */
async function loadHostStats(
  admin: AnyClient,
  row: Pick<EventViewRow, 'lab_id' | 'host_user_id'>,
  nowIso: string,
  options: { publicOnly: boolean },
): Promise<{ pastEventsCount: number }> {
  let query = admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .lt('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.lt.${nowIso}`);
  query = row.lab_id ? query.eq('lab_id', row.lab_id) : query.eq('host_user_id', row.host_user_id);
  if (options.publicOnly) query = query.eq('visibility', 'public').eq('source', 'member');
  const { count, error } = await query;
  if (error) throw new Error(`host stats query failed: ${error.message}`);
  return { pastEventsCount: count ?? 0 };
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
  const now = new Date();

  const [host, category, container, aggregates, hostStats, rsvpRow, revealRow, hostFlags] =
    await Promise.all([
      loadHost(admin, event.host_user_id),
      loadCategory(admin, event.category_id),
      loadContainer(admin, event),
      loadRsvpAggregates(admin, event.id),
      loadHostStats(admin, event, now.toISOString(), { publicOnly: false }),
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
      loadStatuses(admin, [event.host_user_id]),
    ]);
  const past = isEnded(event, now);
  const hostState = eventHostState(
    hostFlags.get(event.host_user_id)?.status,
    past,
    event.lab_id !== null,
  );

  const viewerRsvp = rsvpRow.data
    ? {
        status: rsvpRow.data.status as 'going' | 'interested',
        showPublicly: rsvpRow.data.show_publicly,
      }
    : null;
  const isGoing = viewerRsvp?.status === 'going';
  const roster = await loadRoster(admin, event.id, isHost ? 'host' : 'member');
  const attendees = roster.map(({ displayName, handle, status }) => ({
    displayName,
    handle,
    status,
  }));

  if (hostState === 'host_deleted_upcoming')
    return notRunningView(event, host, category, container);

  return {
    event,
    host,
    hostState,
    category,
    container,
    counts: foldRsvpCounts(aggregates.going, aggregates.interested, isHost),
    goingExact: isHost ? aggregates.going : null,
    goingTotal: aggregates.going,
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
    cover: eventCoverView(event),
    hostStats,
    checkin: isHost
      ? { enabled: Date.parse(event.starts_at) <= now.getTime(), rows: roster }
      : null,
    attendedCount: resolveAttendedCount(past, aggregates.checkedIn, aggregates.going),
  };
}

/**
 * An upcoming event whose host's account was deleted, with no handover in the
 * product: kept as a record the viewer can still open, but nothing that runs
 * it — no counts, no reveal (address / online link), no named wall, no
 * capacity, no door list. The page states it plainly and shows no RSVP or
 * calendar action; the RSVP and ICS routes refuse on the same rule.
 */
function notRunningView(
  event: EventViewRow,
  host: EventView['host'],
  category: EventView['category'],
  container: EventView['container'],
): EventView {
  return {
    event,
    host,
    hostState: 'host_deleted_upcoming',
    category,
    container,
    counts: { going: null, interested: null },
    goingExact: null,
    goingTotal: 0,
    viewer: { isHost: false, rsvp: null },
    reveal: { venueAddress: null, onlineUrl: null },
    attendees: [],
    isFull: false,
    cover: eventCoverView(event),
    hostStats: { pastEventsCount: 0 },
    checkin: null,
    attendedCount: null,
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

  const [event] = await dropAiOrTestHosted(admin, [row as unknown as EventViewRow]);
  if (!event) return null;

  const now = new Date();
  const [host, category, container, aggregates, hostStats, hostFlags] = await Promise.all([
    loadHost(admin, event.host_user_id),
    loadCategory(admin, event.category_id),
    loadContainer(admin, event),
    loadRsvpAggregates(admin, event.id),
    loadHostStats(admin, event, now.toISOString(), { publicOnly: true }),
    loadStatuses(admin, [event.host_user_id]),
  ]);
  const hostState = eventHostState(
    hostFlags.get(event.host_user_id)?.status,
    isEnded(event, now),
    event.lab_id !== null,
  );
  if (hostState === 'host_deleted_upcoming')
    return notRunningView(event, host, category, container);

  // Attendance is an RSVP aggregate too — the signed-out floor applies.
  const rawAttended = resolveAttendedCount(
    isEnded(event, now),
    aggregates.checkedIn,
    aggregates.going,
  );

  return {
    event,
    host,
    hostState,
    category,
    container,
    counts: foldPublicRsvpCounts(aggregates.going, aggregates.interested),
    goingExact: null,
    goingTotal: 0, // no named wall on the login-free surface
    viewer: { isHost: false, rsvp: null },
    reveal: { venueAddress: null, onlineUrl: null },
    attendees: [],
    isFull: event.capacity !== null && aggregates.going >= event.capacity,
    cover: eventCoverView(event),
    hostStats,
    checkin: null,
    attendedCount: rawAttended !== null && rawAttended >= RSVP_COUNT_FLOOR ? rawAttended : null,
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
  const admin = getSupabaseAdmin();
  return dropDeletedHostUpcoming(
    admin,
    await dropTestHosted(admin, (data ?? []) as unknown as EventViewRow[]),
    options.now,
  );
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
  return dropDeletedHostUpcoming(
    admin,
    await dropAiOrTestHosted(admin, (data ?? []) as unknown as EventViewRow[]),
    options.now,
  );
}

// ---------------------------------------------------------------------------
// Card loader (Task 4, frame 9a): the /events index cards. Signed-in only —
// the public index keeps the narrow listPublicEvents projection.
// ---------------------------------------------------------------------------

export interface EventCardAttendee {
  displayName: string;
  handle: string;
}

export interface EventCardItem {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  mode: string;
  venueName: string | null;
  status: string;
  capacity: number | null;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverBlurhash: string | null;
  host: { kind: 'lab' | 'member'; name: string; href: string } | null;
  goingCount: number;
  /** Past events only — checked-in count, else goingCount. Null upcoming. */
  attendedCount: number | null;
  /** First 3 public 'going' names (the card's mini wall). */
  attendeeSample: EventCardAttendee[];
  /**
   * The viewer's own RSVP, WITH the stored show-publicly choice: the card's
   * single verb must resend that choice, never a hardcoded default — a
   * hardcoded `true` would silently re-publicize an opted-out member.
   */
  viewerRsvp: { status: 'going' | 'interested'; showPublicly: boolean } | null;
  isPast: boolean;
  isFull: boolean;
}

export type EventsTab = 'upcoming' | 'past' | 'mine';

/** Ended events under the caller's RLS, most recent first. */
function endedEventsQuery(client: AnyClient, nowIso: string) {
  return client
    .from('events')
    .select(EVENT_MEMBER_COLUMNS)
    .eq('status', 'published')
    .lt('starts_at', nowIso)
    .or(`ends_at.is.null,ends_at.lt.${nowIso}`)
    .order('starts_at', { ascending: false });
}

async function loadLabsById(
  admin: AnyClient,
  ids: string[],
): Promise<Map<string, { name: string; slug: string }>> {
  const map = new Map<string, { name: string; slug: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from('labs').select('id, name, slug').in('id', ids);
  if (error) throw new Error(`event card labs lookup failed: ${error.message}`);
  for (const lab of data ?? []) map.set(lab.id, { name: lab.name, slug: lab.slug });
  return map;
}

async function loadProfilesById(
  admin: AnyClient,
  ids: string[],
): Promise<Map<string, { displayName: string; handle: string }>> {
  const map = new Map<string, { displayName: string; handle: string }>();
  if (ids.length === 0) return map;
  const { data, error } = await admin
    .from('profiles')
    .select('user_id, display_name, handle')
    .in('user_id', ids);
  if (error) throw new Error(`event card profiles lookup failed: ${error.message}`);
  for (const p of data ?? []) map.set(p.user_id, { displayName: p.display_name, handle: p.handle });
  return map;
}

/**
 * The /events index cards, one tab at a time (frame 9a):
 *
 *   * 'upcoming' — published events that haven't ended, soonest first, PLUS
 *     the 3 most recent past events appended for the divider section;
 *   * 'past' — ended events, most recent first;
 *   * 'mine' — hosted OR RSVPed, upcoming ascending then past descending.
 *
 * Hydration is BATCHED by construction: one grouped rsvp read, one attendee
 * sample read, one viewer-rsvp read, one labs read, one profiles read — the
 * card list never issues a per-event query. `upcomingCount` is the number of
 * not-yet-ended items in the tab's own result (the 9a header count).
 */
export async function listEventCards(
  ctx: AuthContext,
  tab: EventsTab,
  now: Date = new Date(),
): Promise<{ items: EventCardItem[]; upcomingCount: number }> {
  const nowIso = now.toISOString();

  let upcomingRows: EventViewRow[] = [];
  let pastRows: EventViewRow[] = [];
  // 'mine' already read the viewer's RSVP rows to build the merge predicate —
  // reuse them instead of a fourth event_rsvps round-trip. show_publicly rides
  // along so the card verb can resend the STORED choice (privacy fix).
  let viewerRsvps: Map<string, { status: 'going' | 'interested'; showPublicly: boolean }> | null =
    null;

  if (tab === 'upcoming') {
    const [upcomingRes, stripRes] = await Promise.all([
      ctx.supabase
        .from('events')
        .select(EVENT_MEMBER_COLUMNS)
        .eq('status', 'published')
        .or(upcomingPredicate(nowIso))
        .order('starts_at', { ascending: true })
        .limit(EVENTS_INDEX_LIMIT),
      endedEventsQuery(ctx.supabase, nowIso).limit(EVENT_PAST_STRIP_LIMIT),
    ]);
    if (upcomingRes.error) {
      throw new Error(`event cards query failed: ${upcomingRes.error.message}`);
    }
    if (stripRes.error) {
      throw new Error(`event cards past strip failed: ${stripRes.error.message}`);
    }
    upcomingRows = (upcomingRes.data ?? []) as unknown as EventViewRow[];
    pastRows = (stripRes.data ?? []) as unknown as EventViewRow[];
  } else if (tab === 'past') {
    const res = await endedEventsQuery(ctx.supabase, nowIso).limit(EVENTS_INDEX_LIMIT);
    if (res.error) throw new Error(`event cards query failed: ${res.error.message}`);
    pastRows = (res.data ?? []) as unknown as EventViewRow[];
  } else {
    const own = await ctx.supabase
      .from('event_rsvps')
      .select('event_id, status, show_publicly')
      .eq('user_id', ctx.appUser.id);
    if (own.error) throw new Error(`event cards rsvp lookup failed: ${own.error.message}`);
    viewerRsvps = new Map(
      (own.data ?? []).map((r) => [
        r.event_id,
        { status: r.status as 'going' | 'interested', showPublicly: r.show_publicly },
      ]),
    );

    const rsvpIds = [...viewerRsvps.keys()];
    let query = ctx.supabase.from('events').select(EVENT_MEMBER_COLUMNS);
    query =
      rsvpIds.length > 0
        ? query.or(`host_user_id.eq.${ctx.appUser.id},id.in.(${rsvpIds.join(',')})`)
        : query.eq('host_user_id', ctx.appUser.id);
    const res = await query.order('starts_at', { ascending: true }).limit(EVENTS_INDEX_LIMIT);
    if (res.error) throw new Error(`event cards query failed: ${res.error.message}`);
    const split = splitTabs((res.data ?? []) as unknown as EventViewRow[], now);
    upcomingRows = split.upcoming;
    pastRows = split.past;
  }

  const admin = getSupabaseAdmin();
  // A quarantined test account's event is never listed as community activity,
  // on any tab (past included).
  upcomingRows = await dropTestHosted(admin, upcomingRows);
  pastRows = await dropTestHosted(admin, pastRows);
  // An upcoming event whose host was deleted is no longer running — it leaves
  // every list, "mine" included. Past ones stay (history).
  upcomingRows = await dropDeletedHostUpcoming(admin, upcomingRows, now);
  const ordered = [...upcomingRows, ...pastRows];
  if (ordered.length === 0) return { items: [], upcomingCount: 0 };

  const ids = ordered.map((r) => r.id);

  const [aggRes, sampleRes, viewerRes] = await Promise.all([
    admin.from('event_rsvps').select('event_id, status, checked_in_at').in('event_id', ids),
    admin
      .from('event_rsvps')
      .select('event_id, user_id')
      .eq('status', 'going')
      .eq('show_publicly', true)
      .in('event_id', ids)
      .order('created_at', { ascending: true }),
    viewerRsvps
      ? Promise.resolve(null)
      : ctx.supabase
          .from('event_rsvps')
          .select('event_id, status, show_publicly')
          .eq('user_id', ctx.appUser.id)
          .in('event_id', ids),
  ]);
  if (aggRes.error) throw new Error(`event cards rsvp aggregate failed: ${aggRes.error.message}`);
  if (sampleRes.error) throw new Error(`event cards sample failed: ${sampleRes.error.message}`);
  if (viewerRes?.error)
    throw new Error(`event cards viewer rsvp failed: ${viewerRes.error.message}`);

  const countsById = foldCardCounts(
    (aggRes.data ?? []) as Array<{
      event_id: string;
      status: string;
      checked_in_at: string | null;
    }>,
  );
  const samplesById = sliceAttendeeSamples(
    (sampleRes.data ?? []) as Array<{ event_id: string; user_id: string }>,
    EVENT_CARD_SAMPLE_LIMIT,
  );
  viewerRsvps ??= new Map(
    (viewerRes?.data ?? []).map((r) => [
      r.event_id,
      { status: r.status as 'going' | 'interested', showPublicly: r.show_publicly },
    ]),
  );

  const labIds = [...new Set(ordered.map((r) => r.lab_id).filter((v): v is string => v !== null))];
  const sampleUserIds = new Set<string>();
  for (const list of samplesById.values()) for (const userId of list) sampleUserIds.add(userId);
  const hostUserIds = ordered.filter((r) => r.lab_id === null).map((r) => r.host_user_id);
  const profileIds = [...new Set([...hostUserIds, ...sampleUserIds])];

  const [labsById, profilesById, sampleFlags] = await Promise.all([
    loadLabsById(admin, labIds),
    loadProfilesById(admin, profileIds),
    loadStatuses(admin, [...sampleUserIds]),
  ]);

  const items = ordered.map((row): EventCardItem => {
    const counts = countsById.get(row.id) ?? { going: 0, checkedIn: 0 };
    const past = isEnded(row, now);
    const cover = eventCoverView(row);
    const lab = row.lab_id ? labsById.get(row.lab_id) : undefined;
    const hostProfile = row.lab_id === null ? profilesById.get(row.host_user_id) : undefined;
    const viewerRsvp = viewerRsvps?.get(row.id);
    return {
      slug: row.slug,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      mode: row.mode,
      venueName: row.venue_name,
      status: row.status,
      capacity: row.capacity,
      coverUrl: cover.coverUrl,
      coverThumbUrl: cover.coverThumbUrl,
      coverBlurhash: cover.coverBlurhash,
      host: lab
        ? { kind: 'lab', name: lab.name, href: `/labs/${lab.slug}` }
        : hostProfile
          ? { kind: 'member', name: hostProfile.displayName, href: `/u/${hostProfile.handle}` }
          : null,
      goingCount: counts.going,
      attendedCount: resolveAttendedCount(past, counts.checkedIn, counts.going),
      attendeeSample: (samplesById.get(row.id) ?? [])
        // A deleted account is never shown as "going".
        .filter((userId) => sampleFlags.get(userId)?.status !== 'deleted')
        .map((userId) => profilesById.get(userId))
        .filter((p): p is { displayName: string; handle: string } => p !== undefined)
        .map((p) => ({ displayName: p.displayName, handle: p.handle })),
      viewerRsvp: viewerRsvp
        ? { status: viewerRsvp.status, showPublicly: viewerRsvp.showPublicly }
        : null,
      isPast: past,
      isFull: row.capacity !== null && counts.going >= row.capacity,
    };
  });

  return { items, upcomingCount: upcomingRows.length };
}

/**
 * Embedded upcoming-events sections (Lab page / listing page / host profile).
 * Count-limited; space_only events are deliberately EXCLUDED — an embedded
 * section renders to broader audiences than a Space roster, so it only ever
 * carries public/members rows ('publicOnly' narrows further for signed-out
 * surfaces, with the full organic-proof treatment).
 */
export async function listUpcomingEventsFor(
  target: { labId: string } | { listingId: string } | { hostUserId: string },
  options: { publicOnly: boolean; now?: Date } = { publicOnly: false },
): Promise<EventListItem[]> {
  const admin = getSupabaseAdmin();
  const nowIso = (options.now ?? new Date()).toISOString();
  let query = admin
    .from('events')
    .select(
      'slug, title, category_id, starts_at, ends_at, timezone, mode, status, host_user_id, lab_id, source',
    )
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
  rows = options.publicOnly
    ? await dropAiOrTestHosted(admin, rows)
    : await dropTestHosted(admin, rows);
  rows = await dropDeletedHostUpcoming(admin, rows, options.now);
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
 *
 * ONE round-trip (front-door standard §2-E26): the featured-else-soonest
 * fallback is the ORDER BY — featured rows first (newest pin wins, NULLs
 * last), then the soonest of the rest. The window is wider than 1 so the
 * AI/test-host drop can fall through to the next organic candidate.
 */
export async function getFeaturedUpcomingPublicEvent(
  now: Date = new Date(),
): Promise<EventListItem | null> {
  const admin = getSupabaseAdmin();
  const nowIso = now.toISOString();
  const result = await admin
    .from('events')
    .select(
      'slug, title, category_id, starts_at, ends_at, timezone, mode, status, host_user_id, lab_id',
    )
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .eq('source', 'member')
    .gte('starts_at', nowIso)
    .order('featured_at', { ascending: false, nullsFirst: false })
    .order('starts_at', { ascending: true })
    .limit(12);
  if (result.error) throw new Error(`upcoming event query failed: ${result.error.message}`);
  const rows = await dropDeletedHostUpcoming(
    admin,
    await dropAiOrTestHosted(admin, (result.data ?? []) as unknown as EventViewRow[]),
    now,
  );

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
