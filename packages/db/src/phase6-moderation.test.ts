import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 6 (Admin / Moderation / Verification / Account lifecycle) RLS + helper
 * negative-test suite, covering migration 20260708100000_phase6_moderation.sql.
 *
 * Conventions (same as phase4-labs / phase5-capital):
 *   * a policy that FILTERS rows            -> empty result set (toBe(0));
 *   * a REVOKED table/column grant on write -> /permission denied/;
 *   * a WITH CHECK / RLS violation on write -> /row-level security/;
 *   * an append-only immutability trigger   -> /append-only/.
 * Privileged rows (reports/mod_actions/appeals/verifications/...) are seeded via
 * db.admin, mirroring the API's service-role writer (every such write is
 * API-only by design).
 *
 * The eight §-CP1 negative guarantees under test:
 *   1. normal users cannot read the mod queue (reports/mod_actions);
 *   2. normal users cannot read audit logs;
 *   3. no role (incl. superuser/service_role) can mutate the immutable ledgers;
 *   4. non-authorized reviewers cannot take restricted (service-role) actions;
 *   5. a reported private DM is exposed ONLY via its report snapshot — never the
 *      live conversation/message (no blanket mod read);
 *   6. suspended users cannot write; and their already-published content hides;
 *   7. verification (biometric) rows are verifier/admin-only — NOT every mod;
 *   8. appeals route to a SECOND reviewer (reviewer != appellant, DB-enforced).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// --- fixtures ---------------------------------------------------------------

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

async function seedAdmin(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'admin' where id = $1`, [userId]);
  return userId;
}

/** A member granted the verifier capability (as an admin would via the API). */
async function seedVerifier(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`insert into verifier_grants (user_id) values ($1)`, [userId]);
  return userId;
}

async function setStatus(userId: string, status: string): Promise<void> {
  await db.admin.query(`update users set status = $1 where id = $2`, [status, userId]);
}

async function seedPublishedPost(authorId: string): Promise<string> {
  const res = await db.admin.query(
    `insert into posts (author_user_id, type, body) values ($1, 'update', 'seeded') returning id`,
    [authorId],
  );
  return (res.rows[0] as { id: string }).id;
}

/** Count rows a given user can SELECT from `table` by id (RLS-scoped). */
async function countVisible(userId: string, table: string, id: string): Promise<number> {
  const idCol =
    table === 'report_snapshots' ? 'report_id' : table === 'verifier_grants' ? 'user_id' : 'id';
  return db.asUser(userId, async (tx) => {
    const res = await tx.query(`select 1 from ${table} where ${idCol} = $1`, [id]);
    return res.rowCount ?? 0;
  });
}

// ---------------------------------------------------------------------------
// 1 + 2. Mod queue + audit log isolation from normal members
// ---------------------------------------------------------------------------
describe('mod queue + audit isolation', () => {
  it('a member sees only their OWN report; another member and the queue are hidden', async () => {
    const reporter = await seedMember('rep_a');
    const other = await seedMember('rep_b');
    const mod = await seedMod('rep_mod');
    const res = await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason)
       values ($1, 'user', $2, 'spam') returning id`,
      [reporter, other],
    );
    const reportId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(reporter, 'reports', reportId)).toBe(1); // reports_select_own
    expect(await countVisible(other, 'reports', reportId)).toBe(0); // not the reporter
    expect(await countVisible(mod, 'reports', reportId)).toBe(1); // reports_select_mod
  });

  it('normal members cannot read mod_actions; mods can', async () => {
    const actor = await seedMod('ma_mod');
    const member = await seedMember('ma_member');
    const target = await seedMember('ma_target');
    const res = await db.admin.query(
      `insert into mod_actions (actor_user_id, action, target_type, target_id)
       values ($1, 'warn_user', 'user', $2) returning id`,
      [actor, target],
    );
    const actionId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(member, 'mod_actions', actionId)).toBe(0);
    expect(await countVisible(actor, 'mod_actions', actionId)).toBe(1); // is_mod()
  });

  it('normal members cannot read audit_logs; admins can', async () => {
    const admin = await seedAdmin('al_admin');
    const member = await seedMember('al_member');
    const res = await db.admin.query(
      `insert into audit_logs (actor_user_id, action) values ($1, 'test.event') returning id`,
      [admin],
    );
    const auditId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(member, 'audit_logs', auditId)).toBe(0);
    expect(await countVisible(admin, 'audit_logs', auditId)).toBe(1); // audit_logs_select_admin
  });
});

// ---------------------------------------------------------------------------
// 3. Immutability of the append-only ledgers (§19 / §21 / §17)
// ---------------------------------------------------------------------------
describe('append-only immutability', () => {
  it('audit_logs cannot be updated or deleted — even by the table owner (trigger)', async () => {
    const admin = await seedAdmin('imm_admin');
    const res = await db.admin.query(
      `insert into audit_logs (actor_user_id, action) values ($1, 'immutable.probe') returning id`,
      [admin],
    );
    const id = (res.rows[0] as { id: string }).id;

    await expect(
      db.admin.query(`update audit_logs set action = 'tampered' where id = $1`, [id]),
    ).rejects.toThrow(/append-only/);
    await expect(db.admin.query(`delete from audit_logs where id = $1`, [id])).rejects.toThrow(
      /append-only/,
    );
  });

  it('audit_logs UPDATE/DELETE is also privilege-revoked for service_role', async () => {
    const admin = await seedAdmin('imm_svc');
    const res = await db.admin.query(
      `insert into audit_logs (actor_user_id, action) values ($1, 'svc.probe') returning id`,
      [admin],
    );
    const id = (res.rows[0] as { id: string }).id;

    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(`update audit_logs set action = 'x' where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied|append-only/);
  });

  it('mod_actions is append-only (owner trigger + service_role revoke)', async () => {
    const actor = await seedMod('imm_modact');
    const res = await db.admin.query(
      `insert into mod_actions (actor_user_id, action, target_type, target_id)
       values ($1, 'warn_user', 'user', $1) returning id`,
      [actor],
    );
    const id = (res.rows[0] as { id: string }).id;

    await expect(
      db.admin.query(`update mod_actions set reason = 'tampered' where id = $1`, [id]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(`delete from mod_actions where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied|append-only/);
  });

  it('capital_gate_evaluations (Maalgeli compliance log) is append-only', async () => {
    const member = await seedMember('imm_gate');
    const res = await db.admin.query(
      `insert into capital_gate_evaluations (user_id, granted) values ($1, true) returning id`,
      [member],
    );
    const id = (res.rows[0] as { id: string }).id;

    await expect(
      db.admin.query(`update capital_gate_evaluations set granted = false where id = $1`, [id]),
    ).rejects.toThrow(/append-only/);
  });

  it('a resolved report cannot be deleted by service_role (§19 trail)', async () => {
    const reporter = await seedMember('imm_rep');
    const res = await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason)
       values ($1, 'user', $1, 'spam') returning id`,
      [reporter],
    );
    const id = (res.rows[0] as { id: string }).id;

    await expect(
      db.withRole('service_role', null, (tx) => tx.query(`delete from reports where id = $1`, [id])),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 4 + 6. Suspended users cannot write (direct client / API bypass)
// ---------------------------------------------------------------------------
describe('suspended-user write block', () => {
  it('a suspended member cannot react, endorse, or edit their profile', async () => {
    const author = await seedMember('sw_author');
    const suspended = await seedMember('sw_suspended');
    const endorsee = await seedMember('sw_endorsee');
    const postId = await seedPublishedPost(author);
    await setStatus(suspended, 'suspended');

    await expect(
      db.asUser(suspended, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          suspended,
          postId,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.asUser(suspended, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill)
           values ($1, $2, 'sql')`,
          [suspended, endorsee],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.asUser(suspended, (tx) =>
        tx.query(`update profiles set display_name = 'evasion' where user_id = $1`, [suspended]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('an ACTIVE member can still react (control — the guard is status-scoped)', async () => {
    const author = await seedMember('sw_ok_author');
    const active = await seedMember('sw_ok_active');
    const postId = await seedPublishedPost(author);

    await expect(
      db.asUser(active, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          active,
          postId,
        ]),
      ),
    ).resolves.toBeDefined();
  });

  it('content creation is API-only for every authenticated user (no direct post insert)', async () => {
    const member = await seedMember('sw_directpost');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into posts (author_user_id, type, body) values ($1, 'update', 'x')`, [
          member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 6. Suspended user's already-published content is hidden
// ---------------------------------------------------------------------------
describe('suspension content-hiding', () => {
  it('hides a suspended/deactivated/deleted author post from readers, not from self/mods', async () => {
    const author = await seedMember('ch_author');
    const reader = await seedMember('ch_reader');
    const mod = await seedMod('ch_mod');
    const postId = await seedPublishedPost(author);

    // Visible to everyone while the author is active.
    expect(await countVisible(reader, 'posts', postId)).toBe(1);

    for (const status of ['suspended', 'deactivated', 'pending_deletion', 'deleted']) {
      await setStatus(author, status);
      expect(await countVisible(reader, 'posts', postId)).toBe(0); // hidden from readers
      expect(await countVisible(author, 'posts', postId)).toBe(1); // author still sees own
      expect(await countVisible(mod, 'posts', postId)).toBe(1); // mod sees for adjudication
    }

    // Reversible: unsuspend restores visibility.
    await setStatus(author, 'active');
    expect(await countVisible(reader, 'posts', postId)).toBe(1);
  });

  it('an ownerless (seed/unclaimed) listing stays visible; a suspended owner hides it', async () => {
    // Regression guard: author_is_active(NULL) is false, so the suspension
    // clause must be NULL-tolerant or ownerless seed listings vanish.
    const reader = await seedMember('bl_reader');
    const owner = await seedMember('bl_owner');
    const category = (
      await db.admin.query(`select id from listing_categories order by position limit 1`)
    ).rows[0].id;
    const unclaimed = (
      await db.admin.query(
        `insert into business_listings (business_name, category_id, source) values ('Seed Co', $1, 'seed') returning id`,
        [category],
      )
    ).rows[0].id;
    const owned = (
      await db.admin.query(
        `insert into business_listings (business_name, category_id, owner_user_id) values ('Owned Co', $1, $2) returning id`,
        [category, owner],
      )
    ).rows[0].id;

    expect(await countVisible(reader, 'business_listings', unclaimed)).toBe(1); // null owner → visible
    expect(await countVisible(reader, 'business_listings', owned)).toBe(1);
    await setStatus(owner, 'suspended');
    expect(await countVisible(reader, 'business_listings', unclaimed)).toBe(1); // no owner to hide
    expect(await countVisible(reader, 'business_listings', owned)).toBe(0); // suspended owner hidden
  });
});

// ---------------------------------------------------------------------------
// 5. DM report-contextual review — no blanket mod read
// ---------------------------------------------------------------------------
describe('DM report-contextual review', () => {
  it('a mod cannot read a private conversation/message but CAN read the report snapshot', async () => {
    const a = await seedMember('dm_a');
    const b = await seedMember('dm_b');
    const mod = await seedMod('dm_mod');

    const convRes = await db.admin.query(
      `insert into conversations (initiator_user_id, recipient_user_id, status)
       values ($1, $2, 'accepted') returning id`,
      [a, b],
    );
    const conversationId = (convRes.rows[0] as { id: string }).id;
    const msgRes = await db.admin.query(
      `insert into messages (conversation_id, sender_user_id, body) values ($1, $2, 'private text') returning id`,
      [conversationId, a],
    );
    const messageId = (msgRes.rows[0] as { id: string }).id;

    // The invariant: NO blanket mod read of DMs.
    expect(await countVisible(mod, 'conversations', conversationId)).toBe(0);
    expect(await countVisible(mod, 'messages', messageId)).toBe(0);

    // A report + snapshot (captured at report time by the API, service role).
    const reportRes = await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason)
       values ($1, 'message', $2, 'harassment') returning id`,
      [b, messageId],
    );
    const reportId = (reportRes.rows[0] as { id: string }).id;
    await db.admin.query(
      `insert into report_snapshots (report_id, entity_type, entity_id, captured_body)
       values ($1, 'message', $2, 'private text')`,
      [reportId, messageId],
    );

    // Mod reviews the SNAPSHOT, never the thread; a member cannot read snapshots.
    expect(await countVisible(mod, 'report_snapshots', reportId)).toBe(1);
    expect(await countVisible(a, 'report_snapshots', reportId)).toBe(0);
  });

  it('report snapshots are evidence — the captured body cannot be edited', async () => {
    const reporter = await seedMember('snap_rep');
    const reportRes = await db.admin.query(
      `insert into reports (reporter_user_id, target_type, target_id, reason)
       values ($1, 'user', $1, 'other') returning id`,
      [reporter],
    );
    const reportId = (reportRes.rows[0] as { id: string }).id;
    await db.admin.query(
      `insert into report_snapshots (report_id, entity_type, entity_id, captured_body)
       values ($1, 'user', $1, 'original')`,
      [reportId],
    );
    await expect(
      db.admin.query(`update report_snapshots set captured_body = 'edited' where report_id = $1`, [
        reportId,
      ]),
    ).rejects.toThrow(/append-only/);
  });
});

// ---------------------------------------------------------------------------
// 7. Verification rows are verifier/admin-only (biometric least-privilege)
// ---------------------------------------------------------------------------
describe('verification least-privilege', () => {
  it('a plain mod cannot read verification rows; requester, verifier, admin can', async () => {
    const requester = await seedMember('vf_req');
    const other = await seedMember('vf_other');
    const plainMod = await seedMod('vf_mod');
    const verifier = await seedVerifier('vf_verifier');
    const admin = await seedAdmin('vf_admin');

    const res = await db.admin.query(
      `insert into verifications (user_id, type) values ($1, 'identity') returning id`,
      [requester],
    );
    const id = (res.rows[0] as { id: string }).id;

    expect(await countVisible(requester, 'verifications', id)).toBe(1); // own
    expect(await countVisible(other, 'verifications', id)).toBe(0); // stranger
    expect(await countVisible(plainMod, 'verifications', id)).toBe(0); // NOT every mod
    expect(await countVisible(verifier, 'verifications', id)).toBe(1); // is_verifier()
    expect(await countVisible(admin, 'verifications', id)).toBe(1); // admin inherits
  });

  it('the verifier roster + biometric access log are admin-only', async () => {
    const verifier = await seedVerifier('vg_verifier');
    const member = await seedMember('vg_member');
    const admin = await seedAdmin('vg_admin');

    expect(await countVisible(verifier, 'verifier_grants', verifier)).toBe(0); // not even the grantee
    expect(await countVisible(member, 'verifier_grants', verifier)).toBe(0);
    expect(await countVisible(admin, 'verifier_grants', verifier)).toBe(1); // admin-only roster

    // Members cannot self-grant the verifier capability.
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into verifier_grants (user_id) values ($1)`, [member]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 8. Appeals — second-reviewer routing + queue isolation
// ---------------------------------------------------------------------------
describe('appeals routing + isolation', () => {
  async function seedAppeal(): Promise<{ appealId: string; appellant: string; mod: string }> {
    const mod = await seedMod(`ap_mod_${Math.floor(Math.random() * 1e9)}`);
    const appellant = await seedMember(`ap_user_${Math.floor(Math.random() * 1e9)}`);
    const actionRes = await db.admin.query(
      `insert into mod_actions (actor_user_id, action, target_type, target_id)
       values ($1, 'remove_content', 'user', $2) returning id`,
      [mod, appellant],
    );
    const actionId = (actionRes.rows[0] as { id: string }).id;
    const appealRes = await db.admin.query(
      `insert into appeals (mod_action_id, appellant_user_id, body)
       values ($1, $2, 'please reconsider') returning id`,
      [actionId, appellant],
    );
    return { appealId: (appealRes.rows[0] as { id: string }).id, appellant, mod };
  }

  it('the appellant sees their own appeal; a stranger cannot; a mod sees the queue', async () => {
    const { appealId, appellant } = await seedAppeal();
    const stranger = await seedMember('ap_stranger');
    const mod = await seedMod('ap_queue_mod');

    expect(await countVisible(appellant, 'appeals', appealId)).toBe(1); // appeals_select_own
    expect(await countVisible(stranger, 'appeals', appealId)).toBe(0);
    expect(await countVisible(mod, 'appeals', appealId)).toBe(1); // appeals_select_mod
  });

  it('an appeal cannot be self-reviewed by the appellant (DB CHECK)', async () => {
    const { appealId, appellant } = await seedAppeal();
    await expect(
      db.admin.query(`update appeals set reviewed_by_user_id = $1 where id = $2`, [
        appellant,
        appealId,
      ]),
    ).rejects.toThrow(/appeals_reviewer_not_appellant|violates check/);
  });

  it('members cannot file an appeal through a direct client write (API-only)', async () => {
    const { appealId } = await seedAppeal();
    const member = await seedMember('ap_direct');
    // A distinct mod_action to appeal against.
    const actionRes = await db.admin.query(
      `insert into mod_actions (actor_user_id, action, target_type, target_id)
       values ($1, 'warn_user', 'user', $2) returning id`,
      [member, member],
    );
    const actionId = (actionRes.rows[0] as { id: string }).id;
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into appeals (mod_action_id, appellant_user_id, body) values ($1, $2, 'x')`,
          [actionId, member],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    expect(appealId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Governance log — published-to-members, drafts admin-only
// ---------------------------------------------------------------------------
describe('governance log visibility', () => {
  it('members see published entries only; admins see drafts; members cannot write', async () => {
    const admin = await seedAdmin('gov_admin');
    const member = await seedMember('gov_member');

    const pubRes = await db.admin.query(
      `insert into governance_log_entries (title, body, published_at)
       values ('Rule change', 'body', now()) returning id`,
    );
    const publishedId = (pubRes.rows[0] as { id: string }).id;
    const draftRes = await db.admin.query(
      `insert into governance_log_entries (title, body) values ('Draft', 'wip') returning id`,
    );
    const draftId = (draftRes.rows[0] as { id: string }).id;

    expect(await countVisible(member, 'governance_log_entries', publishedId)).toBe(1);
    expect(await countVisible(member, 'governance_log_entries', draftId)).toBe(0); // draft hidden
    expect(await countVisible(admin, 'governance_log_entries', draftId)).toBe(1); // admin sees draft

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into governance_log_entries (title, body) values ('x', 'y')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
