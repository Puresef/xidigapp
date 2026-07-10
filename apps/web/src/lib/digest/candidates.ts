import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import type { DigestWindow } from './period';

/**
 * Deterministic weekly-digest candidate collector (PRD §21/§28).
 *
 * "Top Wins · open Asks · new Labs · new listings (+ the mentor highlight)."
 * Everything here is:
 *   * DETERMINISTIC — chronological (created_at desc), NO ranking, NO
 *     personalization, NO opaque scoring (locked v1.0 rule).
 *   * VISIBILITY-SAFE — only member/public-visible rows: published global Plaza
 *     posts (lab_id null), public+listed Labs, published listings. Never a
 *     private Lab, hidden/removed content, or anything DM/moderation-internal.
 *   * PII-FREE at rest — the stored snapshot carries entity ids + public titles
 *     only, never a member name/handle/email/phone.
 *
 * Runs as the service role, but every query hard-codes the same predicates RLS
 * would enforce, so nothing leaks.
 */

const LIMIT = 5;

export interface DigestPost {
  id: string;
  title: string | null;
}
export interface DigestLab {
  id: string;
  name: string;
  slug: string;
}
export interface DigestListing {
  id: string;
  name: string;
  city: string | null;
}
export interface DigestMentor {
  period: string;
  focus: string | null;
}
export interface DigestEvent {
  slug: string;
  title: string;
  startsAt: string;
}

export interface DigestCandidates {
  periodKey: string;
  window: { since: string; until: string };
  wins: DigestPost[];
  openAsks: DigestPost[];
  newLabs: DigestLab[];
  newListings: DigestListing[];
  mentor: DigestMentor | null;
  /**
   * Upcoming PUBLIC events slot (extras item 8) — optional so snapshots
   * stored before the slot existed still parse.
   */
  upcomingEvents?: DigestEvent[];
  counts: { wins: number; openAsks: number; newLabs: number; newListings: number };
}

export async function collectDigestCandidates(
  admin: SupabaseClient<Database>,
  window: DigestWindow,
): Promise<DigestCandidates> {
  const { since, until } = window;

  // Top Wins this week — published, global (not lab-scoped), member content.
  const winsQuery = admin
    .from('posts')
    .select('id, title')
    .eq('type', 'win')
    .eq('status', 'published')
    .is('lab_id', null)
    .gte('created_at', since)
    .lt('created_at', until)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  // Currently OPEN Asks (help still wanted) — most recent first.
  const asksQuery = admin
    .from('posts')
    .select('id, title')
    .eq('type', 'ask')
    .eq('ask_status', 'open')
    .eq('status', 'published')
    .is('lab_id', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  // New PUBLIC Labs — public + listed only (never a private/members-only Lab).
  const labsQuery = admin
    .from('labs')
    .select('id, name, slug')
    .eq('visibility', 'public')
    .eq('is_listed', true)
    .gte('created_at', since)
    .lt('created_at', until)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  // New listings — published only.
  const listingsQuery = admin
    .from('business_listings')
    .select('id, business_name, city')
    .eq('status', 'published')
    .gte('created_at', since)
    .lt('created_at', until)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  // Current Mentor-in-Residence (public featured slot), if any.
  const today = until.slice(0, 10);
  const mentorQuery = admin
    .from('mentor_residencies')
    .select('period, focus')
    .lte('starts_on', today)
    .gte('ends_on', today)
    .order('starts_on', { ascending: false })
    .limit(1);

  // Upcoming PUBLIC events (extras item 8): published + visible-to-everyone +
  // organic (source='member') rows starting after the window closes, soonest
  // first. Slug + title only — no host identity, no venue address (PII-free
  // rule; the event page does its own reveal folding).
  const eventsQuery = admin
    .from('events')
    .select('slug, title, starts_at')
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('moderation_status', 'published')
    .eq('source', 'member')
    .gte('starts_at', until)
    .order('starts_at', { ascending: true })
    .limit(LIMIT);

  const [wins, asks, labs, listings, mentor, events] = await Promise.all([
    winsQuery,
    asksQuery,
    labsQuery,
    listingsQuery,
    mentorQuery,
    eventsQuery,
  ]);

  for (const r of [wins, asks, labs, listings, mentor, events]) {
    if (r.error) throw new Error(`digest candidate query failed: ${r.error.message}`);
  }

  const winRows = (wins.data ?? []).map((p) => ({ id: p.id, title: p.title }));
  const askRows = (asks.data ?? []).map((p) => ({ id: p.id, title: p.title }));
  const labRows = (labs.data ?? []).map((l) => ({ id: l.id, name: l.name, slug: l.slug }));
  const listingRows = (listings.data ?? []).map((l) => ({
    id: l.id,
    name: l.business_name,
    city: l.city,
  }));
  const mentorRow = (mentor.data ?? [])[0] ?? null;
  const eventRows = (events.data ?? []).map((e) => ({
    slug: e.slug,
    title: e.title,
    startsAt: e.starts_at,
  }));

  return {
    periodKey: window.periodKey,
    window: { since, until },
    wins: winRows,
    openAsks: askRows,
    newLabs: labRows,
    newListings: listingRows,
    mentor: mentorRow ? { period: mentorRow.period, focus: mentorRow.focus } : null,
    upcomingEvents: eventRows,
    counts: {
      wins: winRows.length,
      openAsks: askRows.length,
      newLabs: labRows.length,
      newListings: listingRows.length,
    },
  };
}
