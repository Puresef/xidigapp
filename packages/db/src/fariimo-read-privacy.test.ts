import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Read-state privacy suite (A5a), covering migration
 * 20260909000000_fariimo_read_privacy.sql. The contract:
 *
 *   * a participant reads their conversations through a COLUMN-SCOPED grant —
 *     the two *_last_read_at columns are not client-readable at all, so the
 *     counterparty's read time cannot be learned from the row (`select *`
 *     therefore also fails: the API/tests must name columns);
 *   * has_column_privilege — the predicate Realtime (walrus) consults when
 *     building change payloads — is false for both read columns, so a
 *     subscriber's payloads are expected to omit them (live-stack behaviour
 *     is verified at staging, not assumed here);
 *   * a PURE read-mark no longer bumps updated_at, so updated_at cannot act
 *     as a read-time oracle (at rest, over realtime, or as silent inbox
 *     reordering) — while message sends (explicit touch trigger) and status
 *     changes still bump it, keeping inbox ordering exactly as before;
 *   * the caller's own unread tracking is untouched: dm_unread_count()/
 *     dm_inbox() are SECURITY DEFINER and read the caller's own column.
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

async function seedConversation(
  initiator: string,
  recipient: string,
  status: 'pending' | 'accepted' = 'accepted',
): Promise<string> {
  const res = await db.admin.query(
    `insert into conversations (initiator_user_id, recipient_user_id, status)
     values ($1, $2, $3) returning id`,
    [initiator, recipient, status],
  );
  return res.rows[0].id as string;
}

async function seedMessage(conversationId: string, sender: string, body: string): Promise<void> {
  await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, $3)`,
    [conversationId, sender, body],
  );
}

async function updatedAtOf(conversationId: string): Promise<string> {
  const res = await db.admin.query(
    `select updated_at::text as updated_at from conversations where id = $1`,
    [conversationId],
  );
  return res.rows[0].updated_at as string;
}

describe('column-scoped conversation reads', () => {
  it('a participant reads the granted columns; both read columns are permission-denied', async () => {
    const alice = await seedMember('rp_alice');
    const bob = await seedMember('rp_bob');
    const convo = await seedConversation(alice, bob);

    const granted = await db.asUser(alice, (tx) =>
      tx.query(
        `select id, initiator_user_id, recipient_user_id, status, accepted_at, created_at, updated_at
         from conversations where id = $1`,
        [convo],
      ),
    );
    expect(granted.rows).toHaveLength(1);

    await expect(
      db.asUser(alice, (tx) =>
        tx.query(`select recipient_last_read_at from conversations where id = $1`, [convo]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(alice, (tx) =>
        tx.query(`select initiator_last_read_at from conversations where id = $1`, [convo]),
      ),
    ).rejects.toThrow(/permission denied/);
    // The column scope makes `select *` invalid for clients — columns must be
    // named. Nothing in the app selects * on conversations with an RLS client
    // (service paths use the service role); this pins that contract.
    await expect(
      db.asUser(alice, (tx) => tx.query(`select * from conversations where id = $1`, [convo])),
    ).rejects.toThrow(/permission denied/);
  });

  it('anon has no conversations read at all', async () => {
    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select id from conversations limit 1`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('pins the realtime column-privilege predicate: read columns false, granted columns true', async () => {
    const res = await db.admin.query(`
      select
        has_column_privilege('authenticated', 'public.conversations', 'status', 'select') as status_ok,
        has_column_privilege('authenticated', 'public.conversations', 'updated_at', 'select') as updated_ok,
        has_column_privilege('authenticated', 'public.conversations', 'initiator_last_read_at', 'select') as init_read,
        has_column_privilege('authenticated', 'public.conversations', 'recipient_last_read_at', 'select') as recip_read
    `);
    expect(res.rows[0]).toEqual({
      status_ok: true,
      updated_ok: true,
      init_read: false,
      recip_read: false,
    });
  });
});

describe('updated_at is no longer a read-time oracle', () => {
  it('a pure read-mark leaves updated_at untouched', async () => {
    const alice = await seedMember('rp_carol');
    const bob = await seedMember('rp_dahir');
    const convo = await seedConversation(alice, bob);

    const before = await updatedAtOf(convo);
    // Exactly what POST /api/conversations/[id]/read does (service role,
    // caller's own column only).
    await db.admin.query(
      `update conversations set recipient_last_read_at = now() where id = $1`,
      [convo],
    );
    const afterRead = await updatedAtOf(convo);
    expect(afterRead).toBe(before);

    await db.admin.query(
      `update conversations set initiator_last_read_at = now() where id = $1`,
      [convo],
    );
    expect(await updatedAtOf(convo)).toBe(before);
  });

  it('status changes and message sends still bump updated_at (inbox ordering intact)', async () => {
    const alice = await seedMember('rp_edna');
    const bob = await seedMember('rp_fuaad');
    const convo = await seedConversation(alice, bob, 'pending');

    const t0 = await updatedAtOf(convo);
    await db.admin.query(`update conversations set status = 'accepted' where id = $1`, [convo]);
    const t1 = await updatedAtOf(convo);
    expect(t1 > t0).toBe(true);

    await seedMessage(convo, alice, 'salaan');
    const t2 = await updatedAtOf(convo);
    expect(t2 > t1).toBe(true);
  });
});

describe('a read-mark does not move the counterpart’s inbox ordering key', () => {
  it('marking read (now via dm_read_states) leaves conversations.updated_at untouched', async () => {
    const alice = await seedMember('rp_guled');
    const bob = await seedMember('rp_hodan');
    const convo = await seedConversation(alice, bob);
    await seedMessage(convo, alice, 'ma i maqlaysaa?');

    const orderKeyBefore = await updatedAtOf(convo);
    // The read-mark write under the A5a-follow-up model: the per-user table,
    // never the shared conversations row — so the counterpart's inbox order
    // (conversations.updated_at) cannot move as a side effect.
    await db.admin.query(
      `insert into dm_read_states (conversation_id, user_id, last_read_at)
       values ($1, $2, now())
       on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at`,
      [convo, bob],
    );
    expect(await updatedAtOf(convo)).toBe(orderKeyBefore);

    // Unread arithmetic itself is pinned in fariimo-read-states.test.ts.
    const unreadAfter = await db.asUser(bob, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(unreadAfter.rows[0].n).toBe(0);
  });
});
