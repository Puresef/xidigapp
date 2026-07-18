import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countVisible, seedAdmin, seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Taxonomy follow-ups (migrations 20260718300000 / 400000 / 500000):
 *   1. skill_endorsements.skill is normalized (lowercase/trim) so case/space
 *      variants aggregate and the unique(endorser, endorsee, skill) de-dupes;
 *   2. tags.usage_count tracks post↔tag links (popularity signal for a picker);
 *   3. term_suggestions ("suggest → admin") is member-inserts-own-pending,
 *      admin-reads-all, and members can never self-approve.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// --- 1. endorsement normalization -------------------------------------------
describe('skill_endorsements normalization', () => {
  it('lowercases + trims the skill on insert', async () => {
    const a = await seedMember(db, 'end_a');
    const b = await seedMember(db, 'end_b');
    await db.asUser(a, (tx) =>
      tx.query(
        `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, '  React ')`,
        [a, b],
      ),
    );
    const r = await db.admin.query(
      `select skill from skill_endorsements where endorser_user_id = $1 and endorsee_user_id = $2`,
      [a, b],
    );
    expect((r.rows[0] as { skill: string }).skill).toBe('react');
  });

  it('case variants collide under the unique constraint (no fragmentation)', async () => {
    const a = await seedMember(db, 'end_dup_a');
    const b = await seedMember(db, 'end_dup_b');
    await db.asUser(a, (tx) =>
      tx.query(
        `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, 'Python')`,
        [a, b],
      ),
    );
    await expect(
      db.asUser(a, (tx) =>
        tx.query(
          `insert into skill_endorsements (endorser_user_id, endorsee_user_id, skill) values ($1, $2, 'python')`,
          [a, b],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

// --- 2. tag usage_count -----------------------------------------------------
describe('tags.usage_count', () => {
  it('increments on link, decrements on unlink', async () => {
    const author = await seedMember(db, 'tag_use_author');
    const post = await db.admin.query(
      `insert into posts (author_user_id, type, body) values ($1, 'update', 'x') returning id`,
      [author],
    );
    const postId = (post.rows[0] as { id: string }).id;
    const tag = await db.admin.query(
      `insert into tags (name, source) values ('usagetest', 'member') returning id`,
    );
    const tagId = (tag.rows[0] as { id: string }).id;

    const before = 0;
    await db.admin.query(`insert into post_tags (post_id, tag_id) values ($1, $2)`, [postId, tagId]);
    const afterLink = await db.admin.query(`select usage_count from tags where id = $1`, [tagId]);
    expect((afterLink.rows[0] as { usage_count: number }).usage_count).toBe(before + 1);

    await db.admin.query(`delete from post_tags where post_id = $1 and tag_id = $2`, [postId, tagId]);
    const afterUnlink = await db.admin.query(`select usage_count from tags where id = $1`, [tagId]);
    expect((afterUnlink.rows[0] as { usage_count: number }).usage_count).toBe(before);
  });
});

// --- 3. term_suggestions ("suggest → admin") --------------------------------
describe('term_suggestions', () => {
  it('a member files their own pending suggestion and reads it; others cannot; admin can', async () => {
    const a = await seedMember(db, 'ts_a');
    const b = await seedMember(db, 'ts_b');
    const admin = await seedAdmin(db, 'ts_admin');
    const res = await db.asUser(a, (tx) =>
      tx.query(
        `insert into term_suggestions (kind, term, note, suggested_by) values ('lane', 'fisheries', 'big in Puntland', $1) returning id`,
        [a],
      ),
    );
    const id = (res.rows[0] as { id: string }).id;

    expect(await countVisible(db, a, 'term_suggestions', id)).toBe(1); // own
    expect(await countVisible(db, b, 'term_suggestions', id)).toBe(0); // stranger
    expect(await countVisible(db, admin, 'term_suggestions', id)).toBe(1); // admin queue

    // Defaults to pending, unresolved.
    const row = await db.admin.query(`select status, resolved_by from term_suggestions where id = $1`, [id]);
    expect((row.rows[0] as { status: string }).status).toBe('pending');
    expect((row.rows[0] as { resolved_by: string | null }).resolved_by).toBeNull();
  });

  it('a member cannot self-approve (status column is not client-grantable)', async () => {
    const a = await seedMember(db, 'ts_selfapprove');
    await expect(
      db.asUser(a, (tx) =>
        tx.query(
          `insert into term_suggestions (kind, term, suggested_by, status) values ('lane', 'mining', $1, 'approved')`,
          [a],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot update a suggestion to approve it', async () => {
    const a = await seedMember(db, 'ts_upd');
    const res = await db.asUser(a, (tx) =>
      tx.query(
        `insert into term_suggestions (kind, term, suggested_by) values ('lane', 'water', $1) returning id`,
        [a],
      ),
    );
    const id = (res.rows[0] as { id: string }).id;
    await expect(
      db.asUser(a, (tx) =>
        tx.query(`update term_suggestions set status = 'approved' where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('de-dupes the open queue: two pending suggestions for the same kind+term collide', async () => {
    const a = await seedMember(db, 'ts_dupe_a');
    const b = await seedMember(db, 'ts_dupe_b');
    await db.asUser(a, (tx) =>
      tx.query(`insert into term_suggestions (kind, term, suggested_by) values ('lane', 'Textiles', $1)`, [a]),
    );
    // Same kind + case-insensitive term, still pending → unique index blocks it.
    await expect(
      db.asUser(b, (tx) =>
        tx.query(`insert into term_suggestions (kind, term, suggested_by) values ('lane', 'textiles', $1)`, [b]),
      ),
    ).rejects.toThrow(/duplicate key|term_suggestions_open_uq/);
  });
});
