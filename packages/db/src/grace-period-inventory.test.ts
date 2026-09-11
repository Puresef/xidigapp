import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCandidate, seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * 'pending_deletion' — the cancellable §19 30-day grace — is ordinary
 * membership until the final transition (owner ruling, 11 Sep; migration
 * 20260911000500). Until then this file pinned the opposite: policies built
 * for SUSPENSION enforcement (docs/rls-phase6-moderation.md) used active-only
 * predicates, so a grace member could not edit a profile, react, endorse,
 * suggest terms or vote, could not read members-only Spaces or community
 * Candidates, and their content vanished for every other reader — while the
 * app admitted them and surfaced the refusals as 500s and a misleading 404.
 *
 * Pinned now, for every status:
 *   ordinary member actions and reach — active + pending_deletion allowed;
 *     suspended / deactivated / deleted refused (the client lifecycle gate
 *     and the older rules both still say no);
 *   content visibility — a grace author's content is seen exactly like an
 *     active author's;
 *   privilege — mod / admin / verifier / advisor and the governance/capital
 *     supporter capabilities stay ACTIVE-ONLY during the grace; the ordinary
 *     paid entitlements continue (20260911000600, grace-entitlements.test.ts);
 *   one rule — every ordinary-member predicate agrees with the gate.
 */

let db: TestDatabase;

const STATUSES = ['active', 'pending_deletion', 'suspended', 'deactivated', 'deleted'] as const;
type Status = (typeof STATUSES)[number];
const ORDINARY: readonly Status[] = ['active', 'pending_deletion'];
const allowed = (s: Status) => ORDINARY.includes(s);

let peer: string;
let peerPost: string;
let membersLab: string;
let candidate: string;
let poll: string;
let pollOption: string;
const member = {} as Record<Status, string>;
const memberPost = {} as Record<Status, string>;

async function setStatus(id: string, status: Status): Promise<void> {
  if (status === 'active') return;
  if (status === 'deleted') {
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
      [id],
    );
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.anonymise_user($1)`, [id]),
    );
    return;
  }
  await db.admin.query(
    `update users set status = $2::account_status,
       deletion_requested_at = case when $2 = 'pending_deletion' then now() else null end
     where id = $1`,
    [id, status],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  peer = await seedMember(db, 'gr_peer');
  await db.admin.query(`update profiles set skills = array['sql'] where user_id = $1`, [peer]);
  peerPost = (
    await db.admin.query(
      `insert into posts (author_user_id, type, body) values ($1, 'update', 'hello') returning id`,
      [peer],
    )
  ).rows[0].id as string;
  membersLab = (
    await db.admin.query(
      `insert into labs (name, slug, lead_user_id, visibility) values ('Members', 'gr-members', $1, 'members') returning id`,
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

  for (const status of STATUSES) {
    const id = await seedMember(db, `gr_${status}`);
    member[status] = id;
    memberPost[status] = (
      await db.admin.query(
        `insert into posts (author_user_id, type, body) values ($1, 'update', 'by ' || $2) returning id`,
        [id, status],
      )
    ).rows[0].id as string;
    await setStatus(id, status);
  }
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  db.asUser(userId, async (tx) => (await tx.query(sql, params)).rowCount ?? 0);

/** true = the write went through; false = RLS refused it. Anything else throws. */
async function attempt(userId: string, sql: string, params: unknown[]): Promise<boolean> {
  try {
    const res = await db.asUser(userId, (tx) => tx.query(sql, params));
    return (res.rowCount ?? 0) > 0;
  } catch (error) {
    if (/row-level security/.test(String(error))) return false;
    throw error;
  }
}

describe.each(STATUSES)('ordinary member use — %s', (status) => {
  const me = () => member[status];
  const verdict = allowed(status) ? 'works' : 'is refused';

  it(`profile edit ${verdict}`, async () => {
    expect(
      await attempt(me(), `update profiles set bio = 'still here' where user_id = $1`, [me()]),
    ).toBe(allowed(status));
  });

  it(`reaction ${verdict}`, async () => {
    expect(
      await attempt(
        me(),
        `insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`,
        [me(), peerPost],
      ),
    ).toBe(allowed(status));
  });

  it(`skill endorsement ${verdict}`, async () => {
    expect(
      await attempt(
        me(),
        `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, 'sql')`,
        [me(), peer],
      ),
    ).toBe(allowed(status));
  });

  it(`term suggestion ${verdict}`, async () => {
    expect(
      await attempt(
        me(),
        `insert into term_suggestions (kind, term, suggested_by) values ('lane', $2, $1)`,
        [me(), `gr${status.replace('_', '')}`],
      ),
    ).toBe(allowed(status));
  });

  it(`poll vote and re-vote ${verdict}`, async () => {
    expect(
      await attempt(
        me(),
        `insert into poll_votes (poll_option_id, post_id, voter_user_id) values ($1, $2, $3)`,
        [pollOption, poll, me()],
      ),
    ).toBe(allowed(status));
    expect(
      await attempt(
        me(),
        `update poll_votes set poll_option_id = $1 where post_id = $2 and voter_user_id = $3`,
        [pollOption, poll, me()],
      ),
    ).toBe(allowed(status));
  });

  it(`members-only Space and community Candidate ${allowed(status) ? 'are readable' : 'are not readable'}`, async () => {
    const expected = allowed(status) ? 1 : 0;
    expect(await rows(me(), `select 1 from labs where id = $1`, [membersLab])).toBe(expected);
    expect(await rows(me(), `select 1 from venture_candidates where id = $1`, [candidate])).toBe(
      expected,
    );
  });

  it(`their post is ${allowed(status) ? 'visible' : 'hidden'} to another member`, async () => {
    expect(await rows(peer, `select 1 from posts where id = $1`, [memberPost[status]])).toBe(
      allowed(status) ? 1 : 0,
    );
  });

  it('the ordinary-member predicates agree with the client lifecycle gate', async () => {
    const res = await db.asUser(me(), (tx) =>
      tx.query(
        `select public.current_account_can_use_client_api() as gate,
                public.author_is_active($1) as visible_author`,
        [me()],
      ),
    );
    expect(res.rows[0]).toEqual({ gate: allowed(status), visible_author: allowed(status) });
  });
});

describe('privileged reach stays ACTIVE-ONLY during the grace', () => {
  let graceMod: string;
  let graceAdmin: string;
  let graceVerifier: string;
  let graceAdvisor: string;
  let graceSupporter: string;
  let supporterLab: string;
  let peerReport: string;

  const fn = async (userId: string, sql: string) =>
    (await db.asUser(userId, (tx) => tx.query(sql))).rows[0].v as boolean;

  beforeAll(async () => {
    graceMod = await seedMember(db, 'gr_mod');
    graceAdmin = await seedMember(db, 'gr_admin');
    graceVerifier = await seedMember(db, 'gr_verifier');
    graceAdvisor = await seedMember(db, 'gr_advisor');
    graceSupporter = await seedMember(db, 'gr_supporter');
    await db.admin.query(`update users set role = 'mod' where id = $1`, [graceMod]);
    await db.admin.query(`update users set role = 'admin' where id = $1`, [graceAdmin]);
    await db.admin.query(`insert into verifier_grants (user_id) values ($1)`, [graceVerifier]);
    await db.admin.query(`insert into advisor_grants (user_id) values ($1)`, [graceAdvisor]);
    await db.admin.query(
      `update profiles set membership_tier_id = 'supporter' where user_id = $1`,
      [graceSupporter],
    );
    supporterLab = (
      await db.admin.query(
        `insert into labs (name, slug, lead_user_id, visibility, is_supporter_only)
         values ('Supporters', 'gr-supporters', $1, 'members', true) returning id`,
        [peer],
      )
    ).rows[0].id as string;
    peerReport = (
      await db.admin.query(
        `insert into reports (reporter_user_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam') returning id`,
        [peer, peerPost],
      )
    ).rows[0].id as string;

    // Positive controls: every power holds while the account is active.
    expect(await fn(graceMod, `select public.is_mod() as v`)).toBe(true);
    expect(await fn(graceAdmin, `select public.is_admin() as v`)).toBe(true);
    expect(await fn(graceVerifier, `select public.is_verifier() as v`)).toBe(true);
    expect(await fn(graceAdvisor, `select public.is_advisor() as v`)).toBe(true);
    expect(await fn(graceSupporter, `select public.is_supporter() as v`)).toBe(true);

    for (const id of [graceMod, graceAdmin, graceVerifier, graceAdvisor, graceSupporter]) {
      await setStatus(id, 'pending_deletion');
    }
  });

  it('moderator: is_mod() false, the report queue unreadable', async () => {
    expect(await fn(graceMod, `select public.is_mod() as v`)).toBe(false);
    expect(await rows(graceMod, `select 1 from reports where id = $1`, [peerReport])).toBe(0);
  });

  it('admin: is_admin() false, the audit log unreadable', async () => {
    expect(await fn(graceAdmin, `select public.is_admin() as v`)).toBe(false);
    expect(await rows(graceAdmin, `select 1 from audit_logs`)).toBe(0);
  });

  it('verifier: is_verifier() false', async () => {
    expect(await fn(graceVerifier, `select public.is_verifier() as v`)).toBe(false);
  });

  it('advisor: is_advisor() false', async () => {
    expect(await fn(graceAdvisor, `select public.is_advisor() as v`)).toBe(false);
  });

  it('supporter: governance/capital capabilities stay active-only; paid entitlements continue (20260911000600)', async () => {
    expect(await fn(graceSupporter, `select public.has_capability('vote_candidate') as v`)).toBe(
      false,
    );
    expect(await fn(graceSupporter, `select public.has_capability('builder_path') as v`)).toBe(
      false,
    );
    // Ordinary paid entitlements follow ordinary membership (owner ruling;
    // the full matrix lives in grace-entitlements.test.ts).
    expect(await fn(graceSupporter, `select public.is_supporter() as v`)).toBe(true);
    expect(
      await fn(graceSupporter, `select public.has_entitlement('elevated_limits') as v`),
    ).toBe(true);
    expect(await rows(graceSupporter, `select 1 from labs where id = $1`, [supporterLab])).toBe(1);
  });

  it('is_active_account() keeps its strict meaning, and no policy relies on it any more', async () => {
    expect(await fn(member.pending_deletion, `select public.is_active_account() as v`)).toBe(false);
    const res = await db.admin.query(
      `select tablename, policyname from pg_policies
        where schemaname = 'public'
          and coalesce(qual, '') || coalesce(with_check, '') ~ 'is_active_account\\('`,
    );
    expect(res.rows).toEqual([]);
  });
});
