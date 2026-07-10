import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Events + RSVP RLS suite (extras item 8), covering migration
 * 20260710063000_events.sql.
 *
 * Conventions (same as phase4-labs.test.ts):
 *   * a policy that FILTERS rows            -> empty result set;
 *   * a REVOKED table/column grant on write -> /permission denied/;
 * Content rows are seeded via db.admin, mirroring the API's service-role
 * writer (every events/event_rsvps write is API-only by design).
 *
 * Locked privacy model under test:
 *   * members read published events per visibility; hosts see their own rows
 *     in any state; mods see everything; anon reads NOTHING via RLS (the
 *     login-free surface is the service-role projection);
 *   * venue_address / online_url are NOT member-selectable (column grant) —
 *     the API folds them per address_visibility / attendance;
 *   * event_rsvps: own rows + the event's host + mods only — other members
 *     can never enumerate attendance.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// --- fixtures ----------------------------------------------------------------

async function seedMember(handle: string): Promise<string> {
  const userId = await db.createAuthUser({ email: `${handle}@example.com`, gateBypass: true });
  await db.asUser(userId, (tx) =>
    tx.query(`insert into profiles (user_id, display_name, handle) values ($1, $2, $3)`, [
      userId,
      handle,
      handle,
    ]),
  );
  return userId;
}

async function seedMod(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'mod' where id = $1`, [userId]);
  return userId;
}

async function seedLab(lead: string, slug: string): Promise<string> {
  const res = await db.admin.query(
    `insert into labs (name, slug, lead_user_id, visibility, space_mode, stage)
     values ($1, $2, $3, 'members', 'club', 'idea') returning id`,
    [`Lab ${slug}`, slug, lead],
  );
  const labId = (res.rows[0] as { id: string }).id;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now())`,
    [labId, lead],
  );
  return labId;
}

/** Seed an event the way the API's service role does. */
async function seedEvent(
  host: string,
  opts: {
    slug: string;
    visibility?: 'public' | 'members' | 'space_only';
    status?: 'draft' | 'published' | 'cancelled';
    moderationStatus?: 'published' | 'hidden' | 'removed';
    labId?: string | null;
    listingId?: string | null;
    candidateId?: string | null;
    venueAddress?: string | null;
    onlineUrl?: string | null;
    capacity?: number | null;
  },
): Promise<string> {
  const res = await db.admin.query(
    `insert into events
       (slug, title, category_id, starts_at, timezone, mode, host_user_id,
        visibility, status, moderation_status, lab_id, listing_id, candidate_id,
        venue_address, online_url, capacity)
     values ($1, $2, 'community', now() + interval '7 days', 'UTC', 'in_person',
             $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id`,
    [
      opts.slug,
      `Event ${opts.slug}`,
      host,
      opts.visibility ?? 'members',
      opts.status ?? 'published',
      opts.moderationStatus ?? 'published',
      opts.labId ?? null,
      opts.listingId ?? null,
      opts.candidateId ?? null,
      opts.venueAddress ?? null,
      opts.onlineUrl ?? null,
      opts.capacity ?? null,
    ],
  );
  return (res.rows[0] as { id: string }).id;
}

/** How many rows of events with id=$1 does `viewer` see (safe columns only)? */
async function countVisible(viewer: string, eventId: string): Promise<number> {
  const rows = await db.asUser(viewer, (tx) =>
    tx.query(`select id from events where id = $1`, [eventId]),
  );
  return rows.rows.length;
}

// --- category lookup ----------------------------------------------------------

describe('event_categories (slug-PK lookup)', () => {
  it('seeds the five locked categories, member-readable, not writable', async () => {
    const probe = await seedMember('evt_cat_probe');

    const rows = await db.asUser(probe, (tx) =>
      tx.query(`select slug from event_categories order by position`),
    );
    expect(rows.rows.map((r) => (r as { slug: string }).slug)).toEqual([
      'community',
      'talk',
      'demo_day',
      'workshop',
      'business',
    ]);

    await expect(
      db.asUser(probe, (tx) =>
        tx.query(`insert into event_categories (slug, name_en) values ('rogue', 'Rogue')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- events visibility ---------------------------------------------------------

describe('events visibility (RLS)', () => {
  it('published public/members events are member-visible; anon has no grant at all', async () => {
    const host = await seedMember('evt_host_vis');
    const other = await seedMember('evt_other_vis');
    const publicEvent = await seedEvent(host, { slug: 'vis-public', visibility: 'public' });
    const membersEvent = await seedEvent(host, { slug: 'vis-members', visibility: 'members' });

    expect(await countVisible(other, publicEvent)).toBe(1);
    expect(await countVisible(other, membersEvent)).toBe(1);

    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select id from events`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('space_only events are visible to Space members and the host, invisible to others', async () => {
    const lead = await seedMember('evt_lead_space');
    const insider = await seedMember('evt_insider');
    const outsider = await seedMember('evt_outsider');
    const labId = await seedLab(lead, 'evt-space-lab');
    await db.admin.query(
      `insert into lab_members (lab_id, user_id, role, status, joined_at)
       values ($1, $2, 'member', 'active', now())`,
      [labId, insider],
    );

    const eventId = await seedEvent(lead, {
      slug: 'space-only-evt',
      visibility: 'space_only',
      labId,
    });

    expect(await countVisible(lead, eventId)).toBe(1);
    expect(await countVisible(insider, eventId)).toBe(1);
    expect(await countVisible(outsider, eventId)).toBe(0);
  });

  it('drafts are host-only (plus mods); cancelled stays member-readable', async () => {
    const host = await seedMember('evt_host_draft');
    const other = await seedMember('evt_other_draft');
    const mod = await seedMod('evt_mod_draft');

    const draft = await seedEvent(host, { slug: 'draft-evt', status: 'draft' });
    expect(await countVisible(host, draft)).toBe(1);
    expect(await countVisible(other, draft)).toBe(0);
    expect(await countVisible(mod, draft)).toBe(1);

    const cancelled = await seedEvent(host, { slug: 'cancelled-evt', status: 'cancelled' });
    expect(await countVisible(other, cancelled)).toBe(1);
  });

  it('moderation-hidden events disappear for members but not for the host or mods', async () => {
    const host = await seedMember('evt_host_hidden');
    const other = await seedMember('evt_other_hidden');
    const mod = await seedMod('evt_mod_hidden');

    const hidden = await seedEvent(host, {
      slug: 'hidden-evt',
      visibility: 'public',
      moderationStatus: 'hidden',
    });
    expect(await countVisible(other, hidden)).toBe(0);
    expect(await countVisible(host, hidden)).toBe(1);
    expect(await countVisible(mod, hidden)).toBe(1);
  });
});

// --- column grants (reveal-gated fields) ---------------------------------------

describe('events column grants', () => {
  it('venue_address and online_url are not member-selectable — even for the host', async () => {
    const host = await seedMember('evt_host_cols');
    await seedEvent(host, {
      slug: 'cols-evt',
      visibility: 'public',
      venueAddress: '12 Secret Street',
      onlineUrl: 'https://meet.example.com/xyz',
    });

    await expect(
      db.asUser(host, (tx) => tx.query(`select venue_address from events`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(host, (tx) => tx.query(`select online_url from events`)),
    ).rejects.toThrow(/permission denied/);
    // `select *` therefore fails too — the API must name safe columns.
    await expect(db.asUser(host, (tx) => tx.query(`select * from events`))).rejects.toThrow(
      /permission denied/,
    );

    // The safe projection works (address_visibility itself is not secret).
    const safe = await db.asUser(host, (tx) =>
      tx.query(`select slug, venue_name, address_visibility from events where slug = 'cols-evt'`),
    );
    expect(safe.rows.length).toBe(1);
  });
});

// --- write model (API-only) ------------------------------------------------------

describe('events + event_rsvps writes are API-only', () => {
  it('members cannot insert/update/delete events directly', async () => {
    const host = await seedMember('evt_host_write');
    const eventId = await seedEvent(host, { slug: 'write-evt' });

    await expect(
      db.asUser(host, (tx) =>
        tx.query(
          `insert into events (slug, title, category_id, starts_at, timezone, mode, host_user_id)
           values ('forged', 'Forged', 'community', now(), 'UTC', 'online', $1)`,
          [host],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(host, (tx) =>
        tx.query(`update events set title = 'Edited' where id = $1`, [eventId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(host, (tx) => tx.query(`delete from events where id = $1`, [eventId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('members cannot write event_rsvps directly (capacity/visibility gates live in the API)', async () => {
    const host = await seedMember('evt_host_rsvpw');
    const member = await seedMember('evt_member_rsvpw');
    const eventId = await seedEvent(host, { slug: 'rsvpw-evt' });

    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
          [eventId, member],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- rsvp privacy -----------------------------------------------------------------

describe('event_rsvps privacy (RLS)', () => {
  it('own rows + the host + mods only — a third member sees nothing', async () => {
    const host = await seedMember('evt_host_rsvp');
    const attendee = await seedMember('evt_attendee');
    const bystander = await seedMember('evt_bystander');
    const mod = await seedMod('evt_mod_rsvp');
    const eventId = await seedEvent(host, { slug: 'rsvp-evt', visibility: 'public' });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status, show_publicly)
       values ($1, $2, 'going', false)`,
      [eventId, attendee],
    );

    const own = await db.asUser(attendee, (tx) =>
      tx.query(`select status from event_rsvps where event_id = $1`, [eventId]),
    );
    expect(own.rows.length).toBe(1);

    const hostView = await db.asUser(host, (tx) =>
      tx.query(`select user_id from event_rsvps where event_id = $1`, [eventId]),
    );
    expect(hostView.rows.length).toBe(1);

    // The bystander can read the EVENT but never attendance rows — opted-in
    // names and floor-gated counts are served by the API, not row enumeration.
    const bystanderView = await db.asUser(bystander, (tx) =>
      tx.query(`select user_id from event_rsvps where event_id = $1`, [eventId]),
    );
    expect(bystanderView.rows).toEqual([]);

    const modView = await db.asUser(mod, (tx) =>
      tx.query(`select user_id from event_rsvps where event_id = $1`, [eventId]),
    );
    expect(modView.rows.length).toBe(1);
  });

  it('one RSVP per (event, member) — the primary key holds', async () => {
    const host = await seedMember('evt_host_uni');
    const attendee = await seedMember('evt_attendee_uni');
    const eventId = await seedEvent(host, { slug: 'uni-evt' });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, attendee],
    );
    await expect(
      db.admin.query(
        `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'interested')`,
        [eventId, attendee],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

// --- schema invariants ---------------------------------------------------------

describe('events schema invariants (CHECKs)', () => {
  it('rejects two containers, space_only without a Lab, end-before-start, zero capacity', async () => {
    const host = await seedMember('evt_host_check');
    const labId = await seedLab(host, 'evt-check-lab');
    const listing = await db.admin.query(
      `insert into business_listings (owner_user_id, business_name, category_id)
       values ($1, 'Check Biz', (select id from listing_categories limit 1)) returning id`,
      [host],
    );
    const listingId = (listing.rows[0] as { id: string }).id;

    await expect(
      seedEvent(host, { slug: 'two-containers', labId, listingId }),
    ).rejects.toThrow(/events_one_container/);

    await expect(
      seedEvent(host, { slug: 'space-no-lab', visibility: 'space_only' }),
    ).rejects.toThrow(/events_space_only_needs_lab/);

    await expect(
      db.admin.query(
        `insert into events (slug, title, category_id, starts_at, ends_at, timezone, mode, host_user_id)
         values ('ends-first', 'Ends first', 'community', now() + interval '2 days',
                 now() + interval '1 day', 'UTC', 'online', $1)`,
        [host],
      ),
    ).rejects.toThrow(/events_ends_after_start/);

    await expect(seedEvent(host, { slug: 'zero-cap', capacity: 0 })).rejects.toThrow(
      /events_capacity_positive/,
    );
  });

  it("extends entity_type with 'event' (reports/moderation/notifications reach)", async () => {
    const res = await db.admin.query(`select 'event'::entity_type as v`);
    expect((res.rows[0] as { v: string }).v).toBe('event');
  });
});
