import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember, seedMod } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * What an access token issued BEFORE an account's final transition can still
 * do at the database once the account is 'deleted'.
 *
 * Why this exists: PostgREST (and Realtime) validate the JWT locally and never
 * ask GoTrue whether the account was banned, so the GoTrue ban (Option A)
 * stops NEW tokens and refreshes but not a token already issued — it keeps
 * working until it expires (Dev: 1 hour). `asUser` here is exactly how
 * PostgREST executes such a request (SET LOCAL role authenticated + the
 * token's claims), so this suite is the database half of the Dev runtime
 * matrix in the reconciliation record (Addendum L).
 *
 * History: the second block began life as 12 `it.fails` tripwires — each a
 * residual confirmed on Dev at 49f3dc4. The client-API lifecycle gate
 * (migration 20260911000400: a restrictive policy on every signed-in-
 * reachable table + guards in the RLS-bypassing RPCs) closed them, and they
 * were flipped to plain it(...). The suspended / deactivated matrix, the
 * active and grace-period positive controls and the coverage contracts live
 * in client-lifecycle-gate.test.ts.
 */

let db: TestDatabase;
let target: string; // deleted after seeding
let peer: string;
let conversation: string;
let lab: string;
let ownListing: string;
let unownedListing: string;
let peerAsk: string;
let deletedMod: string;
let reportByOther: string;

const LISTING_CATEGORY = `(select id from listing_categories order by position limit 1)`;

async function finalise(userId: string): Promise<void> {
  await db.admin.query(
    `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
    [userId],
  );
  const out = await db.withRole('service_role', null, (tx) =>
    tx.query(`select public.anonymise_user($1) as out`, [userId]),
  );
  expect(out.rows[0].out.outcome).toBe('anonymised');
}

beforeAll(async () => {
  db = await createTestDatabase();

  target = await seedMember(db, 'resid_target');
  peer = await seedMember(db, 'resid_peer');

  conversation = (
    await db.admin.query(
      `insert into conversations (initiator_user_id, recipient_user_id, status, accepted_at)
       values ($1, $2, 'accepted', now()) returning id`,
      [peer, target],
    )
  ).rows[0].id;
  await db.admin.query(
    `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'from peer'), ($1, $3, 'from target')`,
    [conversation, peer, target],
  );
  await db.admin.query(
    `insert into notifications (user_id, type, actor_user_id) values ($1, 'reply', $2)`,
    [target, peer],
  );

  lab = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility, member_list_visibility)
       values ('Private', 'resid-private', $1, 'private', 'private') returning id`,
      [peer],
    )
  ).rows[0].id;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now()), ($1, $3, 'member', 'active', now())`,
    [lab, peer, target],
  );
  await db.admin.query(
    `insert into lab_updates (lab_id, author_user_id, body) values ($1, $2, 'private update')`,
    [lab, peer],
  );

  ownListing = (
    await db.admin.query(
      `insert into business_listings (business_name, category_id, owner_user_id, short_description)
       values ('Owned', ${LISTING_CATEGORY}, $1, 'original') returning id`,
      [target],
    )
  ).rows[0].id;
  unownedListing = (
    await db.admin.query(
      `insert into business_listings (business_name, category_id) values ('Unowned', ${LISTING_CATEGORY}) returning id`,
    )
  ).rows[0].id;
  peerAsk = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body, ask_status) values ($1, 'ask', 'fulfilled ask', 'fulfilled') returning id`,
      [peer],
    )
  ).rows[0].id;

  deletedMod = await seedMod(db, 'resid_mod');
  reportByOther = (
    await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam') returning id`,
      [peer, peerAsk],
    )
  ).rows[0].id;

  await finalise(target);
  await finalise(deletedMod);
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  db.asUser(userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);

describe('deleted account + pre-ban token: guarantees that hold', () => {
  it('holds no account-level capability', async () => {
    const res = await db.asUser(target, (tx) =>
      tx.query(`select public.is_active_account() as active, public.is_mod() as mod`),
    );
    expect(res.rows[0]).toEqual({ active: false, mod: false });
  });

  it('a deleted moderator keeps no moderator reach', async () => {
    const res = await db.asUser(deletedMod, (tx) => tx.query(`select public.is_mod() as mod`));
    expect(res.rows[0].mod).toBe(false);
    expect(await rows(deletedMod, `select 1 from reports where id = $1`, [reportByOther])).toBe(0);
  });

  it('reads only a neutral tombstone of its own account row', async () => {
    const res = await db.asUser(target, (tx) =>
      tx.query(`select email, phone, status from users where id = $1`, [target]),
    );
    expect(res.rows[0]).toEqual({ email: null, phone: null, status: 'deleted' });
    expect(await rows(target, `select 1 from users where id <> $1`, [target])).toBe(0);
  });

  it('cannot change its profile — the gate refuses before the freeze trigger is reached', async () => {
    // The lifecycle gate hides the row from the UPDATE (0 rows), so a client
    // token never reaches the profile_frozen trigger any more. The trigger is
    // still the invariant for every writer the gate does not cover — the
    // service role — pinned in account-deletion-privacy.test.ts.
    expect(
      await rows(target, `update profiles set bio = 'back' where user_id = $1`, [target]),
    ).toBe(0);
    const bio = await db.admin.query(`select bio from profiles where user_id = $1`, [target]);
    expect(bio.rows[0].bio).toBeNull();
  });

  it('cannot react, endorse or suggest terms (is_active_account() in the policy)', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          target,
          peerAsk,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, 'x')`,
          [target, peer],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into term_suggestions (kind, term, suggested_by) values ('lane', 'zz', $1)`,
          [target],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot write DMs directly (writes are API-only; no client grant)', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'x')`,
          [conversation, target],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('deleted account + pre-ban token: residuals closed by the lifecycle gate', () => {
  it('cannot read the private messages of its conversations', async () => {
    expect(
      await rows(target, `select 1 from messages where conversation_id = $1`, [conversation]),
    ).toBe(0);
  });

  it('cannot pull DM previews through dm_inbox()', async () => {
    expect(await rows(target, `select * from public.dm_inbox()`)).toBe(0);
  });

  it('cannot read its notifications', async () => {
    expect(await rows(target, `select 1 from notifications where user_id = $1`, [target])).toBe(0);
  });

  it('cannot read a private Space it belonged to', async () => {
    expect(await rows(target, `select 1 from lab_updates where lab_id = $1`, [lab])).toBe(0);
  });

  it("cannot read other members' profiles", async () => {
    expect(await rows(target, `select 1 from profiles where user_id = $1`, [peer])).toBe(0);
  });

  it('cannot publish a new business listing', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into business_listings (business_name, category_id, owner_user_id) values ('Injected', ${LISTING_CATEGORY}, $1)`,
          [target],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cannot rewrite its retained listing', async () => {
    expect(
      await rows(
        target,
        `update business_listings set short_description = 'injected' where id = $1`,
        [ownListing],
      ),
    ).toBe(0);
  });

  it("cannot add support to another member's ask", async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [peerAsk, target]),
      ),
    ).rejects.toThrow();
  });

  it('cannot follow', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into follows (follower_user_id, target_type, target_id) values ($1, 'lab', $2)`,
          [target, lab],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cannot claim an unowned listing', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into listing_claims (listing_id, claimant_user_id, evidence) values ($1, $2, 'x')`,
          [unownedListing, target],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cannot record new consent', async () => {
    await expect(
      db.asUser(target, (tx) =>
        tx.query(
          `insert into consent_records (user_id, consent_type, version) values ($1, 'cookies', 'x')`,
          [target],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cannot change its own account settings', async () => {
    expect(
      await rows(target, `update users set preferred_language = 'so' where id = $1`, [target]),
    ).toBe(0);
  });
});
