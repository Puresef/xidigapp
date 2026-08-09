import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Codsi (Ask) lifecycle suite, covering migrations
 * 20260809*_codsi_lifecycle*.sql (P1 Codsi detail dispatch):
 *
 *   * ask_status grows in_progress + fulfilled; answered/closed survive as
 *     legacy values (backfill maps answered → fulfilled with a trace);
 *   * helper columns (asker-accepted helper, §14 helper credit) with the
 *     in_progress-requires-helper and never-your-own-helper CHECKs;
 *   * posts stay API-only for clients — the "asker-only transitions" rule is
 *     enforced by revoked client writes + the route's author check;
 *   * post_offers: offer = private DM (HANDOFF: no public count) — visible
 *     ONLY to the asker and the offerer, writes API-only;
 *   * post_cosigns (Garab): the one client-writable Codsi table — own-row
 *     writes allowed ONLY once the ask is fulfilled (Garab exists only
 *     post-fulfilled), reads own-row-only (counts aggregate via service role,
 *     hidden pre-interaction at the view layer).
 *
 * Conventions (same as phase2-plaza.test.ts): policy denial → /row-level
 * security/, missing grant → /permission denied/, locked table → zero rows.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

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

/** Seeds an ask the way the API's service role would. */
async function seedAsk(
  authorUserId: string,
  opts: {
    askStatus?: 'open' | 'in_progress' | 'fulfilled' | 'closed';
    helperUserId?: string;
    status?: 'published' | 'hidden';
  } = {},
): Promise<string> {
  const askStatus = opts.askStatus ?? 'open';
  const result = await db.admin.query(
    `insert into posts (author_user_id, type, body, status, ask_status, ask_helper_user_id, ask_helped_at, ask_fulfilled_at)
     values ($1, 'ask', 'Codsi seeded for the lifecycle suite', $2, $3, $4, $5, $6) returning id`,
    [
      authorUserId,
      opts.status ?? 'published',
      askStatus,
      opts.helperUserId ?? null,
      opts.helperUserId ? new Date() : null,
      askStatus === 'fulfilled' ? new Date() : null,
    ],
  );
  return result.rows[0].id as string;
}

describe('ask_status lifecycle values', () => {
  it('the enum carries the P1 lifecycle (open → in_progress → fulfilled) beside the legacy values', async () => {
    const result = await db.admin.query(
      `select enum_range(null::ask_status)::text[] as values`,
    );
    const values = result.rows[0].values as string[];
    expect(values).toContain('open');
    expect(values).toContain('in_progress');
    expect(values).toContain('fulfilled');
    // Legacy values stay (Postgres enums don't shrink); nothing writes them.
    expect(values).toContain('answered');
    expect(values).toContain('closed');
  });

  it('posts carries the helper columns and the legacy_ask_status trace', async () => {
    const result = await db.admin.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'posts'
         and column_name in ('ask_helper_user_id', 'ask_helped_at', 'ask_fulfilled_at', 'legacy_ask_status')`,
    );
    const names = result.rows.map((row) => row.column_name as string).sort();
    expect(names).toEqual([
      'ask_fulfilled_at',
      'ask_helped_at',
      'ask_helper_user_id',
      'legacy_ask_status',
    ]);
  });
});

describe('lifecycle CHECK constraints', () => {
  it('in_progress requires a named helper', async () => {
    const asker = await seedMember('codsi_check_asker');
    await expect(
      db.admin.query(
        `insert into posts (author_user_id, type, body, ask_status)
         values ($1, 'ask', 'no helper named', 'in_progress')`,
        [asker],
      ),
    ).rejects.toThrow(/posts_ask_in_progress_has_helper/);
  });

  it('the asker can never be their own helper', async () => {
    const asker = await seedMember('codsi_self_helper');
    await expect(seedAsk(asker, { askStatus: 'in_progress', helperUserId: asker })).rejects.toThrow(
      /posts_ask_helper_not_author/,
    );
  });

  it('helper columns are asks-only', async () => {
    const author = await seedMember('codsi_helper_on_win');
    const helper = await seedMember('codsi_helper_on_win_h');
    await expect(
      db.admin.query(
        `insert into posts (author_user_id, type, body, ask_helper_user_id)
         values ($1, 'win', 'not an ask', $2)`,
        [author, helper],
      ),
    ).rejects.toThrow(/posts_ask_helper_only_for_asks/,);
  });
});

describe('asker-only transitions (API-only writes)', () => {
  it('not even the asker can flip ask_status through the client role — transitions are API-territory', async () => {
    const asker = await seedMember('codsi_asker_direct');
    const post = await seedAsk(asker);
    await expect(
      db.asUser(asker, (tx) =>
        tx.query(`update posts set ask_status = 'fulfilled' where id = $1`, [post]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a non-asker cannot name themselves helper through the client role', async () => {
    const asker = await seedMember('codsi_asker_victim');
    const rando = await seedMember('codsi_rando');
    const post = await seedAsk(asker);
    await expect(
      db.asUser(rando, (tx) =>
        tx.query(
          `update posts set ask_status = 'in_progress', ask_helper_user_id = $2 where id = $1`,
          [post, rando],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('post_offers — offer = private DM, no public artifact', () => {
  it('the asker and the offerer each see the offer; a third member sees nothing', async () => {
    const asker = await seedMember('offer_asker');
    const offerer = await seedMember('offer_helper');
    const bystander = await seedMember('offer_bystander');
    const post = await seedAsk(asker);

    await db.admin.query(
      `insert into post_offers (post_id, helper_user_id) values ($1, $2)`,
      [post, offerer],
    );

    const askerSees = await db.asUser(asker, (tx) =>
      tx.query(`select id from post_offers where post_id = $1`, [post]),
    );
    expect(askerSees.rows).toHaveLength(1);

    const offererSees = await db.asUser(offerer, (tx) =>
      tx.query(`select id from post_offers where post_id = $1`, [post]),
    );
    expect(offererSees.rows).toHaveLength(1);

    const bystanderSees = await db.asUser(bystander, (tx) =>
      tx.query(`select id from post_offers where post_id = $1`, [post]),
    );
    expect(bystanderSees.rows).toEqual([]);
  });

  it('offers are API-only: no client insert, update, or delete', async () => {
    const asker = await seedMember('offer_lock_asker');
    const offerer = await seedMember('offer_lock_helper');
    const post = await seedAsk(asker);

    await expect(
      db.asUser(offerer, (tx) =>
        tx.query(`insert into post_offers (post_id, helper_user_id) values ($1, $2)`, [
          post,
          offerer,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);

    await db.admin.query(`insert into post_offers (post_id, helper_user_id) values ($1, $2)`, [
      post,
      offerer,
    ]);
    await expect(
      db.asUser(asker, (tx) =>
        tx.query(`update post_offers set accepted_at = now() where post_id = $1`, [post]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('one offer per member per ask', async () => {
    const asker = await seedMember('offer_dupe_asker');
    const offerer = await seedMember('offer_dupe_helper');
    const post = await seedAsk(asker);
    await db.admin.query(`insert into post_offers (post_id, helper_user_id) values ($1, $2)`, [
      post,
      offerer,
    ]);
    await expect(
      db.admin.query(`insert into post_offers (post_id, helper_user_id) values ($1, $2)`, [
        post,
        offerer,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe('post_cosigns — Garab exists only post-fulfilled', () => {
  it('a member garabs a fulfilled ask with their own row', async () => {
    const asker = await seedMember('garab_asker');
    const helper = await seedMember('garab_helper');
    const fan = await seedMember('garab_fan');
    const post = await seedAsk(asker, { askStatus: 'fulfilled', helperUserId: helper });

    await db.asUser(fan, (tx) =>
      tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [post, fan]),
    );
    const count = await db.admin.query(`select count(*)::int as n from post_cosigns where post_id = $1`, [post]);
    expect(count.rows[0].n).toBe(1);
  });

  it('garab on an open or in-progress ask is rejected by RLS', async () => {
    const asker = await seedMember('garab_early_asker');
    const helper = await seedMember('garab_early_helper');
    const fan = await seedMember('garab_early_fan');
    const openPost = await seedAsk(asker);
    const helping = await seedAsk(asker, { askStatus: 'in_progress', helperUserId: helper });

    await expect(
      db.asUser(fan, (tx) =>
        tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [openPost, fan]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.asUser(fan, (tx) =>
        tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [helping, fan]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('you can only garab as yourself, and only un-garab yourself', async () => {
    const asker = await seedMember('garab_self_asker');
    const helper = await seedMember('garab_self_helper');
    const fan = await seedMember('garab_self_fan');
    const other = await seedMember('garab_self_other');
    const post = await seedAsk(asker, { askStatus: 'fulfilled', helperUserId: helper });

    await expect(
      db.asUser(fan, (tx) =>
        tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [post, other]),
      ),
    ).rejects.toThrow(/row-level security/);

    await db.asUser(fan, (tx) =>
      tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [post, fan]),
    );
    // Someone else's delete silently touches zero rows (RLS scope).
    await db.asUser(other, (tx) =>
      tx.query(`delete from post_cosigns where post_id = $1 and user_id = $2`, [post, fan]),
    );
    const still = await db.admin.query(
      `select count(*)::int as n from post_cosigns where post_id = $1`,
      [post],
    );
    expect(still.rows[0].n).toBe(1);

    await db.asUser(fan, (tx) =>
      tx.query(`delete from post_cosigns where post_id = $1 and user_id = $2`, [post, fan]),
    );
    const gone = await db.admin.query(
      `select count(*)::int as n from post_cosigns where post_id = $1`,
      [post],
    );
    expect(gone.rows[0].n).toBe(0);
  });

  it('cosign reads are own-row-only — the count is a service-role aggregate, never an enumeration', async () => {
    const asker = await seedMember('garab_read_asker');
    const helper = await seedMember('garab_read_helper');
    const fanA = await seedMember('garab_read_a');
    const fanB = await seedMember('garab_read_b');
    const post = await seedAsk(asker, { askStatus: 'fulfilled', helperUserId: helper });

    await db.asUser(fanA, (tx) =>
      tx.query(`insert into post_cosigns (post_id, user_id) values ($1, $2)`, [post, fanA]),
    );

    const fanBSees = await db.asUser(fanB, (tx) =>
      tx.query(`select user_id from post_cosigns where post_id = $1`, [post]),
    );
    expect(fanBSees.rows).toEqual([]);

    const fanASees = await db.asUser(fanA, (tx) =>
      tx.query(`select user_id from post_cosigns where post_id = $1`, [post]),
    );
    expect(fanASees.rows).toHaveLength(1);
  });
});
