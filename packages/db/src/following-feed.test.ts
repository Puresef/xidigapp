import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Following-feed RLS + privacy suite, covering migrations
 * 20260708000000_following_feed.sql and 20260708010000_lab_playbook_seed.sql.
 *
 * The unified `following_feed` view is SECURITY INVOKER, so it is read under the
 * CALLER's RLS. These tests prove the four things the feed must never get wrong:
 *   1. it SURFACES what the caller follows (posts / lab updates / listings);
 *   2. it NEVER LEAKS a private lab's update to a non-member follower (RLS);
 *   3. it EXCLUDES muted + blocked sources (private-feed preferences);
 *   4. keyset pagination on (sort_ts DESC, item_id DESC) has no gap/dup.
 * Plus: the 6 lab playbooks are seeded.
 *
 * Convention (same as phase4-labs.test.ts): content rows are seeded via
 * db.admin, mirroring the API's service-role writer (posts/lab_updates/listings
 * writes + mutes/blocks are all API-only). Follows are member-writable, but we
 * seed them via db.admin too for brevity; the read under test always runs as a
 * real authenticated user via db.asUser.
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

async function follow(
  follower: string,
  targetType: 'user' | 'lab',
  targetId: string,
): Promise<void> {
  await db.admin.query(
    `insert into follows (follower_user_id, target_type, target_id) values ($1, $2, $3)
     on conflict do nothing`,
    [follower, targetType, targetId],
  );
}

async function seedPost(
  author: string,
  opts: { body?: string; createdAt?: string } = {},
): Promise<string> {
  const res = await db.admin.query(
    `insert into posts (author_user_id, type, body, status, created_at)
     values ($1, 'update', $2, 'published', coalesce($3::timestamptz, now())) returning id`,
    [author, opts.body ?? 'Following-feed post', opts.createdAt ?? null],
  );
  return (res.rows[0] as { id: string }).id;
}

/** Seed a lab (+ lead membership) the way the create-Lab endpoint would. */
async function seedLab(
  lead: string,
  opts: { slug?: string; visibility?: 'private' | 'members' | 'public' } = {},
): Promise<string> {
  const slug = opts.slug ?? `feedlab-${lead.slice(0, 8)}`;
  const res = await db.admin.query(
    `insert into labs (name, slug, lead_user_id, visibility) values ($1, $2, $3, $4) returning id`,
    [`Lab ${slug}`, slug, lead, opts.visibility ?? 'members'],
  );
  const labId = (res.rows[0] as { id: string }).id;
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'lead', 'active', now())`,
    [labId, lead],
  );
  return labId;
}

async function seedMembership(labId: string, userId: string): Promise<void> {
  await db.admin.query(
    `insert into lab_members (lab_id, user_id, role, status, joined_at)
     values ($1, $2, 'member', 'active', now())`,
    [labId, userId],
  );
}

async function seedLabUpdate(labId: string, author: string): Promise<string> {
  const res = await db.admin.query(
    `insert into lab_updates (lab_id, author_user_id, body, status)
     values ($1, $2, 'Weekly update', 'published') returning id`,
    [labId, author],
  );
  return (res.rows[0] as { id: string }).id;
}

async function seedListing(owner: string): Promise<string> {
  const cat = await db.admin.query(`select id from listing_categories limit 1`);
  const categoryId = (cat.rows[0] as { id: string }).id;
  const res = await db.admin.query(
    `insert into business_listings (owner_user_id, business_name, category_id, status)
     values ($1, 'Followed Biz', $2, 'published') returning id`,
    [owner, categoryId],
  );
  return (res.rows[0] as { id: string }).id;
}

async function mute(
  user: string,
  entityType: 'user' | 'tag' | 'lab',
  entityId: string,
): Promise<void> {
  await db.admin.query(
    `insert into mutes (user_id, entity_type, entity_id) values ($1, $2, $3)
     on conflict do nothing`,
    [user, entityType, entityId],
  );
}

async function block(blocker: string, blocked: string): Promise<void> {
  await db.admin.query(
    `insert into user_blocks (blocker_user_id, blocked_user_id) values ($1, $2)
     on conflict do nothing`,
    [blocker, blocked],
  );
}

/** Rows of `following_feed` the viewer sees, for a specific item id. */
async function feedContains(
  viewer: string,
  itemType: string,
  itemId: string,
): Promise<boolean> {
  const rows = await db.asUser(viewer, (tx) =>
    tx.query(
      `select 1 from following_feed where item_type = $1 and item_id = $2`,
      [itemType, itemId],
    ),
  );
  return rows.rows.length === 1;
}

// --- surfacing what the caller follows --------------------------------------

describe('following_feed surfaces followed sources', () => {
  it("a followed user's published post appears", async () => {
    const viewer = await seedMember('ff_post_viewer');
    const author = await seedMember('ff_post_author');
    await follow(viewer, 'user', author);
    const postId = await seedPost(author);

    expect(await feedContains(viewer, 'post', postId)).toBe(true);
    // A non-follower does not see it in their feed.
    const stranger = await seedMember('ff_post_stranger');
    expect(await feedContains(stranger, 'post', postId)).toBe(false);
  });

  it("a followed lab's published update appears", async () => {
    const viewer = await seedMember('ff_lu_viewer');
    const lead = await seedMember('ff_lu_lead');
    const lab = await seedLab(lead, { slug: 'ff-lu-lab', visibility: 'members' });
    await follow(viewer, 'lab', lab);
    const updateId = await seedLabUpdate(lab, lead);

    expect(await feedContains(viewer, 'lab_update', updateId)).toBe(true);
  });

  it("a member of a lab sees its update even without an explicit follow", async () => {
    const member = await seedMember('ff_lu_member');
    const lead = await seedMember('ff_lu_memlead');
    const lab = await seedLab(lead, { slug: 'ff-lu-memlab', visibility: 'private' });
    await seedMembership(lab, member);
    const updateId = await seedLabUpdate(lab, lead);

    expect(await feedContains(member, 'lab_update', updateId)).toBe(true);
  });

  it("a followed user's published listing appears", async () => {
    const viewer = await seedMember('ff_list_viewer');
    const owner = await seedMember('ff_list_owner');
    await follow(viewer, 'user', owner);
    const listingId = await seedListing(owner);

    expect(await feedContains(viewer, 'listing', listingId)).toBe(true);
  });
});

// --- privacy: RLS + exclusions ----------------------------------------------

describe('following_feed enforces privacy (RLS + mutes + blocks)', () => {
  it("a PRIVATE lab's update does NOT leak to a non-member follower", async () => {
    const viewer = await seedMember('ff_priv_viewer');
    const lead = await seedMember('ff_priv_lead');
    const lab = await seedLab(lead, { slug: 'ff-priv-lab', visibility: 'private' });
    // Viewer follows the lab but is NOT a member — RLS (can_read_lab) must
    // still hide a private lab's update from them.
    await follow(viewer, 'lab', lab);
    const updateId = await seedLabUpdate(lab, lead);

    expect(await feedContains(viewer, 'lab_update', updateId)).toBe(false);
    // Sanity: the lead (a member) does see it.
    expect(await feedContains(lead, 'lab_update', updateId)).toBe(true);
  });

  it("a muted user's post is excluded even though the caller follows them", async () => {
    const viewer = await seedMember('ff_mute_viewer');
    const author = await seedMember('ff_mute_author');
    await follow(viewer, 'user', author);
    const postId = await seedPost(author);
    expect(await feedContains(viewer, 'post', postId)).toBe(true);

    await mute(viewer, 'user', author);
    expect(await feedContains(viewer, 'post', postId)).toBe(false);
  });

  it("a blocked user's post is excluded even though the caller follows them", async () => {
    const viewer = await seedMember('ff_block_viewer');
    const author = await seedMember('ff_block_author');
    await follow(viewer, 'user', author);
    const postId = await seedPost(author);
    expect(await feedContains(viewer, 'post', postId)).toBe(true);

    await block(viewer, author);
    expect(await feedContains(viewer, 'post', postId)).toBe(false);
  });

  it('a post carrying a muted tag is excluded', async () => {
    const viewer = await seedMember('ff_tag_viewer');
    const author = await seedMember('ff_tag_author');
    await follow(viewer, 'user', author);
    const postId = await seedPost(author);
    const tag = await db.admin.query(`select id from tags limit 1`);
    const tagId = (tag.rows[0] as { id: string }).id;
    await db.admin.query(`insert into post_tags (post_id, tag_id) values ($1, $2)`, [postId, tagId]);
    expect(await feedContains(viewer, 'post', postId)).toBe(true);

    await mute(viewer, 'tag', tagId);
    expect(await feedContains(viewer, 'post', postId)).toBe(false);
  });

  it('a muted lab excludes its updates from the feed', async () => {
    const viewer = await seedMember('ff_labmute_viewer');
    const lead = await seedMember('ff_labmute_lead');
    const lab = await seedLab(lead, { slug: 'ff-labmute-lab', visibility: 'members' });
    await follow(viewer, 'lab', lab);
    const updateId = await seedLabUpdate(lab, lead);
    expect(await feedContains(viewer, 'lab_update', updateId)).toBe(true);

    await mute(viewer, 'lab', lab);
    expect(await feedContains(viewer, 'lab_update', updateId)).toBe(false);
  });
});

// --- keyset pagination boundary ---------------------------------------------

describe('following_feed keyset pagination has no gap/dup', () => {
  it('walks the full ordered set exactly once across a page boundary', async () => {
    const viewer = await seedMember('ff_keyset_viewer');
    const author = await seedMember('ff_keyset_author');
    await follow(viewer, 'user', author);

    // 5 posts at strictly increasing times so the ordering key is total.
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const createdAt = new Date(Date.UTC(2026, 6, 1, 0, 0, i)).toISOString();
      ids.push(await seedPost(author, { body: `k${i}`, createdAt }));
    }

    // Full ordered result (sort_ts DESC, item_id DESC), scoped to these ids.
    const full = await db.asUser(viewer, (tx) =>
      tx.query(
        `select item_id, sort_ts from following_feed
         where item_type = 'post' and item_id = any($1::uuid[])
         order by sort_ts desc, item_id desc`,
        [ids],
      ),
    );
    expect(full.rows.length).toBe(5);

    // Page 1: first 2 rows.
    const page1 = full.rows.slice(0, 2) as Array<{ item_id: string; sort_ts: string }>;
    const boundary = page1.at(-1);
    if (!boundary) throw new Error('expected a page-1 boundary row');

    // Page 2: everything strictly after the boundary keyset — the exact
    // predicate the API uses: (sort_ts, item_id) < (before_ts, before_id).
    const page2 = await db.asUser(viewer, (tx) =>
      tx.query(
        `select item_id, sort_ts from following_feed
         where item_type = 'post' and item_id = any($1::uuid[])
           and (sort_ts, item_id) < ($2::timestamptz, $3::uuid)
         order by sort_ts desc, item_id desc`,
        [ids, boundary.sort_ts, boundary.item_id],
      ),
    );

    const walked = [...page1.map((r) => r.item_id), ...page2.rows.map((r) => (r as { item_id: string }).item_id)];
    // No gap: every id appears. No dup: no id appears twice. Correct order.
    expect(walked).toEqual((full.rows as Array<{ item_id: string }>).map((r) => r.item_id));
    expect(new Set(walked).size).toBe(5);
  });
});

// --- playbook seed ----------------------------------------------------------

describe('lab_playbooks seed (§16)', () => {
  it('seeds exactly the 6 starter playbooks with charter templates', async () => {
    const res = await db.admin.query(
      `select slug, template from lab_playbooks where source = 'seed' order by slug`,
    );
    const slugs = res.rows.map((r) => (r as { slug: string }).slug);
    expect(slugs).toEqual([
      'community',
      'creative',
      'local-service',
      'research',
      'startup',
      'technical',
    ]);
    // Each template carries the three charter fields the picker pre-fills.
    for (const row of res.rows) {
      const template = (row as { template: Record<string, unknown> }).template;
      expect(template).toHaveProperty('problem_statement');
      expect(template).toHaveProperty('hypothesis');
      expect(template).toHaveProperty('success_definition');
    }
  });
});
