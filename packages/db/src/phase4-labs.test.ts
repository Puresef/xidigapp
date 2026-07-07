import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 4 (Labs / Spaces) RLS + sweep negative-test suite, covering migration
 * 20260706200000_phase4_labs.sql.
 *
 * Conventions (same as phase2-plaza.test.ts / phase3-fariimo.test.ts):
 *   * a policy that FILTERS rows            -> empty result set (toEqual([]));
 *   * a REVOKED table/column grant on write -> /permission denied/;
 * Content rows are seeded via db.admin, mirroring the API's service-role writer
 * (every lab_* write is API-only by design).
 *
 * Visibility model under test (§16):
 *   public  -> any active member reads via RLS; anon reads nothing (SSR only);
 *   members -> any active member reads (subject to is_supporter_only);
 *   private -> active Space members + lead only (mods retain reach).
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

/** A member upgraded to the Supporter tier. */
async function seedSupporter(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update profiles set membership_tier_id = 'supporter' where user_id = $1`, [
    userId,
  ]);
  return userId;
}

/** A member promoted to mod, as ops would do it. */
async function seedMod(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'mod' where id = $1`, [userId]);
  return userId;
}

/**
 * Seed a Space the way the API's service role would. Also inserts the lead's
 * own lab_members row (role='lead', status='active'), exactly as the create-Lab
 * endpoint will. Defaults: a listed, members-visible Club.
 */
async function seedLab(
  lead: string,
  opts: {
    slug?: string;
    visibility?: 'private' | 'members' | 'public';
    spaceMode?: 'club' | 'lab';
    memberListVisibility?: 'private' | 'members' | 'public';
    isSupporterOnly?: boolean;
    stage?: 'idea' | 'building' | 'validating' | 'launched';
  } = {},
): Promise<string> {
  const slug = opts.slug ?? `lab-${lead.slice(0, 8)}`;
  const res = await db.admin.query(
    `insert into labs
       (name, slug, lead_user_id, visibility, space_mode, member_list_visibility,
        is_supporter_only, stage)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      `Lab ${slug}`,
      slug,
      lead,
      opts.visibility ?? 'members',
      opts.spaceMode ?? 'club',
      opts.memberListVisibility ?? 'members',
      opts.isSupporterOnly ?? false,
      opts.stage ?? 'idea',
    ],
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
async function seedMembership(
  labId: string,
  userId: string,
  role: 'core' | 'member' | 'observer' = 'member',
): Promise<void> {
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, $3, 'active', now())`,
    [labId, userId, role],
  );
}

async function seedUpdate(
  labId: string,
  author: string,
  status: 'published' | 'hidden' | 'removed' = 'published',
): Promise<string> {
  const res = await db.admin.query(
    `insert into lab_updates (lab_id, author_user_id, body, status)
     values ($1, $2, $3, $4) returning id`,
    [labId, author, 'Weekly update', status],
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

// --- labs visibility --------------------------------------------------------

describe('labs visibility policies (§16)', () => {
  it('public: any active member reads it; anon reads nothing via RLS', async () => {
    const lead = await seedMember('vis_pub_lead');
    const stranger = await seedMember('vis_pub_stranger');
    const lab = await seedLab(lead, { slug: 'public-space', visibility: 'public' });

    expect(await countVisible(stranger, 'labs', lab)).toBe(1);

    // anon keeps the default SELECT grant but matches no (authenticated-only)
    // policy -> RLS default-deny -> empty set (public reads go through SSR).
    const anonSees = await db.withRole('anon', null, (tx) =>
      tx.query(`select id from labs where id = $1`, [lab]),
    );
    expect(anonSees.rows).toEqual([]);
  });

  it('private: only the lead + active members read it; a non-member reads zero', async () => {
    const lead = await seedMember('vis_priv_lead');
    const member = await seedMember('vis_priv_member');
    const stranger = await seedMember('vis_priv_stranger');
    const lab = await seedLab(lead, { slug: 'private-space', visibility: 'private' });
    await seedMembership(lab, member);

    expect(await countVisible(lead, 'labs', lab)).toBe(1);
    expect(await countVisible(member, 'labs', lab)).toBe(1);
    expect(await countVisible(stranger, 'labs', lab)).toBe(0);
  });

  it('members: any active member reads it', async () => {
    const lead = await seedMember('vis_mem_lead');
    const stranger = await seedMember('vis_mem_stranger');
    const lab = await seedLab(lead, { slug: 'members-space', visibility: 'members' });

    expect(await countVisible(stranger, 'labs', lab)).toBe(1);
  });

  it('members + supporter-only: a free non-member reads zero, a supporter reads it, a member always reads it', async () => {
    const lead = await seedMember('vis_sup_lead');
    const freeStranger = await seedMember('vis_sup_free');
    const supporter = await seedSupporter('vis_sup_paid');
    const freeMember = await seedMember('vis_sup_member');
    const lab = await seedLab(lead, {
      slug: 'supporter-space',
      visibility: 'members',
      isSupporterOnly: true,
    });
    await seedMembership(lab, freeMember);

    expect(await countVisible(freeStranger, 'labs', lab)).toBe(0);
    expect(await countVisible(supporter, 'labs', lab)).toBe(1);
    expect(await countVisible(freeMember, 'labs', lab)).toBe(1); // membership beats the tier gate
  });
});

// --- member roster (member_list_visibility) ---------------------------------

describe('member roster respects member_list_visibility', () => {
  it('private roster: a non-member who can read the Space still cannot read the roster', async () => {
    const lead = await seedMember('roster_priv_lead');
    const stranger = await seedMember('roster_priv_stranger');
    // Public Space (so the stranger CAN read the Space) but a private roster.
    const lab = await seedLab(lead, {
      slug: 'private-roster',
      visibility: 'public',
      memberListVisibility: 'private',
    });

    expect(await countVisible(stranger, 'labs', lab)).toBe(1); // Space is public
    const rosterRows = await db.asUser(stranger, (tx) =>
      tx.query(`select user_id from lab_members where lab_id = $1`, [lab]),
    );
    expect(rosterRows.rows).toEqual([]); // roster is private

    // The lead sees the roster.
    const leadRoster = await db.asUser(lead, (tx) =>
      tx.query(`select user_id from lab_members where lab_id = $1`, [lab]),
    );
    expect(leadRoster.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('members roster: a reader who is not a member can read the roster', async () => {
    const lead = await seedMember('roster_mem_lead');
    const stranger = await seedMember('roster_mem_stranger');
    const lab = await seedLab(lead, {
      slug: 'members-roster',
      visibility: 'public',
      memberListVisibility: 'members',
    });

    const rosterRows = await db.asUser(stranger, (tx) =>
      tx.query(`select user_id from lab_members where lab_id = $1`, [lab]),
    );
    expect(rosterRows.rows.length).toBeGreaterThanOrEqual(1);
  });
});

// --- child content inherits visibility + moderation -------------------------

describe('lab child content inherits Space visibility + moderation state', () => {
  it('updates: published visible to members; hidden hidden from other members but shown to author + mod; private Space leaks nothing to a stranger', async () => {
    const lead = await seedMember('upd_lead');
    const member = await seedMember('upd_member');
    const stranger = await seedMember('upd_stranger');
    const mod = await seedMod('upd_mod');
    const lab = await seedLab(lead, { slug: 'update-space', visibility: 'private' });
    await seedMembership(lab, member);

    const published = await seedUpdate(lab, lead, 'published');
    const hidden = await seedUpdate(lab, lead, 'hidden');

    // Member sees the published update, not the hidden one.
    expect(await countVisible(member, 'lab_updates', published)).toBe(1);
    expect(await countVisible(member, 'lab_updates', hidden)).toBe(0);

    // Author sees their own hidden update; a mod sees it too.
    expect(await countVisible(lead, 'lab_updates', hidden)).toBe(1);
    expect(await countVisible(mod, 'lab_updates', hidden)).toBe(1);

    // A non-member of a private Space sees neither.
    expect(await countVisible(stranger, 'lab_updates', published)).toBe(0);
    expect(await countVisible(stranger, 'lab_updates', hidden)).toBe(0);
  });

  it('history (lab_events) is visible to Space readers but not to a stranger of a private Space', async () => {
    const lead = await seedMember('hist_lead');
    const stranger = await seedMember('hist_stranger');
    const lab = await seedLab(lead, { slug: 'history-space', visibility: 'private' });
    const res = await db.admin.query(
      `insert into lab_events (lab_id, actor_user_id, event_type) values ($1, $2, 'created') returning id`,
      [lab, lead],
    );
    const eventId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(lead, 'lab_events', eventId)).toBe(1);
    expect(await countVisible(stranger, 'lab_events', eventId)).toBe(0);
  });
});

// --- lab-scoped posts (closes the Phase 2 gap) ------------------------------

describe('lab-scoped Plaza posts (closes the Phase 2 lab_id-null gap)', () => {
  it('a published Space-scoped post is visible to a Space member, not to a non-member', async () => {
    const lead = await seedMember('post_lead');
    const member = await seedMember('post_member');
    const stranger = await seedMember('post_stranger');
    const lab = await seedLab(lead, { slug: 'post-space', visibility: 'private' });
    await seedMembership(lab, member);

    const res = await db.admin.query(
      `insert into posts (author_user_id, type, body, status, lab_id)
       values ($1, 'update', 'Space post', 'published', $2) returning id`,
      [lead, lab],
    );
    const postId = (res.rows[0] as { id: string }).id;

    expect(await countVisible(member, 'posts', postId)).toBe(1);
    expect(await countVisible(stranger, 'posts', postId)).toBe(0);
    // The activity trigger fired: last_activity_at bumped, dormant_since clear.
    const activity = await db.admin.query(
      `select dormant_since from labs where id = $1`,
      [lab],
    );
    expect((activity.rows[0] as { dormant_since: unknown }).dormant_since).toBeNull();
  });
});

// --- write model: API-only --------------------------------------------------

describe('lab writes are API-only (client insert/update/delete revoked)', () => {
  it('the lead cannot directly INSERT a lab or UPDATE its visibility', async () => {
    const lead = await seedMember('write_lead');
    const lab = await seedLab(lead, { slug: 'write-space' });

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(`insert into labs (name, slug, lead_user_id) values ('Rogue', 'rogue', $1)`, [
          lead,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(lead, (tx) =>
        tx.query(`update labs set visibility = 'public' where id = $1`, [lab]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot directly INSERT a lab_update or lab_event', async () => {
    const lead = await seedMember('write_upd_lead');
    const member = await seedMember('write_upd_member');
    const lab = await seedLab(lead, { slug: 'write-upd-space' });
    await seedMembership(lab, member);

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into lab_updates (lab_id, author_user_id, body) values ($1, $2, 'x')`, [
          lab,
          member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into lab_events (lab_id, event_type) values ($1, 'forged')`, [lab]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- dormancy sweep: encouragement only, NEVER demotes ----------------------

describe('mark_dormant_labs(): 28-day sweep never demotes', () => {
  it('marks a stale Space dormant + logs an event, leaving mode/stage/visibility untouched', async () => {
    const lead = await seedMember('dormant_lead');
    const lab = await seedLab(lead, {
      slug: 'dormant-space',
      spaceMode: 'lab',
      stage: 'building',
      visibility: 'members',
    });
    // Backdate activity beyond the 28-day threshold.
    await db.admin.query(
      `update labs set last_activity_at = now() - interval '30 days' where id = $1`,
      [lab],
    );

    const swept = await db.withRole('service_role', null, (tx) =>
      tx.query(`select * from mark_dormant_labs() as t(id)`),
    );
    expect(swept.rows.map((r) => (r as { id: string }).id)).toContain(lab);

    const after = await db.admin.query(
      `select space_mode, stage, visibility, dormant_since from labs where id = $1`,
      [lab],
    );
    const row = after.rows[0] as {
      space_mode: string;
      stage: string;
      visibility: string;
      dormant_since: unknown;
    };
    // No demotion: identity is preserved exactly.
    expect(row.space_mode).toBe('lab');
    expect(row.stage).toBe('building');
    expect(row.visibility).toBe('members');
    expect(row.dormant_since).not.toBeNull();

    // A 'marked_dormant' history event was written.
    const events = await db.admin.query(
      `select 1 from lab_events where lab_id = $1 and event_type = 'marked_dormant'`,
      [lab],
    );
    expect(events.rows.length).toBe(1);
  });

  it('leaves a recently-active Space untouched', async () => {
    const lead = await seedMember('fresh_lead');
    const lab = await seedLab(lead, { slug: 'fresh-space' });
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select * from mark_dormant_labs() as t(id)`),
    );
    const after = await db.admin.query(`select dormant_since from labs where id = $1`, [lab]);
    expect((after.rows[0] as { dormant_since: unknown }).dormant_since).toBeNull();
  });
});

// --- skills-gap sweep -------------------------------------------------------

describe('flag_skill_gaps(): 7-day sweep is a one-shot flag', () => {
  it('flags a skill open + un-alerted for 7+ days, and leaves a fresh one alone', async () => {
    const lead = await seedMember('gap_lead');
    const lab = await seedLab(lead, { slug: 'gap-space' });
    const stale = await db.admin.query(
      `insert into lab_skill_needs (lab_id, skill, created_at)
       values ($1, 'react', now() - interval '8 days') returning id`,
      [lab],
    );
    const staleId = (stale.rows[0] as { id: string }).id;
    const fresh = await db.admin.query(
      `insert into lab_skill_needs (lab_id, skill, created_at)
       values ($1, 'figma', now() - interval '1 day') returning id`,
      [lab],
    );
    const freshId = (fresh.rows[0] as { id: string }).id;

    const flagged = await db.withRole('service_role', null, (tx) =>
      tx.query(`select lab_id, skill from flag_skill_gaps()`),
    );
    expect(flagged.rows).toContainEqual({ lab_id: lab, skill: 'react' });

    const staleRow = await db.admin.query(`select alerted_at from lab_skill_needs where id = $1`, [
      staleId,
    ]);
    expect((staleRow.rows[0] as { alerted_at: unknown }).alerted_at).not.toBeNull();
    const freshRow = await db.admin.query(`select alerted_at from lab_skill_needs where id = $1`, [
      freshId,
    ]);
    expect((freshRow.rows[0] as { alerted_at: unknown }).alerted_at).toBeNull();
  });
});
