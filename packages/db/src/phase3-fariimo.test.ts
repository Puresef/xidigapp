import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 3 (Fariimo — DMs + Notifications) RLS negative-test suite, covering
 * migration 20260706100000_phase3_fariimo.sql. Proves the private-DM isolation
 * the Phase 3 acceptance list requires:
 *
 *   * conversations/messages are participant-only — a non-participant (and, by
 *     design, a mod) reads ZERO rows;
 *   * the API-only write model — conversations/messages/user_blocks/
 *     push_subscriptions/reports have NO client write grants, so a blocked or
 *     throttled member cannot go around the API to insert a row;
 *   * notifications are private to the recipient;
 *   * push subscriptions are private to the owning user (the send path is the
 *     service role — the "admin service path");
 *   * user_blocks are visible only to the blocker (you can't probe who blocked
 *     you); reports only to the reporter;
 *   * dm_unread_count() counts only the caller's own unread activity;
 *   * messages / notifications / conversations are in the Realtime publication;
 *   * the message-insert trigger bumps conversations.updated_at (inbox order).
 *
 * Conventions (same as phase2-plaza.test.ts): policy denial that filters rows
 * → empty result set; a revoked table grant → /permission denied/. DM rows are
 * seeded via db.admin, mirroring the API's service-role writer (all DM writes
 * are API-only by design).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Creates an active member (bypassing the beta gate) with a profile. */
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

/** A member promoted to mod, as ops would do it. */
async function seedMod(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'mod' where id = $1`, [userId]);
  return userId;
}

/** Seeds a conversation the way the API's service role would (client inserts revoked). */
async function seedConversation(
  initiator: string,
  recipient: string,
  status: 'pending' | 'accepted' | 'declined' | 'blocked' = 'accepted',
): Promise<string> {
  const res = await db.admin.query(
    `insert into conversations (initiator_user_id, recipient_user_id, status)
     values ($1, $2, $3) returning id`,
    [initiator, recipient, status],
  );
  return res.rows[0].id as string;
}

async function seedMessage(conversationId: string, sender: string, body: string): Promise<string> {
  const res = await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3) returning id`,
    [conversationId, sender, body],
  );
  return res.rows[0].id as string;
}

describe('conversations policies', () => {
  it('both participants read the conversation; a non-participant and a mod read zero', async () => {
    const alice = await seedMember('dm_alice');
    const bob = await seedMember('dm_bob');
    const carol = await seedMember('dm_carol'); // uninvolved third party
    const mod = await seedMod('dm_mod');

    const convo = await seedConversation(alice, bob);

    for (const participant of [alice, bob]) {
      const rows = await db.asUser(participant, (tx) =>
        tx.query(`select id from conversations where id = $1`, [convo]),
      );
      expect(rows.rows).toHaveLength(1);
    }

    // Non-participant: RLS filters the row out entirely.
    const carolSees = await db.asUser(carol, (tx) =>
      tx.query(`select id from conversations where id = $1`, [convo]),
    );
    expect(carolSees.rows).toEqual([]);

    // Privacy stance: mods get NO blanket read on private DMs (unlike Plaza).
    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from conversations where id = $1`, [convo]),
    );
    expect(modSees.rows).toEqual([]);
  });

  it('conversation writes are API-only: direct INSERT/UPDATE/DELETE denied', async () => {
    const alice = await seedMember('dm_writer_a');
    const bob = await seedMember('dm_writer_b');
    const convo = await seedConversation(alice, bob, 'pending');

    await expect(
      db.asUser(alice, (tx) =>
        tx.query(
          `insert into conversations (initiator_user_id, recipient_user_id) values ($1, $2)`,
          [alice, bob],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // Even a participant cannot self-accept by writing status directly — the
    // accept flow is an API obligation (notification + gate).
    await expect(
      db.asUser(bob, (tx) =>
        tx.query(`update conversations set status = 'accepted' where id = $1`, [convo]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(alice, (tx) => tx.query(`delete from conversations where id = $1`, [convo])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('messages policies', () => {
  it('participants read the thread; non-participants and mods read zero', async () => {
    const alice = await seedMember('msg_alice');
    const bob = await seedMember('msg_bob');
    const carol = await seedMember('msg_carol');
    const mod = await seedMod('msg_mod');

    const convo = await seedConversation(alice, bob);
    const msg = await seedMessage(convo, alice, 'Assalamu alaikum');

    for (const participant of [alice, bob]) {
      const rows = await db.asUser(participant, (tx) =>
        tx.query(`select id from messages where id = $1`, [msg]),
      );
      expect(rows.rows).toHaveLength(1);
    }

    const carolSees = await db.asUser(carol, (tx) =>
      tx.query(`select id from messages where id = $1`, [msg]),
    );
    expect(carolSees.rows).toEqual([]);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from messages where id = $1`, [msg]),
    );
    expect(modSees.rows).toEqual([]);
  });

  it('a non-participant cannot enumerate a thread by conversation_id', async () => {
    const alice = await seedMember('enum_alice');
    const bob = await seedMember('enum_bob');
    const mallory = await seedMember('enum_mallory');

    const convo = await seedConversation(alice, bob);
    await seedMessage(convo, alice, 'private one');
    await seedMessage(convo, bob, 'private two');

    const malloryScan = await db.asUser(mallory, (tx) =>
      tx.query(`select id from messages where conversation_id = $1`, [convo]),
    );
    expect(malloryScan.rows).toEqual([]);
  });

  it('message writes are API-only: even a participant cannot INSERT directly', async () => {
    const alice = await seedMember('send_alice');
    const bob = await seedMember('send_bob');
    const convo = await seedConversation(alice, bob);

    // The accept gate, block check and send throttle are API obligations — the
    // grant is revoked outright, so a direct send is impossible.
    await expect(
      db.asUser(alice, (tx) =>
        tx.query(`insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3)`, [
          convo,
          alice,
          'direct insert',
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('blocked users cannot continue DM flows', () => {
  it('the block row is visible only to the blocker; the blocked party cannot see or bypass it', async () => {
    const blocker = await seedMember('block_blocker');
    const blocked = await seedMember('block_blocked');

    await db.admin.query(
      `insert into user_blocks (blocker_user_id, blocked_user_id) values ($1, $2)`,
      [blocker, blocked],
    );

    const blockerSees = await db.asUser(blocker, (tx) =>
      tx.query(`select blocked_user_id from user_blocks where blocker_user_id = $1`, [blocker]),
    );
    expect(blockerSees.rows).toHaveLength(1);

    // The blocked party cannot even discover that they were blocked.
    const blockedProbes = await db.asUser(blocked, (tx) =>
      tx.query(`select blocker_user_id from user_blocks where blocked_user_id = $1`, [blocked]),
    );
    expect(blockedProbes.rows).toEqual([]);

    // And they cannot go around the API to insert a message into a blocked
    // conversation — the messages grant is revoked for everyone.
    const convo = await seedConversation(blocked, blocker, 'blocked');
    await expect(
      db.asUser(blocked, (tx) =>
        tx.query(`insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'hi')`, [
          convo,
          blocked,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('user_blocks writes are API-only (block halts a live conversation as a side effect)', async () => {
    const a = await seedMember('block_write_a');
    const b = await seedMember('block_write_b');
    await expect(
      db.asUser(a, (tx) =>
        tx.query(`insert into user_blocks (blocker_user_id, blocked_user_id) values ($1, $2)`, [
          a,
          b,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('notifications privacy', () => {
  it('a member reads only their own notifications; writes are service-role only', async () => {
    const recipient = await seedMember('notif_recipient');
    const other = await seedMember('notif_other');

    await db.admin.query(
      `insert into notifications (user_id, actor_user_id, type) values ($1, $2, 'new_dm')`,
      [recipient, other],
    );

    const recipientSees = await db.asUser(recipient, (tx) =>
      tx.query(`select id from notifications where user_id = $1`, [recipient]),
    );
    expect(recipientSees.rows).toHaveLength(1);

    // The other user cannot read the recipient's notification row.
    const otherProbes = await db.asUser(other, (tx) =>
      tx.query(`select id from notifications where user_id = $1`, [recipient]),
    );
    expect(otherProbes.rows).toEqual([]);

    // Marking read is an API obligation (bundling semantics) — no client write.
    await expect(
      db.asUser(recipient, (tx) =>
        tx.query(`update notifications set read_at = now() where user_id = $1`, [recipient]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('push_subscriptions privacy', () => {
  it('a member reads only their own push endpoints; a stranger reads none; writes are API-only', async () => {
    const owner = await seedMember('push_owner');
    const stranger = await seedMember('push_stranger');

    await db.admin.query(
      `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
       values ($1, 'https://push.example/ep-1', 'p256dh-key', 'auth-key')`,
      [owner],
    );

    const ownerSees = await db.asUser(owner, (tx) =>
      tx.query(`select id from push_subscriptions where user_id = $1`, [owner]),
    );
    expect(ownerSees.rows).toHaveLength(1);

    const strangerProbes = await db.asUser(stranger, (tx) =>
      tx.query(`select id from push_subscriptions where user_id = $1`, [owner]),
    );
    expect(strangerProbes.rows).toEqual([]);

    await expect(
      db.asUser(stranger, (tx) =>
        tx.query(
          `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
           values ($1, 'https://push.example/ep-2', 'k', 'a')`,
          [stranger],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('reports (DM report entry point, not the Phase 6 queue)', () => {
  it('a reporter reads only their own reports; another member cannot; submission is API-only', async () => {
    const reporter = await seedMember('report_reporter');
    const other = await seedMember('report_other');
    const target = await seedMember('report_target');

    const report = await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason)
       values ($1, 'user', $2, 'harassment') returning id`,
      [reporter, target],
    );

    const reporterSees = await db.asUser(reporter, (tx) =>
      tx.query(`select id from reports where id = $1`, [report.rows[0].id]),
    );
    expect(reporterSees.rows).toHaveLength(1);

    const otherProbes = await db.asUser(other, (tx) =>
      tx.query(`select id from reports where id = $1`, [report.rows[0].id]),
    );
    expect(otherProbes.rows).toEqual([]);

    await expect(
      db.asUser(reporter, (tx) =>
        tx.query(
          `insert into reports (reporter_user_id, target_type, target_id, reason)
           values ($1, 'user', $2, 'spam')`,
          [reporter, target],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('dm_unread_count()', () => {
  it('counts only the calling member own unread inbound conversations', async () => {
    const alice = await seedMember('unread_alice');
    const bob = await seedMember('unread_bob');
    const convo = await seedConversation(alice, bob);

    // Bob sends two messages; neither party has read yet.
    await seedMessage(convo, bob, 'one');
    await seedMessage(convo, bob, 'two');

    // Alice has one conversation with unread inbound activity.
    const aliceCount = await db.asUser(alice, (tx) => tx.query(`select public.dm_unread_count() as n`));
    expect(Number(aliceCount.rows[0].n)).toBe(1);

    // Bob sent them, so he has nothing unread.
    const bobCount = await db.asUser(bob, (tx) => tx.query(`select public.dm_unread_count() as n`));
    expect(Number(bobCount.rows[0].n)).toBe(0);

    // After Alice reads (last_read_at advanced past the messages), her count drops.
    await db.admin.query(
      `update conversations set initiator_last_read_at = now() where id = $1`,
      [convo],
    );
    const aliceAfterRead = await db.asUser(alice, (tx) =>
      tx.query(`select public.dm_unread_count() as n`),
    );
    expect(Number(aliceAfterRead.rows[0].n)).toBe(0);
  });

  it('is not callable by anon', async () => {
    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select public.dm_unread_count()`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('message trigger + realtime wiring', () => {
  it('inserting a message bumps the conversation updated_at (inbox ordering)', async () => {
    const alice = await seedMember('touch_alice');
    const bob = await seedMember('touch_bob');
    const convo = await seedConversation(alice, bob);

    const before = await db.admin.query(`select updated_at from conversations where id = $1`, [convo]);
    // Force a measurable gap, then insert.
    await db.admin.query(`update conversations set updated_at = now() - interval '1 hour' where id = $1`, [
      convo,
    ]);
    await seedMessage(convo, alice, 'ping');
    const after = await db.admin.query(`select updated_at from conversations where id = $1`, [convo]);

    expect(new Date(after.rows[0].updated_at as string).getTime()).toBeGreaterThan(
      new Date(before.rows[0].updated_at as string).getTime() - 3_600_000,
    );
    // Concretely: after the message, updated_at is within the last few seconds.
    const recent = await db.admin.query(
      `select (now() - updated_at) < interval '10 seconds' as fresh from conversations where id = $1`,
      [convo],
    );
    expect(recent.rows[0].fresh).toBe(true);
  });

  it('dm_inbox keyset does not drop a conversation that shares updated_at at a page boundary', async () => {
    const alice = await seedMember('inbox_alice');
    const bob = await seedMember('inbox_bob');
    const carol = await seedMember('inbox_carol');

    const c1 = await seedConversation(alice, bob);
    const c2 = await seedConversation(alice, carol);
    // One UPDATE statement touches both rows → conversations' set_updated_at
    // trigger stamps BOTH with the same transaction now(): the identical
    // updated_at the tiebreaker guards against.
    const updated = await db.admin.query(
      `update conversations set status = status where id in ($1, $2)`,
      [c1, c2],
    );
    expect(updated.rowCount).toBe(2);

    // Page 1: exactly one row (larger id first, id desc). Grab its cursor as
    // full-precision text — a JS Date would truncate the µs and miss the '='.
    const page1 = await db.asUser(alice, (tx) =>
      tx.query(`select conversation_id, updated_at::text as cur from dm_inbox(1)`),
    );
    expect(page1.rows).toHaveLength(1);
    const firstId = page1.rows[0]!.conversation_id as string;
    const cursor = page1.rows[0]!.cur as string;

    // Page 2: keyed past (updated_at, id) of page 1's last row — the second
    // conversation must still appear, not be skipped by a strict '<'.
    const page2 = await db.asUser(alice, (tx) =>
      tx.query(`select conversation_id from dm_inbox(1, $1::timestamptz, $2::uuid)`, [cursor, firstId]),
    );
    expect(page2.rows).toHaveLength(1);

    const seen = new Set([firstId, page2.rows[0]!.conversation_id as string]);
    expect(seen).toEqual(new Set([c1, c2]));
  });

  it('messages, notifications and conversations are in the supabase_realtime publication', async () => {
    const pub = await db.admin.query(
      `select tablename from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
       order by tablename`,
    );
    const tables = pub.rows.map((r) => r.tablename as string);
    expect(tables).toContain('messages');
    expect(tables).toContain('notifications');
    expect(tables).toContain('conversations');
  });
});
