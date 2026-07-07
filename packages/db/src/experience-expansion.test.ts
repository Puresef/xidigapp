import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 4.5 (experience expansion) RLS negative-test suite, covering migration
 * 20260706300000_experience_expansion.sql:
 *
 *   * strictly-private tables (bookmarks, mutes, post_drafts, user_settings,
 *     notification_prefs) — user A never reads user B's rows;
 *   * post_revisions — post author + mods read, everyone else (including the
 *     editor of a different post and plain members) blind;
 *   * public-surface tables (profile_open_to, profile_pins, listing_photos,
 *     listing_services) — readable where their owner surface is readable,
 *     listing children gated by the parent listing's moderation state;
 *   * page_blocks — profile/lab owner visibility × block visibility matrix,
 *     candidate blocks parked mod-only until Phase 5;
 *   * the API-only write model — authenticated INSERT is denied on EVERY new
 *     table (and UPDATE on own user_settings rows);
 *   * schema assertions — new columns on profiles/listings/labs/candidates/
 *     media_uploads, lookup seeds, trgm indexes.
 *
 * Conventions (same as phase2-plaza.test.ts / phase4-labs.test.ts): a policy
 * that FILTERS rows -> empty result set (toEqual([])); a REVOKED table/column
 * grant on write -> /permission denied/. Rows are seeded via db.admin,
 * mirroring the API's service-role writer (every new table is API-only).
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

/** Published listing owned by `owner` (service-role write, like the API). */
async function seedListing(
  owner: string,
  opts: { status?: 'published' | 'hidden' } = {},
): Promise<string> {
  const category = await db.admin.query(
    `select id from listing_categories order by position limit 1`,
  );
  const res = await db.admin.query(
    `insert into business_listings (owner_user_id, business_name, category_id, status)
     values ($1, 'Xawaash & Co', $2, $3) returning id`,
    [owner, category.rows[0].id, opts.status ?? 'published'],
  );
  return res.rows[0].id as string;
}

/** Space + the lead's own active lab_members row (as the create-Lab API does). */
async function seedLab(
  lead: string,
  opts: { slug: string; visibility?: 'private' | 'members' | 'public' },
): Promise<string> {
  const res = await db.admin.query(
    `insert into labs (name, slug, lead_user_id, visibility)
     values ($1, $2, $3, $4) returning id`,
    [`Lab ${opts.slug}`, opts.slug, lead, opts.visibility ?? 'members'],
  );
  const labId = res.rows[0].id as string;
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

/** Published global post (service-role write, like the posts API). */
async function seedPost(authorUserId: string): Promise<string> {
  const res = await db.admin.query(
    `insert into posts (author_user_id, type, body) values ($1, 'update', 'Seeded') returning id`,
    [authorUserId],
  );
  return res.rows[0].id as string;
}

// --- schema assertions --------------------------------------------------------

describe('experience-expansion schema', () => {
  it('adds the new media/profile/listing/space/candidate columns', async () => {
    const expected: Record<string, string[]> = {
      media_uploads: ['kind', 'alt_text', 'blurhash', 'thumb_path'],
      profiles: ['avatar_path', 'avatar_blurhash', 'cover_path', 'cover_blurhash'],
      business_listings: [
        'opening_hours',
        'price_range',
        'primary_photo_path',
        'primary_photo_blurhash',
        'primary_photo_alt',
        'photo_count',
      ],
      labs: ['icon_path', 'icon_blurhash', 'cover_path', 'cover_blurhash'],
      venture_candidates: ['logo_path', 'logo_blurhash', 'cover_path', 'cover_blurhash'],
    };

    for (const [table, columns] of Object.entries(expected)) {
      const res = await db.admin.query(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = $1 and column_name = any($2::text[])`,
        [table, columns],
      );
      expect(res.rows.map((r) => r.column_name).sort(), `missing columns on ${table}`).toEqual(
        [...columns].sort(),
      );
    }
  });

  it('seeds the media_kinds / open_to_kinds / block_types lookups', async () => {
    const kinds = await db.admin.query(`select id from media_kinds order by id`);
    expect(kinds.rows.map((r) => r.id).sort()).toEqual(
      [
        'post',
        'avatar',
        'cover',
        'listing_photo',
        'space_icon',
        'space_cover',
        'candidate_logo',
        'candidate_cover',
        'block',
      ].sort(),
    );

    const openTo = await db.admin.query(`select id from open_to_kinds order by sort_order`);
    expect(openTo.rows.map((r) => r.id)).toEqual([
      'cofounding',
      'hiring',
      'hire_me',
      'investing',
      'mentoring',
      'collaborating',
    ]);

    const blocks = await db.admin.query(`select id from block_types order by sort_order`);
    expect(blocks.rows.map((r) => r.id)).toEqual([
      'text',
      'image',
      'gallery',
      'embed',
      'links',
      'pinned_items',
    ]);
  });

  it('media_uploads.kind defaults to post and enforces the lookup FK', async () => {
    const owner = await seedMember('media_kind_owner');
    const res = await db.admin.query(
      `insert into media_uploads (owner_user_id, storage_path, bytes, scan_status)
       values ($1, $2, 111, 'passed') returning kind`,
      [owner, `${owner}/kind-default.webp`],
    );
    expect(res.rows[0].kind).toBe('post');

    await expect(
      db.admin.query(
        `insert into media_uploads (owner_user_id, storage_path, bytes, scan_status, kind)
         values ($1, $2, 111, 'passed', 'nonexistent_kind')`,
        [owner, `${owner}/kind-bogus.webp`],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('creates the trigram search indexes on posts.title and labs.name', async () => {
    const res = await db.admin.query(
      `select indexname from pg_indexes
       where schemaname = 'public'
         and indexname in ('posts_title_trgm_idx', 'labs_name_trgm_idx')`,
    );
    expect(res.rows.map((r) => r.indexname).sort()).toEqual([
      'labs_name_trgm_idx',
      'posts_title_trgm_idx',
    ]);
  });

  it('profile avatar/cover columns are member-readable (column grant) but not writable', async () => {
    const owner = await seedMember('avatar_owner');
    const viewer = await seedMember('avatar_viewer');
    await db.admin.query(
      `update profiles set avatar_path = 'a/1.webp', avatar_blurhash = 'LEHV6nWB2yk8' where user_id = $1`,
      [owner],
    );

    const seen = await db.asUser(viewer, (tx) =>
      tx.query(`select avatar_path, cover_path from profiles where user_id = $1`, [owner]),
    );
    expect(seen.rows[0].avatar_path).toBe('a/1.webp');

    // The API attaches avatars after validating the media row — never the client.
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update profiles set avatar_path = 'forged.webp' where user_id = $1`, [owner]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- API-only write model -----------------------------------------------------

describe('API-only write model (no client writes on any new table)', () => {
  it('authenticated INSERT is denied on every new table', async () => {
    const user = await seedMember('insert_prober');

    // Privilege checks fire at plan time, so placeholder uuids are fine —
    // the denial must come from the missing grant, never from RLS/FKs.
    const attempts: Array<[string, string]> = [
      ['media_kinds', `insert into media_kinds (id) values ('rogue_kind')`],
      ['open_to_kinds', `insert into open_to_kinds (id, sort_order) values ('rogue', 9)`],
      ['block_types', `insert into block_types (id) values ('rogue_block')`],
      [
        'profile_open_to',
        `insert into profile_open_to (user_id, open_to_id) values ($1, 'hiring')`,
      ],
      [
        'profile_pins',
        `insert into profile_pins (user_id, entity_type, entity_id, position) values ($1, 'post', $1, 1)`,
      ],
      [
        'listing_photos',
        `insert into listing_photos (listing_id, storage_path, alt_text) values ($1, 'x.webp', 'x')`,
      ],
      ['listing_services', `insert into listing_services (listing_id, name) values ($1, 'Repair')`],
      ['user_settings', `insert into user_settings (user_id) values ($1)`],
      [
        'notification_prefs',
        `insert into notification_prefs (user_id, notification_type, channel, enabled) values ($1, 'reply', 'push', false)`,
      ],
      [
        'bookmarks',
        `insert into bookmarks (user_id, entity_type, entity_id) values ($1, 'post', $1)`,
      ],
      ['post_drafts', `insert into post_drafts (user_id, payload) values ($1, '{}'::jsonb)`],
      ['post_revisions', `insert into post_revisions (post_id, editor_user_id) values ($1, $1)`],
      ['mutes', `insert into mutes (user_id, entity_type, entity_id) values ($1, 'user', $1)`],
      [
        'page_blocks',
        `insert into page_blocks (owner_type, owner_id, block_type, position) values ('profile', $1, 'text', 1)`,
      ],
    ];

    for (const [table, sql] of attempts) {
      await expect(
        db.asUser(user, (tx) => tx.query(sql, sql.includes('$1') ? [user] : [])),
        `INSERT into ${table} must be denied`,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("user_settings UPDATE is denied even on the caller's own row", async () => {
    const user = await seedMember('settings_updater');
    await db.admin.query(`insert into user_settings (user_id) values ($1)`, [user]);

    await expect(
      db.asUser(user, (tx) =>
        tx.query(`update user_settings set dm_privacy = 'none' where user_id = $1`, [user]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// --- strictly-private tables ----------------------------------------------------

describe("private tables: A never reads B's rows", () => {
  it('bookmarks / mutes / post_drafts / user_settings / notification_prefs are own-rows only', async () => {
    const alice = await seedMember('private_alice');
    const bob = await seedMember('private_bob');
    const post = await seedPost(bob);

    await db.admin.query(
      `insert into bookmarks (user_id, entity_type, entity_id) values ($1, 'post', $2)`,
      [alice, post],
    );
    await db.admin.query(
      `insert into mutes (user_id, entity_type, entity_id) values ($1, 'user', $2)`,
      [alice, bob],
    );
    await db.admin.query(
      `insert into post_drafts (user_id, payload) values ($1, '{"type":"update","body":"wip"}')`,
      [alice],
    );
    await db.admin.query(`insert into user_settings (user_id, dm_privacy) values ($1, 'none')`, [
      alice,
    ]);
    await db.admin.query(
      `insert into notification_prefs (user_id, notification_type, channel, enabled)
       values ($1, 'reply', 'email', false)`,
      [alice],
    );

    for (const table of [
      'bookmarks',
      'mutes',
      'post_drafts',
      'user_settings',
      'notification_prefs',
    ]) {
      const own = await db.asUser(alice, (tx) => tx.query(`select * from ${table}`));
      expect(own.rows, `${table}: owner must see their row`).toHaveLength(1);

      const other = await db.asUser(bob, (tx) => tx.query(`select * from ${table}`));
      expect(other.rows, `${table}: another member must see nothing`).toEqual([]);
    }
  });
});

// --- post_revisions -------------------------------------------------------------

describe('post_revisions: author or mod only', () => {
  it('post author and mods read revisions; other members (incl. commenters) are blind', async () => {
    const author = await seedMember('rev_author');
    const stranger = await seedMember('rev_stranger');
    const mod = await seedMod('rev_mod');
    const post = await seedPost(author);

    await db.admin.query(
      `insert into post_revisions (post_id, editor_user_id, previous_body, had_replies)
       values ($1, $2, 'Original body', true)`,
      [post, author],
    );

    const authorSees = await db.asUser(author, (tx) =>
      tx.query(`select previous_body from post_revisions where post_id = $1`, [post]),
    );
    expect(authorSees.rows).toHaveLength(1);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from post_revisions where post_id = $1`, [post]),
    );
    expect(modSees.rows).toHaveLength(1);

    const strangerSees = await db.asUser(stranger, (tx) =>
      tx.query(`select id from post_revisions where post_id = $1`, [post]),
    );
    expect(strangerSees.rows).toEqual([]);
  });
});

// --- public profile surfaces -----------------------------------------------------

describe('profile_open_to / profile_pins: readable wherever the profile is', () => {
  it('open-to chips and pins are member-visible; pin cap is declarative (1..3, PK)', async () => {
    const owner = await seedMember('pins_owner');
    const viewer = await seedMember('pins_viewer');
    const post = await seedPost(owner);

    await db.admin.query(
      `insert into profile_open_to (user_id, open_to_id) values ($1, 'cofounding'), ($1, 'mentoring')`,
      [owner],
    );
    await db.admin.query(
      `insert into profile_pins (user_id, entity_type, entity_id, position) values ($1, 'post', $2, 1)`,
      [owner, post],
    );

    const chips = await db.asUser(viewer, (tx) =>
      tx.query(`select open_to_id from profile_open_to where user_id = $1 order by open_to_id`, [
        owner,
      ]),
    );
    expect(chips.rows.map((r) => r.open_to_id)).toEqual(['cofounding', 'mentoring']);

    const pins = await db.asUser(viewer, (tx) =>
      tx.query(`select entity_type, position from profile_pins where user_id = $1`, [owner]),
    );
    expect(pins.rows).toEqual([{ entity_type: 'post', position: 1 }]);

    // position 4 violates the CHECK — the 3-pin cap is enforced by the schema.
    await expect(
      db.admin.query(
        `insert into profile_pins (user_id, entity_type, entity_id, position) values ($1, 'lab', $2, 4)`,
        [owner, post],
      ),
    ).rejects.toThrow(/profile_pins_position_range/);

    // same position twice → PK.
    await expect(
      db.admin.query(
        `insert into profile_pins (user_id, entity_type, entity_id, position) values ($1, 'lab', $2, 1)`,
        [owner, post],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

// --- listing children --------------------------------------------------------------

describe('listing_photos / listing_services mirror listing visibility', () => {
  it('published listing children are member-visible; hidden ones owner/mod only', async () => {
    const owner = await seedMember('gallery_owner');
    const viewer = await seedMember('gallery_viewer');
    const mod = await seedMod('gallery_mod');

    const published = await seedListing(owner);
    const hidden = await seedListing(owner, { status: 'hidden' });

    for (const listing of [published, hidden]) {
      await db.admin.query(
        `insert into listing_photos (listing_id, storage_path, alt_text, blurhash)
         values ($1, $2, 'Storefront', 'LEHV6nWB2yk8')`,
        [listing, `${owner}/${listing}.webp`],
      );
      await db.admin.query(
        `insert into listing_services (listing_id, name, price_label) values ($1, 'Tailoring', 'from $10')`,
        [listing],
      );
    }

    for (const table of ['listing_photos', 'listing_services']) {
      const viewerPublished = await db.asUser(viewer, (tx) =>
        tx.query(`select id from ${table} where listing_id = $1`, [published]),
      );
      expect(viewerPublished.rows, `${table}: published visible`).toHaveLength(1);

      const viewerHidden = await db.asUser(viewer, (tx) =>
        tx.query(`select id from ${table} where listing_id = $1`, [hidden]),
      );
      expect(viewerHidden.rows, `${table}: hidden filtered`).toEqual([]);

      const ownerHidden = await db.asUser(owner, (tx) =>
        tx.query(`select id from ${table} where listing_id = $1`, [hidden]),
      );
      expect(ownerHidden.rows, `${table}: owner sees hidden`).toHaveLength(1);

      const modHidden = await db.asUser(mod, (tx) =>
        tx.query(`select id from ${table} where listing_id = $1`, [hidden]),
      );
      expect(modHidden.rows, `${table}: mod sees hidden`).toHaveLength(1);
    }
  });
});

// --- page_blocks ---------------------------------------------------------------------

describe('page_blocks visibility matrix', () => {
  async function seedBlock(
    ownerType: 'profile' | 'lab' | 'candidate',
    ownerId: string,
    visibility: 'public' | 'members' | 'private',
    position: number,
  ): Promise<string> {
    const res = await db.admin.query(
      `insert into page_blocks (owner_type, owner_id, block_type, position, visibility)
       values ($1, $2, 'text', $3, $4) returning id`,
      [ownerType, ownerId, position, visibility],
    );
    return res.rows[0].id as string;
  }

  it('profile blocks: public/members read by any member, private by owner and mod only', async () => {
    const owner = await seedMember('blocks_owner');
    const viewer = await seedMember('blocks_viewer');
    const mod = await seedMod('blocks_mod');

    const publicBlock = await seedBlock('profile', owner, 'public', 1);
    const privateBlock = await seedBlock('profile', owner, 'private', 2);

    const viewerSees = await db.asUser(viewer, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [owner]),
    );
    expect(viewerSees.rows.map((r) => r.id)).toEqual([publicBlock]);

    const ownerSees = await db.asUser(owner, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1 order by position`, [owner]),
    );
    expect(ownerSees.rows.map((r) => r.id)).toEqual([publicBlock, privateBlock]);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [owner]),
    );
    expect(modSees.rows).toHaveLength(2);
  });

  it('lab blocks: follow can_read_lab; private blocks are lead/mod only', async () => {
    const lead = await seedMember('blocklab_lead');
    const member = await seedMember('blocklab_member');
    const outsider = await seedMember('blocklab_outsider');

    // A members-visibility Space: any active platform member can read it.
    const openLab = await seedLab(lead, { slug: 'blocks-open-lab' });
    const openBlock = await seedBlock('lab', openLab, 'members', 1);
    const leadDraft = await seedBlock('lab', openLab, 'private', 2);

    const outsiderSeesOpen = await db.asUser(outsider, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1 order by position`, [openLab]),
    );
    expect(outsiderSeesOpen.rows.map((r) => r.id)).toEqual([openBlock]);

    const leadSees = await db.asUser(lead, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1 order by position`, [openLab]),
    );
    expect(leadSees.rows.map((r) => r.id)).toEqual([openBlock, leadDraft]);

    // A private Space: its blocks leak to nobody outside, members read them.
    const privateLab = await seedLab(lead, { slug: 'blocks-private-lab', visibility: 'private' });
    await seedMembership(privateLab, member);
    const privateLabBlock = await seedBlock('lab', privateLab, 'public', 1);

    const outsiderSeesPrivate = await db.asUser(outsider, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [privateLab]),
    );
    expect(outsiderSeesPrivate.rows).toEqual([]);

    const memberSeesPrivate = await db.asUser(member, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [privateLab]),
    );
    expect(memberSeesPrivate.rows.map((r) => r.id)).toEqual([privateLabBlock]);
  });

  it('candidate blocks stay mod-only until Phase 5 ships candidate RLS', async () => {
    const lead = await seedMember('blockcand_lead');
    const viewer = await seedMember('blockcand_viewer');
    const mod = await seedMod('blockcand_mod');
    const lab = await seedLab(lead, { slug: 'blocks-cand-lab', visibility: 'public' });
    const candidate = await db.admin.query(
      `insert into venture_candidates (lab_id, created_by_user_id, name)
       values ($1, $2, 'Xidig Logistics') returning id`,
      [lab, lead],
    );
    await seedBlock('candidate', candidate.rows[0].id as string, 'public', 1);

    const viewerSees = await db.asUser(viewer, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [candidate.rows[0].id]),
    );
    expect(viewerSees.rows).toEqual([]);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from page_blocks where owner_id = $1`, [candidate.rows[0].id]),
    );
    expect(modSees.rows).toHaveLength(1);
  });
});

// --- listing owner columns ------------------------------------------------------------

describe('listing hours/price stay owner-editable; photo denorms stay API-only', () => {
  it('owner PATCHes opening_hours/price_range under the column grant; primary photo denorms denied', async () => {
    const owner = await seedMember('hours_owner');
    const listing = await seedListing(owner);

    await db.asUser(owner, (tx) =>
      tx.query(
        `update business_listings
         set opening_hours = '{"mon":[{"open":"09:00","close":"17:00"}]}'::jsonb, price_range = 2
         where id = $1`,
        [listing],
      ),
    );
    const stored = await db.admin.query(
      `select price_range, opening_hours from business_listings where id = $1`,
      [listing],
    );
    expect(stored.rows[0].price_range).toBe(2);
    expect(stored.rows[0].opening_hours.mon).toHaveLength(1);

    // price_range outside 1..4 → CHECK.
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update business_listings set price_range = 5 where id = $1`, [listing]),
      ),
    ).rejects.toThrow(/listings_price_range/);

    // primary_photo_* / photo_count are denormalized by the photos API only.
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update business_listings set photo_count = 9 where id = $1`, [listing]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update business_listings set primary_photo_path = 'x.webp' where id = $1`, [
          listing,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
