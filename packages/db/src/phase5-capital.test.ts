import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 5 (Capital / Maal) RLS + helper negative-test suite, covering migration
 * 20260707000000_phase5_capital.sql.
 *
 * Conventions (same as phase4-labs.test.ts):
 *   * a policy that FILTERS rows            -> empty result set (toBe(0));
 *   * a REVOKED table/column grant on write -> /permission denied/;
 * Capital rows are seeded via db.admin, mirroring the API's service-role writer
 * (every Capital write is API-only by design).
 *
 * Visibility model under test (§17):
 *   draft          -> creator + Lab members + admin only (never community);
 *   reviewers_only -> reviewer set (mod/admin) + Lab members + creator + admin;
 *   all_members    -> any logged-in active member, once it leaves draft.
 * Reviewer set (v1.0) = is_mod() OR is_admin(), MINUS recusal (a Lab member
 * cannot review its own Candidate).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// --- fixtures ---------------------------------------------------------------

/** Active member (beta gate bypassed) with a profile. */
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

/** A member promoted to admin. */
async function seedAdmin(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'admin' where id = $1`, [userId]);
  return userId;
}

/** A member on the Supporter tier (holds vote_candidate + *_path capabilities). */
async function seedSupporter(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update profiles set membership_tier_id = 'supporter' where user_id = $1`, [
    userId,
  ]);
  return userId;
}

/** Seed a Space (lead's own lab_members row inserted), as the API would. */
async function seedLab(lead: string, slug: string): Promise<string> {
  const res = await db.admin.query(
    `insert into labs (name, slug, lead_user_id, visibility, space_mode)
     values ($1, $2, $3, 'members', 'lab') returning id`,
    [`Lab ${slug}`, slug, lead],
  );
  const labId = (res.rows[0] as { id: string }).id;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now())`,
    [labId, lead],
  );
  return labId;
}

/** Add an active member to a Space (service-role write). */
async function seedMembership(labId: string, userId: string): Promise<void> {
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now())`,
    [labId, userId],
  );
}

/** Seed a Candidate the way the API's service role would. */
async function seedCandidate(
  labId: string,
  creator: string,
  opts: {
    status?: 'draft' | 'submitted' | 'in_review' | 'approved' | 'parked' | 'declined';
    visibility?: 'all_members' | 'reviewers_only';
    coLabId?: string;
    name?: string;
  } = {},
): Promise<string> {
  const res = await db.admin.query(
    `insert into venture_candidates
       (lab_id, co_lab_id, created_by_user_id, name, status, visibility)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      labId,
      opts.coLabId ?? null,
      creator,
      opts.name ?? 'Test Venture',
      opts.status ?? 'draft',
      opts.visibility ?? 'all_members',
    ],
  );
  return (res.rows[0] as { id: string }).id;
}

/** Read helper: how many rows of `table` with id=$1 does `viewer` see? */
async function countVisible(viewer: string, table: string, id: string): Promise<number> {
  const rows = await db.asUser(viewer, (tx) =>
    tx.query(`select 1 from ${table} where id = $1`, [id]),
  );
  return rows.rows.length;
}

/** Evaluate a boolean SECURITY DEFINER helper as `viewer`. */
async function callBool(viewer: string, fn: string, arg: string): Promise<boolean> {
  const rows = await db.asUser(viewer, (tx) => tx.query(`select ${fn}($1) as v`, [arg]));
  return (rows.rows[0] as { v: boolean }).v;
}

// --- candidate visibility ---------------------------------------------------

describe('venture_candidates visibility (§17)', () => {
  it('draft: hidden from a non-creator/non-member, visible to creator + Lab member + admin', async () => {
    const lead = await seedMember('cand_draft_lead');
    const labMember = await seedMember('cand_draft_member');
    const stranger = await seedMember('cand_draft_stranger');
    const admin = await seedAdmin('cand_draft_admin');
    const lab = await seedLab(lead, 'draft-lab');
    await seedMembership(lab, labMember);
    const cand = await seedCandidate(lab, lead, { status: 'draft', visibility: 'all_members' });

    expect(await countVisible(lead, 'venture_candidates', cand)).toBe(1); // creator
    expect(await countVisible(labMember, 'venture_candidates', cand)).toBe(1); // Lab member
    expect(await countVisible(admin, 'venture_candidates', cand)).toBe(1); // admin
    expect(await countVisible(stranger, 'venture_candidates', cand)).toBe(0); // outsider
  });

  it('reviewers_only submitted: hidden from ordinary members, visible to Lab members, creator, mod, admin', async () => {
    const lead = await seedMember('cand_ro_lead');
    const labMember = await seedMember('cand_ro_member');
    const ordinary = await seedMember('cand_ro_ordinary');
    const mod = await seedMod('cand_ro_mod');
    const admin = await seedAdmin('cand_ro_admin');
    const lab = await seedLab(lead, 'ro-lab');
    await seedMembership(lab, labMember);
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'reviewers_only',
    });

    expect(await countVisible(lead, 'venture_candidates', cand)).toBe(1); // creator
    expect(await countVisible(labMember, 'venture_candidates', cand)).toBe(1); // Lab member
    expect(await countVisible(mod, 'venture_candidates', cand)).toBe(1); // reviewer set
    expect(await countVisible(admin, 'venture_candidates', cand)).toBe(1); // admin
    expect(await countVisible(ordinary, 'venture_candidates', cand)).toBe(0); // ordinary member
  });

  it('all_members submitted: visible to any logged-in member; still hidden from anon', async () => {
    const lead = await seedMember('cand_am_lead');
    const community = await seedMember('cand_am_community');
    const lab = await seedLab(lead, 'am-lab');
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'all_members',
    });

    expect(await countVisible(community, 'venture_candidates', cand)).toBe(1);

    const anonSees = await db.withRole('anon', null, (tx) =>
      tx.query(`select id from venture_candidates where id = $1`, [cand]),
    );
    expect(anonSees.rows).toEqual([]);
  });

  it('all_members DRAFT: still hidden from the community (draft never opens)', async () => {
    const lead = await seedMember('cand_amd_lead');
    const community = await seedMember('cand_amd_community');
    const lab = await seedLab(lead, 'amd-lab');
    const cand = await seedCandidate(lab, lead, { status: 'draft', visibility: 'all_members' });

    expect(await countVisible(community, 'venture_candidates', cand)).toBe(0);
  });

  it('co_lab membership grants read on a reviewers_only draft', async () => {
    const lead = await seedMember('cand_colab_lead');
    const coLead = await seedMember('cand_colab_colead');
    const lab = await seedLab(lead, 'colab-lab-a');
    const coLab = await seedLab(coLead, 'colab-lab-b');
    const cand = await seedCandidate(lab, lead, {
      status: 'draft',
      visibility: 'reviewers_only',
      coLabId: coLab,
    });

    // The co-Lab lead is a member of co_lab_id -> reads it despite draft.
    expect(await countVisible(coLead, 'venture_candidates', cand)).toBe(1);
  });
});

// --- reviewer eligibility + recusal -----------------------------------------

describe('can_review_candidate: mod/admin minus recusal (§17)', () => {
  it('an unaffiliated mod can review; a mod who is a Lab member is recused', async () => {
    const lead = await seedMember('rev_lead');
    const outsideMod = await seedMod('rev_outside_mod');
    const insideMod = await seedMod('rev_inside_mod');
    const lab = await seedLab(lead, 'review-lab');
    await seedMembership(lab, insideMod); // the mod is also a Lab member
    const cand = await seedCandidate(lab, lead, { status: 'submitted' });

    expect(await callBool(outsideMod, 'can_review_candidate', cand)).toBe(true);
    expect(await callBool(insideMod, 'can_review_candidate', cand)).toBe(false); // recused
  });

  it('an ordinary member (no mod/admin) is never a reviewer', async () => {
    const lead = await seedMember('rev_ord_lead');
    const ordinary = await seedMember('rev_ord_member');
    const lab = await seedLab(lead, 'review-ord-lab');
    const cand = await seedCandidate(lab, lead, { status: 'submitted' });

    expect(await callBool(ordinary, 'can_review_candidate', cand)).toBe(false);
  });

  it('an admin who leads the Lab is recused (creator/lead is a Lab member)', async () => {
    const adminLead = await seedAdmin('rev_admin_lead');
    const lab = await seedLab(adminLead, 'review-admin-lab');
    const cand = await seedCandidate(lab, adminLead, { status: 'submitted' });

    // The admin CAN read it, but must NOT review it (recusal).
    expect(await callBool(adminLead, 'can_read_candidate', cand)).toBe(true);
    expect(await callBool(adminLead, 'can_review_candidate', cand)).toBe(false);
  });
});

// --- is_candidate_lab_member ------------------------------------------------

describe('is_candidate_lab_member', () => {
  it('true for a Lab member, false for a stranger', async () => {
    const lead = await seedMember('iclm_lead');
    const member = await seedMember('iclm_member');
    const stranger = await seedMember('iclm_stranger');
    const lab = await seedLab(lead, 'iclm-lab');
    await seedMembership(lab, member);
    const cand = await seedCandidate(lab, lead, { status: 'draft' });

    expect(await callBool(member, 'is_candidate_lab_member', cand)).toBe(true);
    expect(await callBool(lead, 'is_candidate_lab_member', cand)).toBe(true);
    expect(await callBool(stranger, 'is_candidate_lab_member', cand)).toBe(false);
  });
});

// --- candidate_reviews ------------------------------------------------------

describe('candidate_reviews visibility follows the candidate', () => {
  it('a review is visible wherever the candidate is readable, hidden otherwise', async () => {
    const lead = await seedMember('crev_lead');
    const community = await seedMember('crev_community');
    const stranger = await seedMember('crev_stranger');
    const mod = await seedMod('crev_mod');
    const lab = await seedLab(lead, 'crev-lab');
    // reviewers_only -> the community member is NOT a reader.
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'reviewers_only',
    });
    const res = await db.admin.query(
      `insert into candidate_reviews (candidate_id, reviewer_user_id, team_score, notes)
       values ($1, $2, 4, 'solid') returning id`,
      [cand, mod],
    );
    const reviewId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(mod, 'candidate_reviews', reviewId)).toBe(1); // reviewer/reader
    expect(await countVisible(lead, 'candidate_reviews', reviewId)).toBe(1); // creator reads candidate
    expect(await countVisible(community, 'candidate_reviews', reviewId)).toBe(0); // not a reader
    expect(await countVisible(stranger, 'candidate_reviews', reviewId)).toBe(0);
  });
});

// --- candidate_votes (own-row-only + tally) ---------------------------------

describe('candidate_votes are own-row-only; tally via candidate_vote_tally()', () => {
  it('a voter sees only their own ballot, never another member’s', async () => {
    const lead = await seedMember('vote_lead');
    const voterA = await seedSupporter('vote_a');
    const voterB = await seedSupporter('vote_b');
    const lab = await seedLab(lead, 'vote-lab');
    const cand = await seedCandidate(lab, lead, { status: 'submitted' });
    const a = await db.admin.query(
      `insert into candidate_votes (candidate_id, voter_user_id, vote) values ($1, $2, 'approve') returning id`,
      [cand, voterA],
    );
    await db.admin.query(
      `insert into candidate_votes (candidate_id, voter_user_id, vote) values ($1, $2, 'reject')`,
      [cand, voterB],
    );
    const aVoteId = (a.rows[0] as { id: string }).id;

    expect(await countVisible(voterA, 'candidate_votes', aVoteId)).toBe(1); // own ballot
    expect(await countVisible(voterB, 'candidate_votes', aVoteId)).toBe(0); // not B's ballot

    // Aggregate tally is available (counts only, no identities).
    const tally = await db.asUser(voterA, (tx) =>
      tx.query(`select * from candidate_vote_tally($1)`, [cand]),
    );
    const row = tally.rows[0] as { approve: number; reject: number; total: number };
    expect(row.approve).toBe(1);
    expect(row.reject).toBe(1);
    expect(row.total).toBe(2);
  });
});

// --- interests (own-row-only + counts) --------------------------------------

describe('interests are own-row-only; counts via candidate_interest_counts()', () => {
  it('a member sees only their own interest; the aggregate counts add up', async () => {
    const lead = await seedMember('int_lead');
    const helper = await seedMember('int_helper');
    const cosigner = await seedMember('int_cosigner');
    const lab = await seedLab(lead, 'int-lab');
    const cand = await seedCandidate(lab, lead, { status: 'submitted' });
    const h = await db.admin.query(
      `insert into interests (candidate_id, user_id, type) values ($1, $2, 'help') returning id`,
      [cand, helper],
    );
    await db.admin.query(
      `insert into interests (candidate_id, user_id, type) values ($1, $2, 'cosign')`,
      [cand, cosigner],
    );
    const helpId = (h.rows[0] as { id: string }).id;

    expect(await countVisible(helper, 'interests', helpId)).toBe(1); // own
    expect(await countVisible(cosigner, 'interests', helpId)).toBe(0); // not theirs

    const counts = await db.asUser(helper, (tx) =>
      tx.query(`select * from candidate_interest_counts($1)`, [cand]),
    );
    const row = counts.rows[0] as { help: number; cosign: number; invest: number };
    expect(row.help).toBe(1);
    expect(row.cosign).toBe(1);
    expect(row.invest).toBe(0);
  });

  it('fund-level invest intent (candidate_id null) is unique per user', async () => {
    const investor = await seedSupporter('fund_investor');
    await db.admin.query(
      `insert into interests (candidate_id, user_id, type) values (null, $1, 'invest')`,
      [investor],
    );
    // The partial unique index blocks a second standing fund-level intent.
    await expect(
      db.admin.query(
        `insert into interests (candidate_id, user_id, type) values (null, $1, 'invest')`,
        [investor],
      ),
    ).rejects.toThrow(/duplicate key|interests_one_fund_invest_per_user/);
  });
});

// --- capital_gate_evaluations (own-row-only, append-only) --------------------

describe('capital_gate_evaluations: own-row-only compliance log', () => {
  it('a member reads only their own gate evaluations', async () => {
    const me = await seedMember('gate_me');
    const other = await seedMember('gate_other');
    const g = await db.admin.query(
      `insert into capital_gate_evaluations (user_id, profile_country, geo_ip_country, attested, granted, reason)
       values ($1, 'so', 'so', true, true, 'granted') returning id`,
      [me],
    );
    const gateId = (g.rows[0] as { id: string }).id;

    expect(await countVisible(me, 'capital_gate_evaluations', gateId)).toBe(1);
    expect(await countVisible(other, 'capital_gate_evaluations', gateId)).toBe(0);
  });
});

// --- write model: API-only (all five tables) --------------------------------

describe('Capital writes are API-only (client insert/update/delete revoked)', () => {
  it('authenticated cannot directly INSERT into any Capital table', async () => {
    const lead = await seedMember('write_lead');
    const supporter = await seedSupporter('write_supporter');
    const lab = await seedLab(lead, 'write-lab');
    const cand = await seedCandidate(lab, lead, { status: 'submitted' });

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(
          `insert into venture_candidates (lab_id, created_by_user_id, name) values ($1, $2, 'Rogue')`,
          [lab, lead],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(
          `insert into candidate_reviews (candidate_id, reviewer_user_id, team_score) values ($1, $2, 5)`,
          [cand, lead],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(supporter, (tx) =>
        tx.query(
          `insert into candidate_votes (candidate_id, voter_user_id, vote) values ($1, $2, 'approve')`,
          [cand, supporter],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(supporter, (tx) =>
        tx.query(`insert into interests (candidate_id, user_id, type) values ($1, $2, 'help')`, [
          cand,
          supporter,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(supporter, (tx) =>
        tx.query(
          `insert into capital_gate_evaluations (user_id, granted) values ($1, true)`,
          [supporter],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('the creator cannot UPDATE their own candidate directly (status/visibility etc.)', async () => {
    const lead = await seedMember('write_upd_lead');
    const lab = await seedLab(lead, 'write-upd-lab');
    const cand = await seedCandidate(lab, lead, { status: 'draft' });

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(`update venture_candidates set status = 'approved' where id = $1`, [cand]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- candidate-targeted comments (§12) --------------------------------------

describe('candidate comment readability follows can_read_candidate', () => {
  it('a published candidate comment is readable exactly when the candidate is', async () => {
    const lead = await seedMember('com_lead');
    const community = await seedMember('com_community');
    const stranger = await seedMember('com_stranger');
    const lab = await seedLab(lead, 'com-lab');
    // reviewers_only -> the community member cannot read the candidate.
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'reviewers_only',
    });
    const res = await db.admin.query(
      `insert into comments (candidate_id, author_user_id, body, status)
       values ($1, $2, 'Great idea', 'published') returning id`,
      [cand, lead],
    );
    const commentId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(lead, 'comments', commentId)).toBe(1); // creator reads candidate
    expect(await countVisible(community, 'comments', commentId)).toBe(0); // cannot read candidate
    expect(await countVisible(stranger, 'comments', commentId)).toBe(0);
  });

  it('an all_members submitted candidate’s comment is community-readable', async () => {
    const lead = await seedMember('com_am_lead');
    const community = await seedMember('com_am_community');
    const lab = await seedLab(lead, 'com-am-lab');
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'all_members',
    });
    const res = await db.admin.query(
      `insert into comments (candidate_id, author_user_id, body, status)
       values ($1, $2, 'Following this', 'published') returning id`,
      [cand, lead],
    );
    const commentId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(community, 'comments', commentId)).toBe(1);
  });
});

// --- page_blocks candidate extension ----------------------------------------

describe('page_blocks candidate owner_type follows can_read_candidate', () => {
  it('a candidate-owned block is readable when the candidate is + visibility admits', async () => {
    const lead = await seedMember('pb_lead');
    const community = await seedMember('pb_community');
    const lab = await seedLab(lead, 'pb-lab');
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'all_members',
    });
    // A 'members'-visibility block on a readable candidate.
    const res = await db.admin.query(
      `insert into page_blocks (owner_type, owner_id, block_type, position, visibility)
       values ('candidate', $1, 'text', 0, 'members') returning id`,
      [cand],
    );
    const blockId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(community, 'page_blocks', blockId)).toBe(1);

    // A 'private' block on the same candidate: creator reads it, community does not.
    const priv = await db.admin.query(
      `insert into page_blocks (owner_type, owner_id, block_type, position, visibility)
       values ('candidate', $1, 'text', 1, 'private') returning id`,
      [cand],
    );
    const privId = (priv.rows[0] as { id: string }).id;
    expect(await countVisible(lead, 'page_blocks', privId)).toBe(1); // creator
    expect(await countVisible(community, 'page_blocks', privId)).toBe(0);
  });

  it('a candidate-owned block on a reviewers_only candidate is hidden from the community', async () => {
    const lead = await seedMember('pb_ro_lead');
    const community = await seedMember('pb_ro_community');
    const lab = await seedLab(lead, 'pb-ro-lab');
    const cand = await seedCandidate(lab, lead, {
      status: 'submitted',
      visibility: 'reviewers_only',
    });
    const res = await db.admin.query(
      `insert into page_blocks (owner_type, owner_id, block_type, position, visibility)
       values ('candidate', $1, 'text', 0, 'members') returning id`,
      [cand],
    );
    const blockId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(community, 'page_blocks', blockId)).toBe(0);
    expect(await countVisible(lead, 'page_blocks', blockId)).toBe(1);
  });
});

// --- helper existence -------------------------------------------------------

describe('Phase 5 helper functions exist with the expected signatures', () => {
  it('all five helpers are present', async () => {
    const rows = await db.admin.query(
      `select proname from pg_proc
       where proname in (
         'can_read_candidate', 'is_candidate_lab_member', 'can_review_candidate',
         'candidate_vote_tally', 'candidate_interest_counts'
       )
       order by proname`,
    );
    expect(rows.rows.map((r) => (r as { proname: string }).proname)).toEqual([
      'can_read_candidate',
      'can_review_candidate',
      'candidate_interest_counts',
      'candidate_vote_tally',
      'is_candidate_lab_member',
    ]);
  });
});
