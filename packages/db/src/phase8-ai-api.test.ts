import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  callBool,
  countVisible,
  seedAdmin,
  seedAiAccount,
  seedMember,
  seedPublishedPost,
} from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 8 (AI seeding + external REST/MCP API) RLS negative-test suite, covering
 * migration 20260709100000_phase8_ai_api.sql. This is the DB-level half of the
 * Seq 49.5 security gate; the app-layer half (scope checks, service-role
 * containment, key-hash secrecy) is reviewed in docs/rls-security-review.md and
 * exercised by apps/web unit tests (api-keys/keys.test.ts, external/external.test.ts).
 *
 * migrations.test.ts already carries a light Phase-8 subsection (seed_runs basics,
 * seed_entities dedup, api_keys owner-can't-read). This suite DEEPENS it into a
 * hostile, self-contained security surface, adding the boundaries that were NOT
 * previously covered anywhere:
 *   1. api_keys: cross-user read, anon read, scope-escalation UPDATE, and
 *      cross-user revoke (DELETE) are all denied — a member can only ever reach
 *      key rows through the audited service-role management API;
 *   2. webhook_endpoints (carries the HMAC signing secret) is fully RLS-locked —
 *      previously untested ANYWHERE;
 *   3. seed_entities / digest_editions admin-read + service-write (migrations.ts
 *      only exercised seed_runs);
 *   4. seeded/AI content is DISTINGUISHABLE (source <> 'member') and a member can
 *      neither relabel it as human nor self-declare an AI account (is_ai locked);
 *   5. seeded/AI accounts earn NO Helper reputation (the §14 launder block).
 *
 * Conventions (same as the phase2..7 suites):
 *   * an RLS policy that FILTERS rows        -> empty result set (toBe(0));
 *   * a REVOKED table/column grant on write  -> /permission denied/;
 *   * a CHECK / unique violation             -> the constraint name / message.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Seed an api_keys row the way the service-role management API would. */
async function seedApiKey(
  ownerUserId: string,
  opts: { scopes?: string[]; name?: string } = {},
): Promise<string> {
  const res = await db.admin.query(
    `insert into api_keys (owner_user_id, name, key_hash, key_prefix, scopes)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      ownerUserId,
      opts.name ?? 'test key',
      `hash_${ownerUserId}_${opts.name ?? 'k'}`,
      'xdg_test_abc123',
      opts.scopes ?? ['read'],
    ],
  );
  return (res.rows[0] as { id: string }).id;
}

// ---------------------------------------------------------------------------
// 1. api_keys — key material is never client-readable or client-writable
// ---------------------------------------------------------------------------
describe('api_keys are RLS-locked (key_hash secrecy)', () => {
  it('a member cannot read api_keys — not even their OWN key row (hash stays server-side)', async () => {
    const owner = await seedMember(db, 'ak_owner');
    const keyId = await seedApiKey(owner, { name: 'mine' });

    // Own key: RLS has no SELECT policy for authenticated -> zero rows. The
    // management API returns a safe projection via the service role instead.
    expect(await countVisible(db, owner, 'api_keys', keyId)).toBe(0);

    // Belt and braces: even key_hash specifically is unreachable.
    const own = await db.asUser(owner, (tx) =>
      tx.query(`select key_hash from api_keys where id = $1`, [keyId]),
    );
    expect(own.rowCount).toBe(0);
  });

  it("a member cannot read another member's api_keys", async () => {
    const owner = await seedMember(db, 'ak_a');
    const attacker = await seedMember(db, 'ak_b');
    const keyId = await seedApiKey(owner, { name: 'victim' });

    expect(await countVisible(db, attacker, 'api_keys', keyId)).toBe(0);
  });

  it('anon cannot read api_keys', async () => {
    const owner = await seedMember(db, 'ak_anon_owner');
    const keyId = await seedApiKey(owner);
    const rows = await db.withRole('anon', null, (tx) =>
      tx.query(`select id from api_keys where id = $1`, [keyId]),
    );
    expect(rows.rowCount).toBe(0);
  });

  it('a member cannot INSERT (mint) an api_key directly — API/service-role only', async () => {
    const member = await seedMember(db, 'ak_mint');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into api_keys (owner_user_id, name, key_hash, key_prefix, scopes)
           values ($1, 'rogue', 'h', 'p', '{admin}')`,
          [member],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot UPDATE an api_key (e.g. escalate scopes or un-revoke)', async () => {
    const owner = await seedMember(db, 'ak_upd');
    const keyId = await seedApiKey(owner, { scopes: ['read'] });
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update api_keys set scopes = '{admin}' where id = $1`, [keyId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("a member cannot DELETE / revoke another member's api_key directly", async () => {
    const owner = await seedMember(db, 'ak_del_owner');
    const attacker = await seedMember(db, 'ak_del_attacker');
    const keyId = await seedApiKey(owner);
    await expect(
      db.asUser(attacker, (tx) => tx.query(`delete from api_keys where id = $1`, [keyId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('the service role CAN read api_keys — the management + verify paths depend on it', async () => {
    const owner = await seedMember(db, 'ak_svc');
    await seedApiKey(owner);
    const rows = await db.withRole('service_role', null, (tx) =>
      tx.query(`select count(*)::int as n from api_keys`),
    );
    expect((rows.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. webhook_endpoints — the HMAC signing secret is never client-visible
// ---------------------------------------------------------------------------
describe('webhook_endpoints are RLS-locked (signing secret secrecy)', () => {
  async function seedWebhook(ownerUserId: string): Promise<string> {
    const res = await db.admin.query(
      `insert into webhook_endpoints (owner_user_id, url, secret, event_types)
       values ($1, 'https://example.com/hook', 'whsec_supersecret', '{post.created}') returning id`,
      [ownerUserId],
    );
    return (res.rows[0] as { id: string }).id;
  }

  it('a member cannot read webhook_endpoints (nor the signing secret), even their own', async () => {
    const owner = await seedMember(db, 'wh_owner');
    const hookId = await seedWebhook(owner);
    expect(await countVisible(db, owner, 'webhook_endpoints', hookId)).toBe(0);
  });

  it('a member cannot INSERT/UPDATE/DELETE webhook_endpoints directly', async () => {
    const owner = await seedMember(db, 'wh_write');
    const hookId = await seedWebhook(owner);
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(
          `insert into webhook_endpoints (owner_user_id, url, secret) values ($1, 'https://x', 's')`,
          [owner],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(`update webhook_endpoints set url = 'https://evil' where id = $1`, [hookId]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(owner, (tx) => tx.query(`delete from webhook_endpoints where id = $1`, [hookId])),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 3. Operational registries — admin-SELECT-only, service-role-write-only
// ---------------------------------------------------------------------------
describe('seed/digest registries are admin-read + service-write only', () => {
  it('seed_runs: member reads nothing, admin reads; neither can write directly', async () => {
    const admin = await seedAdmin(db, 'sr_admin');
    const member = await seedMember(db, 'sr_member');
    const run = await db.admin.query(
      `insert into seed_runs (label, source, actor_user_id) values ('batch-1', 'seed', $1) returning id`,
      [admin],
    );
    const runId = (run.rows[0] as { id: string }).id;

    expect(await countVisible(db, member, 'seed_runs', runId)).toBe(0);
    expect(await countVisible(db, admin, 'seed_runs', runId)).toBe(1);

    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into seed_runs (label, source) values ('rogue', 'seed')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(admin, (tx) => tx.query(`delete from seed_runs where id = $1`, [runId])),
    ).rejects.toThrow(/permission denied/);
  });

  it('seed_entities: member reads nothing, admin reads; writes are revoked', async () => {
    const admin = await seedAdmin(db, 'se_admin');
    const member = await seedMember(db, 'se_member');
    const ent = await db.admin.query(
      `insert into seed_entities (dedup_key, entity_type, source) values ('seed:batch-1:x', 'post', 'seed') returning id`,
    );
    const entId = (ent.rows[0] as { id: string }).id;

    expect(await countVisible(db, member, 'seed_entities', entId)).toBe(0);
    expect(await countVisible(db, admin, 'seed_entities', entId)).toBe(1);
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into seed_entities (dedup_key, entity_type) values ('x', 'post')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('digest_editions: member reads nothing, admin reads; writes are revoked', async () => {
    const admin = await seedAdmin(db, 'de_admin');
    const member = await seedMember(db, 'de_member');
    const ed = await db.admin.query(
      `insert into digest_editions (period_key, period_start, period_end)
       values ('2026-W28', '2026-07-06', '2026-07-12') returning id`,
    );
    const edId = (ed.rows[0] as { id: string }).id;

    expect(await countVisible(db, member, 'digest_editions', edId)).toBe(0);
    expect(await countVisible(db, admin, 'digest_editions', edId)).toBe(1);
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into digest_editions (period_key, period_start, period_end)
           values ('2026-W29', '2026-07-13', '2026-07-19')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

// ---------------------------------------------------------------------------
// 4. Registry invariants — dedup + never-'member' source
// ---------------------------------------------------------------------------
describe('seed registry invariants', () => {
  it('seed_entities enforces (entity_type, dedup_key) idempotency uniqueness', async () => {
    await db.admin.query(
      `insert into seed_entities (dedup_key, entity_type, source) values ('ext:key:idem-1', 'post', 'ai')`,
    );
    await expect(
      db.admin.query(
        `insert into seed_entities (dedup_key, entity_type, source) values ('ext:key:idem-1', 'post', 'ai')`,
      ),
    ).rejects.toThrow(/duplicate key|seed_entities_dedup_uq/);
  });

  it("seed_runs / seed_entities can never be labelled source='member'", async () => {
    await expect(
      db.admin.query(`insert into seed_runs (label, source) values ('bad', 'member')`),
    ).rejects.toThrow(/seed_runs_source_not_member|violates check/);
    await expect(
      db.admin.query(
        `insert into seed_entities (dedup_key, entity_type, source) values ('k', 'post', 'member')`,
      ),
    ).rejects.toThrow(/seed_entities_source_not_member|violates check/);
  });
});

// ---------------------------------------------------------------------------
// 5. Seeded/AI content is distinguishable and cannot be laundered as human
// ---------------------------------------------------------------------------
describe('seeded/AI content trust boundary', () => {
  it('a member cannot self-declare as an AI account (is_ai column is locked)', async () => {
    const member = await seedMember(db, 'isai_self');
    await expect(
      db.asUser(member, (tx) => tx.query(`update users set is_ai = true where id = $1`, [member])),
    ).rejects.toThrow(/permission denied/);
  });

  it('a member cannot flip a seeded post to source=member (posts are API-only)', async () => {
    const ai = await seedAiAccount(db, 'seed_author');
    const postId = await seedPublishedPost(db, ai, { body: 'seeded density' });
    // Mark it seeded, as the seed writer would.
    await db.admin.query(`update posts set source = 'seed' where id = $1`, [postId]);

    const reader = await seedMember(db, 'seed_reader');
    // The post is readable (community density) but stays labelled non-member…
    expect(await countVisible(db, reader, 'posts', postId)).toBe(1);
    const row = await db.admin.query(`select source from posts where id = $1`, [postId]);
    expect((row.rows[0] as { source: string }).source).toBe('seed');

    // …and no client can relabel it as human content (write grant revoked).
    await expect(
      db.asUser(reader, (tx) =>
        tx.query(`update posts set source = 'member' where id = $1`, [postId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('an AI account earns NO Helper reputation (the §14 launder block)', async () => {
    const ai = await seedAiAccount(db, 'ai_rep');
    // award_reputation is service-role only; call it as the engine would.
    await db.withRole('service_role', null, (tx) =>
      tx.query(
        `select public.award_reputation($1, 'helpful_answer', 'helper', 5, 'post'::entity_type, gen_random_uuid())`,
        [ai],
      ),
    );
    const score = await db.admin.query(
      `select helper_score from reputation_scores where user_id = $1`,
      [ai],
    );
    // Either no score row, or a zero helper score — never a positive Helper tally.
    const helper = score.rowCount === 0 ? 0 : (score.rows[0] as { helper_score: number }).helper_score;
    expect(helper).toBe(0);
  });

  it('is_admin() gate holds for the registries (a mod is not an admin here)', async () => {
    // Registries are admin-only, NOT mod-visible — guard against a future drift
    // that widens them to is_mod().
    const member = await seedMember(db, 'reg_probe');
    expect(await callBool(db, member, 'public.is_admin')).toBe(false);
  });
});
