// packages/db/src/munaasabado.test.ts
// Munaasabado dispatch invariants (design frames 9a-9c, e1-e7; rulings 1/6).
// Each block states the product rule it locks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);
afterAll(async () => {
  await db.stop();
});

/** Seed an event the way the API's service role does (events.test.ts pattern). */
async function seedEvent(
  host: string,
  opts: { slug: string; capacity?: number | null },
): Promise<string> {
  const res = await db.admin.query(
    `insert into events
       (slug, title, category_id, starts_at, timezone, mode, host_user_id, capacity)
     values ($1, $2, 'community', now() + interval '7 days', 'UTC', 'in_person', $3, $4)
     returning id`,
    [opts.slug, `Event ${opts.slug}`, host, opts.capacity ?? null],
  );
  return (res.rows[0] as { id: string }).id;
}

/** Seed a mentor residency (advisor + slot window) via the service role. */
async function seedResidency(advisor: string, period: string): Promise<string> {
  const res = await db.admin.query(
    `insert into mentor_residencies (advisor_user_id, period, starts_on, ends_on)
     values ($1, $2, current_date, current_date + 7) returning id`,
    [advisor, period],
  );
  return (res.rows[0] as { id: string }).id;
}

describe('events cover + agenda columns', () => {
  it('event_cover media kind is seeded', async () => {
    const { rows } = await db.admin.query("select id from media_kinds where id = 'event_cover'");
    expect(rows).toHaveLength(1);
  });
  it('events carries cover_path, cover_blurhash, agenda (default [])', async () => {
    const { rows } = await db.admin.query(
      `select column_name, column_default from information_schema.columns
       where table_name = 'events' and column_name in ('cover_path','cover_blurhash','agenda')`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual([
      'agenda',
      'cover_blurhash',
      'cover_path',
    ]);
  });

  it('member can select cover_path, cover_blurhash, agenda — but not venue_address', async () => {
    const host = await seedMember(db, 'cover_host');
    const member = await seedMember(db, 'cover_reader');
    const eventId = await seedEvent(host, { slug: 'cover-evt' });

    const read = await db.asUser(member, (tx) =>
      tx.query(`select cover_path, cover_blurhash, agenda from events where id = $1`, [eventId]),
    );
    expect(read.rows).toEqual([{ cover_path: null, cover_blurhash: null, agenda: [] }]);

    // The scoped-grant pattern still holds: the pre-existing reveal-gated
    // column stays off-limits to members even though the new columns joined
    // the grant.
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`select venue_address from events where id = $1`, [eventId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('honest capacity — DB-level atomic guard', () => {
  it('rejects a going RSVP beyond capacity even via service role', async () => {
    const host = await seedMember(db, 'cap_host');
    const a = await seedMember(db, 'cap_a');
    const b = await seedMember(db, 'cap_b');
    const eventId = await seedEvent(host, { slug: 'cap-evt', capacity: 1 });

    // First 'going' fills the only seat.
    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, a],
    );

    // The second 'going' — inserted through the admin (service-role-equivalent)
    // connection, which bypasses RLS but NOT the BEFORE trigger — must still
    // be rejected: capacity is a DB guarantee, not an API-layer courtesy.
    await expect(
      db.admin.query(
        `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
        [eventId, b],
      ),
    ).rejects.toThrow(/event_full/);
  });

  it('interested is never capacity-blocked', async () => {
    const host = await seedMember(db, 'cap_int_host');
    const a = await seedMember(db, 'cap_int_a');
    const b = await seedMember(db, 'cap_int_b');
    const eventId = await seedEvent(host, { slug: 'cap-int-evt', capacity: 1 });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, a],
    );
    // The single seat is already taken, but 'interested' carries no capacity
    // claim at all — it must never be blocked by a full event.
    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'interested')`,
      [eventId, b],
    );

    const row = await db.admin.query(
      `select status from event_rsvps where event_id = $1 and user_id = $2`,
      [eventId, b],
    );
    expect((row.rows[0] as { status: string }).status).toBe('interested');
  });

  it('cancel frees the seat: delete A then B inserts fine', async () => {
    const host = await seedMember(db, 'cap_cancel_host');
    const a = await seedMember(db, 'cap_cancel_a');
    const b = await seedMember(db, 'cap_cancel_b');
    const eventId = await seedEvent(host, { slug: 'cap-cancel-evt', capacity: 1 });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, a],
    );
    await expect(
      db.admin.query(
        `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
        [eventId, b],
      ),
    ).rejects.toThrow(/event_full/);

    // A cancels (row delete) — the trigger's count(*) sees the freed seat.
    await db.admin.query(`delete from event_rsvps where event_id = $1 and user_id = $2`, [
      eventId,
      a,
    ]);
    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, b],
    );

    const row = await db.admin.query(
      `select status from event_rsvps where event_id = $1 and user_id = $2`,
      [eventId, b],
    );
    expect((row.rows[0] as { status: string }).status).toBe('going');
  });

  it('status flip going->interested then a third member takes the seat', async () => {
    const host = await seedMember(db, 'cap_flip_host');
    const a = await seedMember(db, 'cap_flip_a');
    const c = await seedMember(db, 'cap_flip_c');
    const eventId = await seedEvent(host, { slug: 'cap-flip-evt', capacity: 1 });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, a],
    );
    // A flips off the seat — an UPDATE away from 'going' is never capacity
    // gated (only a transition INTO/staying 'going' is).
    await db.admin.query(
      `update event_rsvps set status = 'interested' where event_id = $1 and user_id = $2`,
      [eventId, a],
    );
    // The seat is free again — a third member can take it.
    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, c],
    );

    const going = await db.admin.query(
      `select user_id from event_rsvps where event_id = $1 and status = 'going'`,
      [eventId],
    );
    expect(going.rows.map((r) => (r as { user_id: string }).user_id)).toEqual([c]);
  });
});

describe('named RSVP default', () => {
  it('show_publicly defaults true on new rows', async () => {
    const host = await seedMember(db, 'named_host');
    const member = await seedMember(db, 'named_member');
    const eventId = await seedEvent(host, { slug: 'named-evt' });

    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'interested')`,
      [eventId, member],
    );
    const row = await db.admin.query(
      `select show_publicly from event_rsvps where event_id = $1 and user_id = $2`,
      [eventId, member],
    );
    expect((row.rows[0] as { show_publicly: boolean }).show_publicly).toBe(true);
  });
});

describe('check-in', () => {
  it('checked_in_at column exists and RLS keeps rows API-only for writes', async () => {
    const col = await db.admin.query(
      `select column_name from information_schema.columns
       where table_name = 'event_rsvps' and column_name = 'checked_in_at'`,
    );
    expect(col.rows).toHaveLength(1);

    const host = await seedMember(db, 'checkin_host');
    const member = await seedMember(db, 'checkin_member');
    const eventId = await seedEvent(host, { slug: 'checkin-evt' });
    await db.admin.query(
      `insert into event_rsvps (event_id, user_id, status) values ($1, $2, 'going')`,
      [eventId, member],
    );

    // A member cannot self-check-in directly — event_rsvps writes stay
    // API-only, same as every other column on the table.
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `update event_rsvps set checked_in_at = now() where event_id = $1 and user_id = $2`,
          [eventId, member],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // The service-role writer (host checking someone in at the door) can.
    await db.admin.query(
      `update event_rsvps set checked_in_at = now() where event_id = $1 and user_id = $2`,
      [eventId, member],
    );
    const row = await db.admin.query(
      `select checked_in_at from event_rsvps where event_id = $1 and user_id = $2`,
      [eventId, member],
    );
    expect((row.rows[0] as { checked_in_at: Date | null }).checked_in_at).not.toBeNull();
  });
});

describe("content_source 'system'", () => {
  it('enum carries system', async () => {
    const { rows } = await db.admin.query(
      `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'content_source'`,
    );
    expect(rows.map((r) => r.enumlabel)).toContain('system');
  });
});

describe('award_results', () => {
  it('member can read results, cannot write', async () => {
    const member = await seedMember(db, 'award_reader');
    await db.admin.query(
      `insert into award_cycles (quarter, opens_at, closes_at)
       values ('2026-Q3', now() - interval '1 day', now() + interval '1 day')`,
    );
    const target = (await db.admin.query(`select gen_random_uuid() as id`)).rows[0] as {
      id: string;
    };
    await db.admin.query(
      `insert into award_results (quarter, category, target_type, target_id, votes)
       values ('2026-Q3', 'best_lab', 'lab', $1, 5)`,
      [target.id],
    );

    const read = await db.asUser(member, (tx) =>
      tx.query(`select category, votes from award_results where quarter = '2026-Q3'`),
    );
    expect(read.rows).toEqual([{ category: 'best_lab', votes: 5 }]);

    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into award_results (quarter, category, target_type, target_id, votes)
           values ('2026-Q3', 'best_win', 'post', gen_random_uuid(), 1)`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('one row per (quarter, category)', async () => {
    await db.admin.query(
      `insert into award_cycles (quarter, opens_at, closes_at)
       values ('2026-Q4', now() - interval '1 day', now() + interval '1 day')`,
    );
    const t1 = (await db.admin.query(`select gen_random_uuid() as id`)).rows[0] as { id: string };
    const t2 = (await db.admin.query(`select gen_random_uuid() as id`)).rows[0] as { id: string };

    await db.admin.query(
      `insert into award_results (quarter, category, target_type, target_id, votes)
       values ('2026-Q4', 'best_win', 'post', $1, 3)`,
      [t1.id],
    );
    await expect(
      db.admin.query(
        `insert into award_results (quarter, category, target_type, target_id, votes)
         values ('2026-Q4', 'best_win', 'post', $1, 9)`,
        [t2.id],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('mentor slots', () => {
  it('member reads open slots but never the booker identity (column grant)', async () => {
    const advisor = await seedMember(db, 'mentor_advisor_read');
    const member = await seedMember(db, 'mentor_reader');
    const residencyId = await seedResidency(advisor, 'mentor-slots-read-period');
    const slot = await db.admin.query(
      `insert into mentor_slots (residency_id, starts_at, ends_at)
       values ($1, now() + interval '1 day', now() + interval '1 day' + interval '20 minutes')
       returning id`,
      [residencyId],
    );
    const slotId = (slot.rows[0] as { id: string }).id;
    await db.admin.query(
      `update mentor_slots set booked_by_user_id = $1, booked_at = now() where id = $2`,
      [member, slotId],
    );

    // The safe columns — including whether the slot is booked — are readable.
    const read = await db.asUser(member, (tx) =>
      tx.query(`select id, booked_at from mentor_slots where id = $1`, [slotId]),
    );
    expect(read.rows).toHaveLength(1);
    expect((read.rows[0] as { booked_at: Date | null }).booked_at).not.toBeNull();

    // But WHO booked it never reaches another member's client.
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`select booked_by_user_id from mentor_slots where id = $1`, [slotId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('writes revoked from authenticated', async () => {
    const advisor = await seedMember(db, 'mentor_advisor_write');
    const member = await seedMember(db, 'mentor_writer');
    const residencyId = await seedResidency(advisor, 'mentor-slots-write-period');

    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into mentor_slots (residency_id, starts_at, ends_at)
           values ($1, now(), now() + interval '20 minutes')`,
          [residencyId],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    const slot = await db.admin.query(
      `insert into mentor_slots (residency_id, starts_at, ends_at)
       values ($1, now() + interval '2 days', now() + interval '2 days' + interval '20 minutes')
       returning id`,
      [residencyId],
    );
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `update mentor_slots set booked_by_user_id = $1, booked_at = now() where id = $2`,
          [member, (slot.rows[0] as { id: string }).id],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('unique active booking per member per residency', async () => {
    const advisor = await seedMember(db, 'mentor_advisor_unique');
    const member = await seedMember(db, 'mentor_unique_member');
    const residencyId = await seedResidency(advisor, 'mentor-slots-unique-period');

    const slot1 = await db.admin.query(
      `insert into mentor_slots (residency_id, starts_at, ends_at)
       values ($1, now() + interval '1 day', now() + interval '1 day' + interval '20 minutes')
       returning id`,
      [residencyId],
    );
    const slot2 = await db.admin.query(
      `insert into mentor_slots (residency_id, starts_at, ends_at)
       values ($1, now() + interval '2 days', now() + interval '2 days' + interval '20 minutes')
       returning id`,
      [residencyId],
    );

    await db.admin.query(
      `update mentor_slots set booked_by_user_id = $1, booked_at = now() where id = $2`,
      [member, (slot1.rows[0] as { id: string }).id],
    );
    // Same member, same residency, a second slot — the partial unique index
    // (one ACTIVE booking per member per residency) must refuse it.
    await expect(
      db.admin.query(
        `update mentor_slots set booked_by_user_id = $1, booked_at = now() where id = $2`,
        [member, (slot2.rows[0] as { id: string }).id],
      ),
    ).rejects.toThrow(/duplicate key|mentor_slots_one_booking_per_member/);
  });

  it('slot window sane: ends_at > starts_at CHECK', async () => {
    const advisor = await seedMember(db, 'mentor_advisor_window');
    const residencyId = await seedResidency(advisor, 'mentor-slots-window-period');

    await expect(
      db.admin.query(
        `insert into mentor_slots (residency_id, starts_at, ends_at)
         values ($1, now() + interval '2 days', now() + interval '1 day')`,
        [residencyId],
      ),
    ).rejects.toThrow(/mentor_slots_window/);
  });
});
