import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Per-user DM read-state suite (A5a follow-up), covering migration
 * 20260910000000_dm_read_states.sql. Read state now lives in dm_read_states,
 * one row per (conversation, participant), off the shared conversations row:
 *
 *   * a participant reads ONLY their own row; the counterpart's row is
 *     invisible under RLS (so there is nothing to leak, and no shared-row
 *     UPDATE to emit a realtime event for);
 *   * the table is NOT in the supabase_realtime publication — a read-mark
 *     produces no realtime event on any table the counterpart subscribes to;
 *   * client writes are revoked (API-only, service role), matching every
 *     other DM write;
 *   * dm_unread_count()/dm_inbox() count from the caller's own row and clear
 *     when it advances — unread tracking preserved;
 *   * the conversations.*_last_read_at columns are dead: writing them no
 *     longer changes any unread count (the read source has moved).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

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

async function seedConversation(initiator: string, recipient: string): Promise<string> {
  const res = await db.admin.query(
    `insert into conversations (initiator_user_id, recipient_user_id, status)
     values ($1, $2, 'accepted') returning id`,
    [initiator, recipient],
  );
  return res.rows[0].id as string;
}

async function seedMessage(conversationId: string, sender: string, body: string): Promise<void> {
  await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3)`,
    [conversationId, sender, body],
  );
}

/** The exact write the /read route makes under the new model. */
async function markRead(conversationId: string, userId: string): Promise<void> {
  await db.admin.query(
    `insert into dm_read_states (conversation_id, user_id, last_read_at)
     values ($1, $2, now())
     on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at`,
    [conversationId, userId],
  );
}

describe('dm_read_states row privacy', () => {
  it('a participant reads only their own row; the counterpart’s is invisible', async () => {
    const alice = await seedMember('rs_alice');
    const bob = await seedMember('rs_bob');
    const convo = await seedConversation(alice, bob);
    await markRead(convo, alice);
    await markRead(convo, bob);

    const aliceView = await db.asUser(alice, (tx) =>
      tx.query(`select user_id from dm_read_states where conversation_id = $1`, [convo]),
    );
    expect(aliceView.rows).toEqual([{ user_id: alice }]);

    const bobView = await db.asUser(bob, (tx) =>
      tx.query(`select user_id from dm_read_states where conversation_id = $1`, [convo]),
    );
    expect(bobView.rows).toEqual([{ user_id: bob }]);
  });

  it('an uninvolved member and anon read nothing', async () => {
    const alice = await seedMember('rs_carol');
    const bob = await seedMember('rs_dahir');
    const carol = await seedMember('rs_eve');
    const convo = await seedConversation(alice, bob);
    await markRead(convo, alice);

    const carolView = await db.asUser(carol, (tx) =>
      tx.query(`select * from dm_read_states where conversation_id = $1`, [convo]),
    );
    expect(carolView.rows).toHaveLength(0);

    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select * from dm_read_states limit 1`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('client writes are revoked (API-only)', async () => {
    const alice = await seedMember('rs_fuaad');
    const bob = await seedMember('rs_guled');
    const convo = await seedConversation(alice, bob);

    await expect(
      db.asUser(alice, (tx) =>
        tx.query(
          `insert into dm_read_states (conversation_id, user_id) values ($1, $2)`,
          [convo, alice],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('is NOT in the realtime publication (no read-mark event reaches anyone)', async () => {
    const res = await db.admin.query(
      `select count(*)::int as n
       from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_read_states'`,
    );
    expect(res.rows[0].n).toBe(0);
    // Sanity: conversations IS published (so the contrast is real, not a
    // missing-publication artifact).
    const conv = await db.admin.query(
      `select count(*)::int as n
       from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'`,
    );
    expect(conv.rows[0].n).toBe(1);
  });
});

describe('unread tracking via dm_read_states', () => {
  it('counts the caller’s own unread and clears when their row advances', async () => {
    const alice = await seedMember('rs_hodan');
    const bob = await seedMember('rs_iman');
    const convo = await seedConversation(alice, bob);
    await seedMessage(convo, alice, 'salaan 1');
    await seedMessage(convo, alice, 'salaan 2');

    const before = await db.asUser(bob, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(before.rows[0].n).toBe(1); // one conversation with unread inbound

    const inboxBefore = await db.asUser(bob, (tx) => tx.query(`select * from dm_inbox()`));
    expect(inboxBefore.rows.find((r) => r.conversation_id === convo)?.unread_count).toBe(2);

    await markRead(convo, bob);

    const after = await db.asUser(bob, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(after.rows[0].n).toBe(0);
    const inboxAfter = await db.asUser(bob, (tx) => tx.query(`select * from dm_inbox()`));
    expect(inboxAfter.rows.find((r) => r.conversation_id === convo)?.unread_count).toBe(0);
  });

  it('the sender sees zero unread for messages they sent', async () => {
    const alice = await seedMember('rs_jamal');
    const bob = await seedMember('rs_kaltuun');
    const convo = await seedConversation(alice, bob);
    await seedMessage(convo, alice, 'only from alice');

    const aliceUnread = await db.asUser(alice, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(aliceUnread.rows[0].n).toBe(0);
  });

  it('writing the dead conversations columns no longer affects unread (source moved)', async () => {
    const alice = await seedMember('rs_liban');
    const bob = await seedMember('rs_muna');
    const convo = await seedConversation(alice, bob);
    await seedMessage(convo, alice, 'unread inbound');

    // The legacy column write that USED to clear unread now does nothing.
    await db.admin.query(
      `update conversations set recipient_last_read_at = now() where id = $1`,
      [convo],
    );
    const stillUnread = await db.asUser(bob, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(stillUnread.rows[0].n).toBe(1);

    // …only the dm_read_states write clears it.
    await markRead(convo, bob);
    const cleared = await db.asUser(bob, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(cleared.rows[0].n).toBe(0);
  });

  it('backfill copies existing conversations read columns into dm_read_states', async () => {
    // Simulate pre-migration data by writing the legacy columns, then run the
    // backfill statement and confirm rows appear. (The migration ran once at
    // boot; here we prove the backfill SELECT shape is correct against fresh
    // legacy data using the same idempotent upsert.)
    const alice = await seedMember('rs_nadifa');
    const bob = await seedMember('rs_omar');
    const convo = await seedConversation(alice, bob);
    const t = '2026-07-01T00:00:00Z';
    await db.admin.query(
      `update conversations set initiator_last_read_at = $2 where id = $1`,
      [convo, t],
    );
    await db.admin.query(`
      insert into dm_read_states (conversation_id, user_id, last_read_at)
      select id, initiator_user_id, initiator_last_read_at from conversations
        where initiator_last_read_at is not null
      union all
      select id, recipient_user_id, recipient_last_read_at from conversations
        where recipient_last_read_at is not null
      on conflict (conversation_id, user_id) do nothing
    `);
    const row = await db.admin.query(
      `select last_read_at::text as t from dm_read_states where conversation_id = $1 and user_id = $2`,
      [convo, alice],
    );
    expect(row.rows[0]?.t).toContain('2026-07-01');
  });
});
