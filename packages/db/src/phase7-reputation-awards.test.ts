import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 7 (Reputation engine · milestone-badge awarding · Community Awards ·
 * Mentor-in-Residence) RLS + anti-gaming negative-test suite, covering
 * migration 20260709000000_phase7_reputation_awards.sql.
 *
 * Conventions (same as phase6-moderation):
 *   * a policy that FILTERS rows            -> empty result set (toBe(0));
 *   * a REVOKED table/column grant on write -> /permission denied/;
 *   * a WITH CHECK / RLS violation on write -> /row-level security/;
 *   * an append-only immutability trigger   -> /append-only/.
 *
 * The guarantees under test:
 *   1. the reputation engine (award_reputation) is service-role-only — a member
 *      cannot grant themselves points via a direct RPC;
 *   2. anti-gaming holds: no AI-account Helper score, 30 pt/day/class cap, and
 *      idempotent per-entity credit (no double points);
 *   3. reputation_scores is member-readable but client-unwritable;
 *      reputation_events is own-rows + mod only and append-only (no UPDATE);
 *   4. award_badge is service-role-only and idempotent (2nd award -> false);
 *   5. award_votes: writes are service-role-only, a vote outside an open cycle
 *      is rejected, and one-per-category is unique; members read only own votes;
 *   6. advisor_grants is admin-read-only; mentor_residencies + award_cycles are
 *      member-readable; all three are client-unwritable; is_advisor() honours a
 *      grant.
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

/** Call a Phase-7 SECURITY DEFINER fn as the service role (as the API does). */
function asService<T>(fn: (tx: import('pg').Client) => Promise<T>): Promise<T> {
  return db.withRole('service_role', { role: 'service_role' }, fn);
}

async function awardReputation(
  userId: string,
  eventType: string,
  scoreClass: 'contribution' | 'helper',
  points: number,
  entityType: string,
  entityId: string,
): Promise<number> {
  return asService(async (tx) => {
    const res = await tx.query(
      `select public.award_reputation($1, $2, $3, $4, $5::entity_type, $6) as awarded`,
      [userId, eventType, scoreClass, points, entityType, entityId],
    );
    return (res.rows[0] as { awarded: number }).awarded;
  });
}

async function scoreOf(userId: string): Promise<{ contribution: number; helper: number }> {
  const res = await db.admin.query(
    `select contribution_score, helper_score from reputation_scores where user_id = $1`,
    [userId],
  );
  const row = res.rows[0] as { contribution_score: number; helper_score: number } | undefined;
  return { contribution: row?.contribution_score ?? 0, helper: row?.helper_score ?? 0 };
}

function uuid(): Promise<string> {
  return db.admin.query(`select gen_random_uuid() as id`).then((r) => (r.rows[0] as { id: string }).id);
}

// ---------------------------------------------------------------------------
// 1. The reputation engine is service-role-only
// ---------------------------------------------------------------------------
describe('reputation engine is service-role-only', () => {
  it('a member cannot execute award_reputation / award_badge / recompute', async () => {
    const member = await seedMember('rep_self');
    const entity = await uuid();
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`select public.award_reputation($1,'post_created','contribution',5,'post'::entity_type,$2)`, [
          member,
          entity,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) => tx.query(`select public.award_badge($1,'top-helper',null)`, [member])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) => tx.query(`select public.recompute_reputation_scores($1)`, [member])),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 2. Anti-gaming: no AI Helper score, daily cap, idempotent credit
// ---------------------------------------------------------------------------
describe('anti-gaming', () => {
  it('AI accounts never earn Helper score (but may earn contribution)', async () => {
    const ai = await seedMember('rep_ai');
    await db.admin.query(`update users set is_ai = true where id = $1`, [ai]);
    const helperEntity = await uuid();
    const contribEntity = await uuid();

    expect(await awardReputation(ai, 'ask_credited', 'helper', 10, 'comment', helperEntity)).toBe(0);
    expect(await awardReputation(ai, 'post_created', 'contribution', 5, 'post', contribEntity)).toBe(5);

    const score = await scoreOf(ai);
    expect(score.helper).toBe(0);
    expect(score.contribution).toBe(5);
  });

  it('caps a score class at 30 points per day (excess clamped to 0)', async () => {
    const member = await seedMember('rep_cap');
    const a = await uuid();
    const b = await uuid();
    const c = await uuid();

    expect(await awardReputation(member, 'post_created', 'contribution', 25, 'post', a)).toBe(25);
    // 5 of the requested 10 remain under the 30/day cap.
    expect(await awardReputation(member, 'post_created', 'contribution', 10, 'post', b)).toBe(5);
    // Nothing left today.
    expect(await awardReputation(member, 'post_created', 'contribution', 5, 'post', c)).toBe(0);

    expect((await scoreOf(member)).contribution).toBe(30);
  });

  it('credits a given entity at most once (no double points)', async () => {
    const member = await seedMember('rep_idem');
    const entity = await uuid();
    expect(await awardReputation(member, 'ask_credited', 'helper', 10, 'comment', entity)).toBe(10);
    expect(await awardReputation(member, 'ask_credited', 'helper', 10, 'comment', entity)).toBe(0);
    expect((await scoreOf(member)).helper).toBe(10);
  });

  it('recompute applies the 90-day decay window', async () => {
    const member = await seedMember('rep_decay');
    const entity = await uuid();
    expect(await awardReputation(member, 'post_created', 'contribution', 20, 'post', entity)).toBe(20);
    // Age the ledger row past the decay window. The append-only guard blocks a
    // normal UPDATE (proven above), so momentarily disable it — a test-only
    // manipulation to simulate the passage of 90 days.
    await db.admin.query(`alter table reputation_events disable trigger reputation_events_no_update`);
    await db.admin.query(
      `update reputation_events set created_at = now() - interval '120 days' where entity_id = $1`,
      [entity],
    );
    await db.admin.query(`alter table reputation_events enable trigger reputation_events_no_update`);
    await asService((tx) => tx.query(`select public.recompute_reputation_scores($1)`, [member]));
    expect((await scoreOf(member)).contribution).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. reputation_scores / reputation_events RLS + append-only
// ---------------------------------------------------------------------------
describe('reputation table RLS', () => {
  it('any member reads any score row, but cannot write it', async () => {
    const owner = await seedMember('rep_owner');
    const viewer = await seedMember('rep_viewer');
    await awardReputation(owner, 'post_created', 'contribution', 5, 'post', await uuid());

    const visible = await db.asUser(viewer, async (tx) => {
      const r = await tx.query(`select 1 from reputation_scores where user_id = $1`, [owner]);
      return r.rowCount ?? 0;
    });
    expect(visible).toBe(1); // reputation_scores_select_all

    await expect(
      db.asUser(viewer, (tx) =>
        tx.query(`update reputation_scores set contribution_score = 9999 where user_id = $1`, [owner]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('reputation_events is own-rows + mod only, and append-only', async () => {
    const owner = await seedMember('re_owner');
    const other = await seedMember('re_other');
    const mod = await seedMod('re_mod');
    const entity = await uuid();
    await awardReputation(owner, 'post_created', 'contribution', 5, 'post', entity);

    const countFor = (userId: string) =>
      db.asUser(userId, async (tx) => {
        const r = await tx.query(`select 1 from reputation_events where entity_id = $1`, [entity]);
        return r.rowCount ?? 0;
      });
    expect(await countFor(owner)).toBe(1); // own rows
    expect(await countFor(other)).toBe(0); // not visible to others
    expect(await countFor(mod)).toBe(1); // mods can review

    // Append-only: even the superuser cannot edit a ledger row.
    await expect(
      db.admin.query(`update reputation_events set points = 999 where entity_id = $1`, [entity]),
    ).rejects.toThrow(/append-only/);
  });
});

// ---------------------------------------------------------------------------
// 4. award_badge idempotency
// ---------------------------------------------------------------------------
describe('award_badge', () => {
  it('awards a milestone badge once; a retry is a no-op', async () => {
    const member = await seedMember('badge_member');
    const first = await asService(async (tx) => {
      const r = await tx.query(`select public.award_badge($1,'lab-lead',null) as ok`, [member]);
      return (r.rows[0] as { ok: boolean }).ok;
    });
    const second = await asService(async (tx) => {
      const r = await tx.query(`select public.award_badge($1,'lab-lead',null) as ok`, [member]);
      return (r.rows[0] as { ok: boolean }).ok;
    });
    expect(first).toBe(true);
    expect(second).toBe(false);

    const count = await db.admin.query(
      `select count(*)::int as n from user_badges ub
         join badge_definitions bd on bd.id = ub.badge_id
        where ub.user_id = $1 and bd.slug = 'lab-lead'`,
      [member],
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Community Awards — award_cycles + award_votes
// ---------------------------------------------------------------------------
describe('community awards', () => {
  async function openCycle(quarter: string): Promise<void> {
    await db.admin.query(
      `insert into award_cycles (quarter, opens_at, closes_at)
       values ($1, now() - interval '1 day', now() + interval '7 days')`,
      [quarter],
    );
  }

  it('award_cycles is member-readable but client-unwritable', async () => {
    const member = await seedMember('ac_member');
    await openCycle('2026-Q3');
    const visible = await db.asUser(member, async (tx) => {
      const r = await tx.query(`select 1 from award_cycles where quarter = '2026-Q3'`);
      return r.rowCount ?? 0;
    });
    expect(visible).toBe(1);
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into award_cycles (quarter, opens_at, closes_at) values ('2026-Q4', now(), now() + interval '1 day')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot cast a vote via a direct client insert', async () => {
    const member = await seedMember('av_client');
    const target = await seedMember('av_target');
    await openCycle('2026-Q1');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into award_votes (quarter, category, voter_user_id, target_type, target_id)
           values ('2026-Q1','most_helpful',$1,'user',$2)`,
          [member, target],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a vote outside an open cycle is rejected (service role too)', async () => {
    const member = await seedMember('av_closed');
    const target = await seedMember('av_ctarget');
    // No cycle row for 2099-Q1 → not open.
    await expect(
      asService((tx) =>
        tx.query(
          `insert into award_votes (quarter, category, voter_user_id, target_type, target_id)
           values ('2099-Q1','best_lab',$1,'lab',$2)`,
          [member, target],
        ),
      ),
    ).rejects.toThrow(/not open/);
  });

  it('one vote per (quarter, category); a member reads only their own', async () => {
    const voter = await seedMember('av_voter');
    const other = await seedMember('av_other');
    const target = await seedMember('av_vtarget');
    await openCycle('2026-Q2');

    await asService((tx) =>
      tx.query(
        `insert into award_votes (quarter, category, voter_user_id, target_type, target_id)
         values ('2026-Q2','rising_builder',$1,'user',$2)`,
        [voter, target],
      ),
    );
    // Second vote in the same category → unique violation.
    await expect(
      asService((tx) =>
        tx.query(
          `insert into award_votes (quarter, category, voter_user_id, target_type, target_id)
           values ('2026-Q2','rising_builder',$1,'user',$2)`,
          [voter, target],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);

    const ownVisible = await db.asUser(voter, async (tx) => {
      const r = await tx.query(`select 1 from award_votes where quarter = '2026-Q2'`);
      return r.rowCount ?? 0;
    });
    const otherVisible = await db.asUser(other, async (tx) => {
      const r = await tx.query(`select 1 from award_votes where quarter = '2026-Q2'`);
      return r.rowCount ?? 0;
    });
    expect(ownVisible).toBe(1); // award_votes_select_own
    expect(otherVisible).toBe(0); // not the voter
  });

  it('award_vote_tally counts votes for the service-role caller (auth.uid() is NULL there)', async () => {
    const v1 = await seedMember('tal_v1');
    const v2 = await seedMember('tal_v2');
    const target = await seedMember('tal_target');
    await openCycle('2027-Q1');
    for (const voter of [v1, v2]) {
      await asService((tx) =>
        tx.query(
          `insert into award_votes (quarter, category, voter_user_id, target_type, target_id)
           values ('2027-Q1','most_helpful',$1,'user',$2)`,
          [voter, target],
        ),
      );
    }
    // The results flow calls the tally as the service role, where auth.uid() is
    // NULL — it must still return the counts (no internal is_admin() guard).
    const rows = await asService(async (tx) => {
      const r = await tx.query(`select category, target_id, votes from award_vote_tally('2027-Q1')`);
      return r.rows as { category: string; target_id: string; votes: string }[];
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target_id).toBe(target);
    expect(Number(rows[0]?.votes)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 6. Mentor-in-Residence — advisor_grants + mentor_residencies + is_advisor
// ---------------------------------------------------------------------------
describe('mentor-in-residence', () => {
  it('advisor_grants is admin-read-only and client-unwritable; is_advisor honours a grant', async () => {
    const advisor = await seedMember('mir_advisor');
    const admin = await seedAdmin('mir_admin');
    await db.admin.query(`insert into advisor_grants (user_id) values ($1)`, [advisor]);

    // Admin reads the roster; a normal member does not.
    const adminSees = await db.asUser(admin, async (tx) => {
      const r = await tx.query(`select 1 from advisor_grants where user_id = $1`, [advisor]);
      return r.rowCount ?? 0;
    });
    const advisorSees = await db.asUser(advisor, async (tx) => {
      const r = await tx.query(`select 1 from advisor_grants where user_id = $1`, [advisor]);
      return r.rowCount ?? 0;
    });
    expect(adminSees).toBe(1); // advisor_grants_select_admin
    expect(advisorSees).toBe(0); // roster is admin-only

    // is_advisor() is true for the granted member.
    const isAdvisor = await db.asUser(advisor, async (tx) => {
      const r = await tx.query(`select public.is_advisor() as ok`);
      return (r.rows[0] as { ok: boolean }).ok;
    });
    expect(isAdvisor).toBe(true);

    await expect(
      db.asUser(advisor, (tx) => tx.query(`insert into advisor_grants (user_id) values ($1)`, [advisor])),
    ).rejects.toThrow(/permission denied/);
  });

  it('mentor_residencies is member-readable but client-unwritable', async () => {
    const advisor = await seedMember('mir_res_advisor');
    const viewer = await seedMember('mir_res_viewer');
    await db.admin.query(
      `insert into mentor_residencies (advisor_user_id, period, starts_on, ends_on)
       values ($1, '2026-Q3', current_date, current_date + 90)`,
      [advisor],
    );
    const visible = await db.asUser(viewer, async (tx) => {
      const r = await tx.query(`select 1 from mentor_residencies where period = '2026-Q3'`);
      return r.rowCount ?? 0;
    });
    expect(visible).toBe(1); // mentor_residencies_select_all
    await expect(
      db.asUser(viewer, (tx) =>
        tx.query(
          `insert into mentor_residencies (advisor_user_id, period, starts_on, ends_on)
           values ($1, '2026-Q4', current_date, current_date + 90)`,
          [viewer],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
