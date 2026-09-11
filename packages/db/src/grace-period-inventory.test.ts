import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCandidate, seedMember, seedMod } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * 'pending_deletion' — the cancellable §19 30-day grace — as it behaves TODAY
 * at the database, pinned so an owner ruling changes it deliberately.
 *
 * NOT a statement of intent. The app layer says the grace keeps member access
 * (requireUser admits it; u/[handle] and l/[id] say so), and the client-API
 * lifecycle gate (20260911000400) admits it. But older policies built for
 * SUSPENSION enforcement (docs/rls-phase6-moderation.md) use active-only
 * predicates, so a grace member is also:
 *   - refused ordinary participation writes (is_active_account()),
 *   - refused members-visibility Spaces and community-visible Candidates
 *     (can_read_lab / can_read_candidate member branches),
 *   - stripped of mod/admin/verifier/supporter reach (privilege predicates),
 *   - hidden as an author from every other reader (author_is_active — this
 *     one IS documented and tested as intended, phase6-moderation.test.ts).
 * The app surfaces the refusals as misleading errors (a reaction → 404, a
 * poll re-vote → "poll closed", a profile save → 500). Inventory and options:
 * reconciliation Addendum N.
 */

let db: TestDatabase;
let grace: string;
let peer: string;
let graceMod: string;
let peerPost: string;
let membersLab: string;
let candidate: string;
let poll: string;
let pollOption: string;

beforeAll(async () => {
  db = await createTestDatabase();
  grace = await seedMember(db, 'grace_member');
  peer = await seedMember(db, 'grace_peer');
  graceMod = await seedMod(db, 'grace_mod');

  peerPost = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body) values ($1, 'update', 'hello') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  await db.admin.query(`update profiles set skills = array['sql'] where user_id = $1`, [peer]);

  membersLab = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility) values ('Members', 'grace-members', $1, 'members') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  candidate = await seedCandidate(db, membersLab, peer, { status: 'submitted' });
  poll = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body, poll_status) values ($1, 'poll', 'q', 'open') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  pollOption = (
    await db.admin.query(
      `insert into poll_options (post_id, label, position) values ($1, 'yes', 0) returning id`,
      [poll],
    )
  ).rows[0].id as string;

  for (const id of [grace, graceMod]) {
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() where id = $1`,
      [id],
    );
  }
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  db.asUser(userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);

const refused = (userId: string, sql: string, params: unknown[]) =>
  expect(db.asUser(userId, (tx) => tx.query(sql, params))).rejects.toThrow(/row-level security/);

describe('grace member: what works today', () => {
  it('passes the client-API lifecycle gate', async () => {
    const res = await db.asUser(grace, (tx) =>
      tx.query(`select public.current_account_can_use_client_api() as v`),
    );
    expect(res.rows[0].v).toBe(true);
  });

  it('reads the directory and the feed, follows, and edits settings', async () => {
    expect(await rows(grace, `select 1 from profiles where user_id = $1`, [peer])).toBe(1);
    expect(await rows(grace, `select 1 from posts where id = $1`, [peerPost])).toBe(1);
    await expect(
      db.asUser(grace, (tx) =>
        tx.query(
          `insert into follows (follower_user_id, target_type, target_id) values ($1, 'user', $2)`,
          [grace, peer],
        ),
      ),
    ).resolves.toBeDefined();
    expect(
      await rows(grace, `update users set low_bandwidth_enabled = true where id = $1`, [grace]),
    ).toBe(1);
  });
});

describe('grace member: refused today by active-only predicates (pending ruling)', () => {
  it('profile edit — profiles_update_own WITH CHECK is_active_account()', async () => {
    await refused(grace, `update profiles set bio = 'still here' where user_id = $1`, [grace]);
  });

  it('reaction — reactions_insert_own is_active_account()', async () => {
    await refused(grace, `insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
      grace,
      peerPost,
    ]);
  });

  it('skill endorsement — skill_endorsements_insert_own is_active_account()', async () => {
    await refused(
      grace,
      `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, 'sql')`,
      [grace, peer],
    );
  });

  it('term suggestion — term_suggestions_insert_own is_active_account()', async () => {
    await refused(
      grace,
      `insert into term_suggestions (kind, term, suggested_by) values ('lane', 'gracelane', $1)`,
      [grace],
    );
  });

  it('poll vote — poll_votes_insert_own is_active_account()', async () => {
    await refused(
      grace,
      `insert into poll_votes (poll_option_id, post_id, voter_user_id) values ($1, $2, $3)`,
      [pollOption, poll, grace],
    );
  });

  it('members-visibility Space and community-visible Candidate — member branches require active', async () => {
    expect(await rows(grace, `select 1 from labs where id = $1`, [membersLab])).toBe(0);
    expect(await rows(grace, `select 1 from venture_candidates where id = $1`, [candidate])).toBe(
      0,
    );
    expect(await rows(peer, `select 1 from labs where id = $1`, [membersLab])).toBe(1); // control
  });

  it('a moderator in grace holds no moderator reach — is_mod() requires active', async () => {
    const res = await db.asUser(graceMod, (tx) => tx.query(`select public.is_mod() as v`));
    expect(res.rows[0].v).toBe(false);
  });

  it('their own content is hidden from other readers — author_is_active (documented intent)', async () => {
    const own = (
      await db.admin.query(
        `insert into posts (author_user_id, type, body) values ($1, 'update', 'mine') returning id`,
        [grace],
      )
    ).rows[0].id as string;
    expect(await rows(peer, `select 1 from posts where id = $1`, [own])).toBe(0);
    expect(await rows(grace, `select 1 from posts where id = $1`, [own])).toBe(1);
  });
});
