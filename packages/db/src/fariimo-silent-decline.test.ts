import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Wire-level silent decline (migration 20260810003000) — the 10 Aug ruling:
 * "decline must be undetectable from the initiator's side at every layer."
 *
 * The design under test: a decline never touches the conversations row (no
 * status flip → no realtime UPDATE → nothing to broadcast); it lives in
 * conversation_declines, which no client role can even SELECT and which is
 * NOT in the realtime publication. The SECURITY DEFINER inbox/badge
 * functions are the only consumers.
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

/** A pending request WITH its one message, then declined the new way. */
async function seedDeclinedRequest(initiator: string, recipient: string): Promise<string> {
  const convo = await db.admin.query(
    `insert into conversations (initiator_user_id, recipient_user_id, status)
     values ($1, $2, 'pending') returning id`,
    [initiator, recipient],
  );
  const id = convo.rows[0].id as string;
  await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'salaan')`,
    [id, initiator],
  );
  await db.admin.query(`insert into conversation_declines (conversation_id) values ($1)`, [id]);
  return id;
}

describe('conversation_declines — invisible to every client role', () => {
  it('no participant can SELECT the declines table (zero grants)', async () => {
    const a = await seedMember('sd_a');
    const b = await seedMember('sd_b');
    const convo = await seedDeclinedRequest(a, b);
    for (const user of [a, b]) {
      await expect(
        db.asUser(user, (tx) =>
          tx.query(`select * from conversation_declines where conversation_id = $1`, [convo]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('is NOT in the realtime publication — nothing to broadcast', async () => {
    const res = await db.admin.query(
      `select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and tablename = 'conversation_declines'`,
    );
    expect(res.rowCount).toBe(0);
  });
});

describe('the initiator-observable universe is identical for declined and unanswered', () => {
  it('the conversations row stays pending — same status, same updated_at clock', async () => {
    const a = await seedMember('sd_c');
    const b = await seedMember('sd_d');
    const declined = await seedDeclinedRequest(a, b);
    const row = await db.asUser(a, (tx) =>
      tx.query(`select status from conversations where id = $1`, [declined]),
    );
    expect(row.rows[0].status).toBe('pending');
  });

  it("the initiator's dm_inbox keeps the row, presented as the pending request it looks like", async () => {
    const a = await seedMember('sd_e');
    const b = await seedMember('sd_f');
    const declined = await seedDeclinedRequest(a, b);
    const inbox = await db.asUser(a, (tx) => tx.query(`select * from dm_inbox()`));
    const row = inbox.rows.find((r) => r.conversation_id === declined);
    expect(row).toBeDefined();
    expect(row.status).toBe('pending');
  });
});

describe("the recipient's world settles", () => {
  it("the declined request vanishes from the RECIPIENT's dm_inbox only", async () => {
    const a = await seedMember('sd_g');
    const b = await seedMember('sd_h');
    const declined = await seedDeclinedRequest(a, b);
    const inbox = await db.asUser(b, (tx) => tx.query(`select * from dm_inbox()`));
    expect(inbox.rows.some((r) => r.conversation_id === declined)).toBe(false);
  });

  it('the declined request stops counting toward the recipient badge', async () => {
    const a = await seedMember('sd_i');
    const b = await seedMember('sd_j');
    await seedDeclinedRequest(a, b);
    const count = await db.asUser(b, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(count.rows[0].n).toBe(0);
  });

  it('an undeclined pending request still lists and counts (control)', async () => {
    const a = await seedMember('sd_k');
    const b = await seedMember('sd_l');
    const convo = await db.admin.query(
      `insert into conversations (initiator_user_id, recipient_user_id, status)
       values ($1, $2, 'pending') returning id`,
      [a, b],
    );
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'salaan')`,
      [convo.rows[0].id, a],
    );
    const inbox = await db.asUser(b, (tx) => tx.query(`select * from dm_inbox()`));
    expect(inbox.rows.some((r) => r.conversation_id === convo.rows[0].id)).toBe(true);
    const count = await db.asUser(b, (tx) => tx.query(`select dm_unread_count() as n`));
    expect(count.rows[0].n).toBe(1);
  });
});

describe('accepted_at (ruling 4)', () => {
  it('accepting records the moment and clears the decline record', async () => {
    const a = await seedMember('sd_m');
    const b = await seedMember('sd_n');
    const convo = await seedDeclinedRequest(a, b);
    await db.admin.query(
      `update conversations set status = 'accepted', accepted_at = now() where id = $1`,
      [convo],
    );
    await db.admin.query(`delete from conversation_declines where conversation_id = $1`, [convo]);
    const row = await db.asUser(b, (tx) =>
      tx.query(`select accepted_at from conversations where id = $1`, [convo]),
    );
    expect(row.rows[0].accepted_at).not.toBeNull();
  });
});
