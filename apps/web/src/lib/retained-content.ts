import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { isLiveStatus, loadAccountFlags, type AccountFlags } from '@/lib/account-flags';

/**
 * Retained-content projection rules — what a service-role projection may show
 * once the member behind a piece of content is no longer live (owner rulings,
 * 11 Sep; PRD Relook §24 / D-13, D-14). Service-role reads bypass RLS, so each
 * surface must apply these itself; keeping them here keeps them identical.
 *
 * LISTINGS — a listing whose owner is not live is NOT projected publicly.
 *   Nothing in the schema separates independently public business data from
 *   member-derived data: `contact_links` is one owner-editable field (the
 *   business number and a personal WhatsApp look the same) and `source` says
 *   who created the row, not who wrote each field since a claim. With no way
 *   to distinguish, the ruling is to unpublish pending claim/review rather
 *   than guess, so every public projection suppresses it. The row is not
 *   touched; a moderator still reads it under RLS (review), and the member
 *   read path was already hiding it (business_listings RLS uses
 *   author_is_active). "Not live" matches that RLS rule and signed-out
 *   search: suspended/deactivated owners were already hidden from members and
 *   search, so aligning the signed-out page and the external API with them is
 *   deliberate, not incidental. Owner-less (seeded, unclaimed) listings are
 *   unaffected. A listing owned by a quarantined TEST account (users.is_test,
 *   migration 20260912050000) is not projected publicly either, whatever the
 *   owner's status: a fake member's business is not community proof.
 *
 * EVENTS — only DELETION changes an event's projection (suspension is
 *   reversible and out of this slice), and only for an event hosted by the
 *   member ALONE: an event hosted by a Space (lab_id set) belongs to the Space,
 *   which still exists, so it keeps running. With no handover mechanism in the
 *   product, an UPCOMING member-hosted event whose host was deleted is treated
 *   as no longer running: it leaves every discovery surface, takes no RSVPs, sends no
 *   reminders, exports no calendar entry, and its page says so. A PAST event
 *   keeps its record with the tombstone host ("Deleted member", no profile
 *   link, no host stats). No event row is written.
 */

/**
 * The tombstone display name anonymise_user() writes to a deleted member's
 * profile (migration 20260911000100). Pinned against the SQL literal by
 * packages/db/src/retained-award-redaction.test.ts — change both together.
 */
export const TOMBSTONE_DISPLAY_NAME = 'Deleted member';

/** One status map for a set of member ids (service role; unknown ids fail closed). */
export async function loadStatuses(
  admin: SupabaseClient<Database>,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, AccountFlags>> {
  return loadAccountFlags(
    admin,
    ids.filter((id): id is string => typeof id === 'string'),
  );
}

// --- Space history ----------------------------------------------------------

/**
 * The TypeScript twin of the SQL author_is_retained() (migration
 * 20260911001100): Space history stays visible when its author is live OR
 * deleted (a tombstone); suspended and deactivated authors stay hidden. A
 * service-role projection of Space history must apply it so that no public
 * surface ever shows more than the member read path does. Unknown ids fail
 * closed (not shown).
 */
export function isRetainedAuthorStatus(
  status: Enums<'account_status'> | null | undefined,
): boolean {
  return isLiveStatus(status) || status === 'deleted';
}

/** Keep rows whose author is retained; author-less rows stay (as in the RLS rule). */
export async function keepRetainedAuthorRows<T extends { author_user_id: string | null }>(
  admin: SupabaseClient<Database>,
  rows: readonly T[],
): Promise<T[]> {
  const flags = await loadStatuses(
    admin,
    rows.map((row) => row.author_user_id),
  );
  return rows.filter(
    (row) =>
      row.author_user_id === null || isRetainedAuthorStatus(flags.get(row.author_user_id)?.status),
  );
}

// --- listings ---------------------------------------------------------------

/**
 * True when a listing may be projected publicly: owner-less, or its owner is
 * live AND not a quarantined test account. `owner` is the owner's account
 * flags (loadStatuses); unknown (undefined) fails closed.
 */
export function listingIsPubliclyProjectable(
  ownerUserId: string | null,
  owner: Pick<AccountFlags, 'status' | 'isTest'> | null | undefined,
): boolean {
  if (ownerUserId === null) return true;
  if (!owner) return false;
  return isLiveStatus(owner.status) && !owner.isTest;
}

/** Drop rows whose owner is not live or is a test account; owner-less rows stay. */
export async function keepProjectableListings<T extends { owner_user_id: string | null }>(
  admin: SupabaseClient<Database>,
  rows: readonly T[],
): Promise<T[]> {
  const flags = await loadStatuses(
    admin,
    rows.map((row) => row.owner_user_id),
  );
  return rows.filter((row) =>
    listingIsPubliclyProjectable(
      row.owner_user_id,
      row.owner_user_id ? flags.get(row.owner_user_id) : null,
    ),
  );
}

// --- events -----------------------------------------------------------------

export type EventHostState =
  /** Host not deleted (any other status), or the event is Space-hosted — unchanged. */
  | 'host_present'
  /** Host deleted, event not yet ended: no longer running (no handover exists). */
  | 'host_deleted_upcoming'
  /** Host deleted, event ended: kept as history with a tombstone host. */
  | 'host_deleted_past';

export function eventHostState(
  hostStatus: Enums<'account_status'> | null | undefined,
  ended: boolean,
  hostedBySpace: boolean,
): EventHostState {
  if (hostedBySpace || hostStatus !== 'deleted') return 'host_present';
  return ended ? 'host_deleted_past' : 'host_deleted_upcoming';
}

interface EventHostRow {
  host_user_id: string;
  lab_id: string | null;
  starts_at: string;
  ends_at: string | null;
}

function eventEnded(row: { starts_at: string; ends_at: string | null }, now: Date): boolean {
  return new Date(row.ends_at ?? row.starts_at).getTime() < now.getTime();
}

/**
 * Drop UPCOMING events whose host was deleted — the discovery rule. Past
 * events stay (history). A missing host row is treated as present: events
 * always have a host, and this rule only ever acts on a confirmed deletion.
 */
export async function dropDeletedHostUpcoming<T extends EventHostRow>(
  admin: SupabaseClient<Database>,
  rows: readonly T[],
  now: Date = new Date(),
): Promise<T[]> {
  if (rows.length === 0) return [];
  const flags = await loadStatuses(
    admin,
    rows.map((row) => row.host_user_id),
  );
  return rows.filter(
    (row) =>
      eventHostState(
        flags.get(row.host_user_id)?.status,
        eventEnded(row, now),
        row.lab_id !== null,
      ) !== 'host_deleted_upcoming',
  );
}

/** The one-event form of the rule, for routes that act on a single event. */
export async function loadEventHostState(
  admin: SupabaseClient<Database>,
  row: EventHostRow,
  now: Date = new Date(),
): Promise<EventHostState> {
  const flags = await loadStatuses(admin, [row.host_user_id]);
  return eventHostState(
    flags.get(row.host_user_id)?.status,
    eventEnded(row, now),
    row.lab_id !== null,
  );
}
