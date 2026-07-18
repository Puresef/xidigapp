import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  countVisible,
  seedAdmin,
  seedLab,
  seedMember,
  seedVerifier,
} from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Seq 49.5 cross-cutting security-hardening suite — the boundaries surfaced by
 * the pre-launch hostile audit that no phase suite covered:
 *
 *   1. verifications COLUMN-scoping (fix migration
 *      20260718000000_seq49_5_verification_column_scope.sql): a verification
 *      subject can read their own request STATUS but NOT the biometric
 *      recording_url / recording_expires_at, the verifier identity, or the
 *      decision notes — those stay verifier/admin/service-only. Before the fix
 *      the row's every column was reachable by the subject via direct PostgREST.
 *   2. lab_members: a member cannot forge their own active membership to
 *      self-join (and thereby read) a private Space.
 *   3. digest_email_sends: the admin-only send ledger carries member EMAIL
 *      addresses (PII) — a member, incl. the recipient, reads zero rows.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// ---------------------------------------------------------------------------
// 1. verifications: biometric recording pointer + verifier internals are
//    NEVER client-readable, even by the subject on their own row.
// ---------------------------------------------------------------------------
describe('verifications column-scoping (biometric §14 least-privilege)', () => {
  /** Seed a verification row with a recording, as the service-role API would. */
  async function seedVerification(subjectId: string, verifierId: string): Promise<string> {
    const res = await db.admin.query(
      `insert into verifications
         (user_id, type, status, verifier_user_id, recording_url, recording_expires_at, decision_notes)
       values ($1, 'identity', 'approved', $2, 'https://storage.example/enc/rec-1', now() + interval '24 months', 'looked legit')
       returning id`,
      [subjectId, verifierId],
    );
    return (res.rows[0] as { id: string }).id;
  }

  it('the subject CAN read their own request status columns', async () => {
    const subject = await seedMember(db, 'vsafe_subject');
    const verifier = await seedVerifier(db, 'vsafe_verifier');
    await seedVerification(subject, verifier);

    const rows = await db.asUser(subject, (tx) =>
      tx.query(`select id, type, status, scheduled_at, booking_url, decided_at from verifications`),
    );
    expect(rows.rowCount).toBe(1);
    expect((rows.rows[0] as { status: string }).status).toBe('approved');
  });

  it('the subject CANNOT read recording_url (special-category biometric data)', async () => {
    const subject = await seedMember(db, 'vleak_subject');
    const verifier = await seedVerifier(db, 'vleak_verifier');
    await seedVerification(subject, verifier);

    await expect(
      db.asUser(subject, (tx) => tx.query(`select recording_url from verifications`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('the subject CANNOT read recording_expires_at / verifier_user_id / decision_notes', async () => {
    const subject = await seedMember(db, 'vint_subject');
    const verifier = await seedVerifier(db, 'vint_verifier');
    await seedVerification(subject, verifier);

    for (const col of ['recording_expires_at', 'verifier_user_id', 'decision_notes']) {
      await expect(
        db.asUser(subject, (tx) => tx.query(`select ${col} from verifications`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('a non-verifier stranger reads ZERO verification rows (own-only)', async () => {
    const subject = await seedMember(db, 'vstr_subject');
    const verifier = await seedVerifier(db, 'vstr_verifier');
    const stranger = await seedMember(db, 'vstr_stranger');
    const id = await seedVerification(subject, verifier);

    expect(await countVisible(db, stranger, 'verifications', id)).toBe(0);
  });

  it('a verifier still reads the queue (no regression from the column scope)', async () => {
    const subject = await seedMember(db, 'vreg_subject');
    const verifier = await seedVerifier(db, 'vreg_verifier');
    const id = await seedVerification(subject, verifier);

    expect(await countVisible(db, verifier, 'verifications', id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. lab_members: no client self-join (a forged membership would grant read on
//    a private Space).
// ---------------------------------------------------------------------------
describe('lab_members self-join is impossible (API-only membership)', () => {
  it('a stranger cannot insert their own active membership into a private Space', async () => {
    const lead = await seedMember(db, 'selfjoin_lead');
    const stranger = await seedMember(db, 'selfjoin_stranger');
    const lab = await seedLab(db, lead, 'selfjoin-lab'); // members-visibility Lab

    // The private Space is not readable by the stranger to begin with…
    const before = await db.admin.query(
      `update labs set visibility = 'private' where id = $1`,
      [lab],
    );
    expect(before.rowCount).toBe(1);
    expect(await countVisible(db, stranger, 'labs', lab)).toBe(0);

    // …and they cannot forge the membership row that would open it.
    await expect(
      db.asUser(stranger, (tx) =>
        tx.query(
          `insert into lab_members (lab_id, user_id, role, status, joined_at)
           values ($1, $2, 'member', 'active', now())`,
          [lab, stranger],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // Still shut out.
    expect(await countVisible(db, stranger, 'labs', lab)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. digest_email_sends: admin-only PII (email) ledger.
// ---------------------------------------------------------------------------
describe('digest_email_sends is an admin-only ledger (member email PII)', () => {
  async function seedSend(recipientId: string): Promise<string> {
    const ed = await db.admin.query(
      `insert into digest_editions (period_key, period_start, period_end)
       values ('2026-W30', '2026-07-20', '2026-07-26') returning id`,
    );
    const editionId = (ed.rows[0] as { id: string }).id;
    const send = await db.admin.query(
      `insert into digest_email_sends (edition_id, user_id, email, status)
       values ($1, $2, 'recipient@example.com', 'sent') returning id`,
      [editionId, recipientId],
    );
    return (send.rows[0] as { id: string }).id;
  }

  it('the recipient themselves cannot read the send row; an admin can; members cannot write', async () => {
    const recipient = await seedMember(db, 'des_recipient');
    const admin = await seedAdmin(db, 'des_admin');
    const sendId = await seedSend(recipient);

    // Even the recipient cannot read their own send record (no own-row policy).
    expect(await countVisible(db, recipient, 'digest_email_sends', sendId)).toBe(0);
    expect(await countVisible(db, admin, 'digest_email_sends', sendId)).toBe(1);

    await expect(
      db.asUser(recipient, (tx) =>
        tx.query(
          `insert into digest_email_sends (edition_id, user_id, email)
           select edition_id, $1, 'x@example.com' from digest_email_sends limit 1`,
          [recipient],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
