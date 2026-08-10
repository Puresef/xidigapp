import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Fariimo voice notes (migration 20260810000000_fariimo_voice.sql) — the
 * schema invariants the F2 §4 dispatch depends on:
 *
 *   * a message carries text OR voice, never neither (messages_body_or_voice);
 *   * a voice upload cannot be deleted from under a live message (RESTRICT) —
 *     moderation soft-deletes the MESSAGE, the sweep deletes conversations
 *     first and uploads after;
 *   * duration is server-clamped to a sane range;
 *   * participant-only visibility extends unchanged to voice messages
 *     (non-participants read ZERO rows — same policy, new column);
 *   * dm_inbox reports last_message_voice so the inbox can render a neutral
 *     "voice note" preview, never fake text;
 *   * the 'voice' media kind exists.
 *
 * Conventions match phase3-fariimo.test.ts: DM writes are seeded via
 * db.admin (API-only by design); policy denial → empty set.
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
  status: 'pending' | 'accepted' | 'declined' | 'blocked' = 'accepted',
): Promise<string> {
  const res = await db.admin.query(
    `insert into conversations (initiator_user_id, recipient_user_id, status)
     values ($1, $2, $3) returning id`,
    [initiator, recipient, status],
  );
  return res.rows[0].id as string;
}

async function seedVoiceUpload(owner: string, durationSeconds = 38): Promise<string> {
  const res = await db.admin.query(
    `insert into media_uploads (owner_user_id, bucket, storage_path, mime_type, bytes, kind, duration_seconds, scan_status)
     values ($1, 'dm-media', $2, 'audio/webm', 52000, 'voice', $3, 'skipped') returning id`,
    [owner, `voice/${owner}/${Math.random().toString(36).slice(2)}.webm`, durationSeconds],
  );
  return res.rows[0].id as string;
}

describe('voice schema invariants', () => {
  it("registers the 'voice' media kind", async () => {
    const res = await db.admin.query(`select id from media_kinds where id = 'voice'`);
    expect(res.rowCount).toBe(1);
  });

  it('rejects a message that carries neither text nor voice', async () => {
    const a = await seedMember('voice_a');
    const b = await seedMember('voice_b');
    const convo = await seedConversation(a, b);
    await expect(
      db.admin.query(
        `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, null)`,
        [convo, a],
      ),
    ).rejects.toThrow(/messages_body_or_voice/);
  });

  it('accepts a voice-only message and reports it through dm_inbox', async () => {
    const a = await seedMember('voice_c');
    const b = await seedMember('voice_d');
    const convo = await seedConversation(a, b);
    const upload = await seedVoiceUpload(a);
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, body, voice_upload_id)
       values ($1, $2, null, $3)`,
      [convo, a, upload],
    );

    const inbox = await db.asUser(b, (tx) => tx.query(`select * from dm_inbox()`));
    const row = inbox.rows.find((r) => r.conversation_id === convo);
    expect(row).toBeDefined();
    expect(row.last_message_voice).toBe(true);
    expect(row.last_message_body).toBeNull();
    expect(row.unread_count).toBe(1);
  });

  it('keeps last_message_voice false for text messages', async () => {
    const a = await seedMember('voice_e');
    const b = await seedMember('voice_f');
    const convo = await seedConversation(a, b);
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'text')`,
      [convo, a],
    );
    const inbox = await db.asUser(b, (tx) => tx.query(`select * from dm_inbox()`));
    const row = inbox.rows.find((r) => r.conversation_id === convo);
    expect(row.last_message_voice).toBe(false);
  });

  it('refuses to delete a voice upload referenced by a live message (RESTRICT)', async () => {
    const a = await seedMember('voice_g');
    const b = await seedMember('voice_h');
    const convo = await seedConversation(a, b);
    const upload = await seedVoiceUpload(a);
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, voice_upload_id) values ($1, $2, $3)`,
      [convo, a, upload],
    );
    await expect(
      db.admin.query(`delete from media_uploads where id = $1`, [upload]),
    ).rejects.toThrow(/violates foreign key|restrict/i);
  });

  it('conversation deletion cascades messages, then the upload row deletes freely (sweep order)', async () => {
    const a = await seedMember('voice_i');
    const b = await seedMember('voice_j');
    const convo = await seedConversation(a, b, 'pending');
    const upload = await seedVoiceUpload(a);
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, voice_upload_id) values ($1, $2, $3)`,
      [convo, a, upload],
    );
    await db.admin.query(`delete from conversations where id = $1`, [convo]);
    await db.admin.query(`delete from media_uploads where id = $1`, [upload]);
    const gone = await db.admin.query(`select 1 from media_uploads where id = $1`, [upload]);
    expect(gone.rowCount).toBe(0);
  });

  it('clamps duration to the sane range', async () => {
    const a = await seedMember('voice_k');
    await expect(seedVoiceUpload(a, 0)).rejects.toThrow(/media_uploads_duration_range/);
    await expect(seedVoiceUpload(a, 301)).rejects.toThrow(/media_uploads_duration_range/);
  });

  it('voice messages stay invisible to non-participants (policy unchanged)', async () => {
    const a = await seedMember('voice_l');
    const b = await seedMember('voice_m');
    const stranger = await seedMember('voice_n');
    const convo = await seedConversation(a, b);
    const upload = await seedVoiceUpload(a);
    await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, voice_upload_id) values ($1, $2, $3)`,
      [convo, a, upload],
    );
    const mine = await db.asUser(b, (tx) =>
      tx.query(`select voice_upload_id from messages where conversation_id = $1`, [convo]),
    );
    expect(mine.rowCount).toBe(1);
    const theirs = await db.asUser(stranger, (tx) =>
      tx.query(`select voice_upload_id from messages where conversation_id = $1`, [convo]),
    );
    expect(theirs.rowCount).toBe(0);
  });
});
