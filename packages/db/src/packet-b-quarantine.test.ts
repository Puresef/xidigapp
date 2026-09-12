import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';
import { seedCandidate, seedLab, seedMember } from './testing/factories';

/**
 * Packet B follow-up — migration 20260911001000_packet_b_quarantine.sql.
 *
 * 1. candidate_interest_counts(uuid) is server-only. It is SECURITY DEFINER
 *    with no visibility check, so while `authenticated` held EXECUTE any
 *    signed-in member could read help/cosign/invest counts for ANY candidate,
 *    drafts included. The app reads it with the service role and projects
 *    {help, cosign} only; members now get "permission denied". The body is
 *    untouched (grant-only change), and no interest row changes.
 *
 * 2. garab-milestone is retired and cannot be newly granted — not through
 *    award_badge() and not through a direct user_badges insert — unless a
 *    migration/test sets the explicit `xidig.allow_retired_badge` override.
 *    Existing rows, revocation and live badges are unaffected.
 */

const MIGRATION = fileURLToPath(
  new URL('../supabase/migrations/20260911001000_packet_b_quarantine.sql', import.meta.url),
);

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function seedInterests(cand: string): Promise<void> {
  for (const [handle, type] of [
    ['q_helper', 'help'],
    ['q_supporter', 'cosign'],
    ['q_legacy_investor', 'invest'],
  ] as const) {
    const user = await seedMember(db, `${handle}_${cand.slice(0, 6)}`);
    await db.admin.query(
      `insert into interests (candidate_id, user_id, type) values ($1, $2, $3)`,
      [cand, user, type],
    );
  }
}

async function garabBadgeId(): Promise<string> {
  const res = await db.admin.query(
    `select id from badge_definitions where slug = 'garab-milestone'`,
  );
  return (res.rows[0] as { id: string }).id;
}

describe('candidate_interest_counts is server-only', () => {
  it('only service_role holds EXECUTE — not authenticated, anon or public', async () => {
    const res = await db.admin.query(
      `select r.rolname, has_function_privilege(r.rolname, 'public.candidate_interest_counts(uuid)', 'execute') as ok
         from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') order by 1`,
    );
    expect(res.rows).toEqual([
      { rolname: 'anon', ok: false },
      { rolname: 'authenticated', ok: false },
      { rolname: 'service_role', ok: true },
    ]);
  });

  it('a signed-in member cannot call it for a candidate they can read', async () => {
    const lead = await seedMember(db, 'qc_lead');
    const lab = await seedLab(db, lead, 'qc-lab');
    const cand = await seedCandidate(db, lab, lead, { status: 'submitted' });
    await seedInterests(cand);
    const viewer = await seedMember(db, 'qc_viewer');

    // The candidate itself stays readable through RLS — only the RPC closed.
    const visible = await db.asUser(viewer, (tx) =>
      tx.query(`select id from venture_candidates where id = $1`, [cand]),
    );
    expect(visible.rows).toHaveLength(1);
    await expect(
      db.asUser(viewer, (tx) => tx.query(`select * from candidate_interest_counts($1)`, [cand])),
    ).rejects.toThrow(/permission denied/);
  });

  it('a signed-in member cannot read a draft candidate’s counts (the old oracle)', async () => {
    const lead = await seedMember(db, 'qd_lead');
    const lab = await seedLab(db, lead, 'qd-lab');
    const draft = await seedCandidate(db, lab, lead, { status: 'draft' });
    await seedInterests(draft);
    const outsider = await seedMember(db, 'qd_outsider');

    const visible = await db.asUser(outsider, (tx) =>
      tx.query(`select id from venture_candidates where id = $1`, [draft]),
    );
    expect(visible.rows).toHaveLength(0);
    await expect(
      db.asUser(outsider, (tx) => tx.query(`select * from candidate_interest_counts($1)`, [draft])),
    ).rejects.toThrow(/permission denied/);
    // Not even the Lab lead may call it directly — the app is the path.
    await expect(
      db.asUser(lead, (tx) => tx.query(`select * from candidate_interest_counts($1)`, [draft])),
    ).rejects.toThrow(/permission denied/);
  });

  it('anon cannot call it', async () => {
    await expect(
      db.withRole('anon', null, (tx) =>
        tx.query(`select * from candidate_interest_counts(gen_random_uuid())`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('the server path (service_role) still works and still sees every column', async () => {
    const lead = await seedMember(db, 'qs_lead');
    const lab = await seedLab(db, lead, 'qs-lab');
    const cand = await seedCandidate(db, lab, lead, { status: 'submitted' });
    await seedInterests(cand);
    const res = await db.withRole('service_role', null, (tx) =>
      tx.query(`select * from candidate_interest_counts($1)`, [cand]),
    );
    // The raw function is unchanged; the APP drops invest in its projection
    // (apps/web/src/lib/capital/interest-counts.ts).
    expect(res.rows[0]).toEqual({ help: 1, cosign: 1, invest: 1 });
  });

  it('the body and signature are untouched (grant-only change; composes with later redefinitions)', async () => {
    const res = await db.admin.query(
      `select pg_get_function_result(p.oid) as result, p.prosecdef, p.prosrc
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'candidate_interest_counts'`,
    );
    const row = res.rows[0] as { result: string; prosecdef: boolean; prosrc: string };
    expect(row.result).toBe('TABLE(help integer, cosign integer, invest integer)');
    expect(row.prosecdef).toBe(true);
    expect(row.prosrc).toMatch(/where i\.candidate_id = cand/);
  });

  it('the migration contains no DML on interests or user_badges — grants and a flag only', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--.*$/gm, '').toLowerCase();
    expect(sql).not.toMatch(
      /(delete\s+from|truncate|insert\s+into|update)\s+(public\.)?interests\b/,
    );
    expect(sql).not.toMatch(/(delete\s+from|truncate)\s+(public\.)?user_badges\b/);
    // The one UPDATE is the retired flag on the badge definition.
    expect(sql.match(/\bupdate\s+[\w.]+\s+set\b/g)).toHaveLength(1);
    expect(sql).toMatch(
      /update public\.badge_definitions set is_active = false where slug = 'garab-milestone'/,
    );
  });
});

describe('garab-milestone is retired and cannot be newly granted', () => {
  it('its definition row is kept but inactive', async () => {
    const res = await db.admin.query(
      `select is_active, badge_class from badge_definitions where slug = 'garab-milestone'`,
    );
    expect(res.rows).toEqual([{ is_active: false, badge_class: 'earned' }]);
  });

  it('award_badge() refuses it even with a valid earning event', async () => {
    const member = await seedMember(db, 'qb_award');
    const evt = await db.admin.query(
      `insert into reputation_events (user_id, event_type, points, entity_type, entity_id)
       values ($1, 'ask_credited', 5, 'post', gen_random_uuid()) returning id`,
      [member],
    );
    const eventId = (evt.rows[0] as { id: string }).id;
    const res = await db.withRole('service_role', null, (tx) =>
      tx.query(`select award_badge($1, 'garab-milestone', null, $2, '25') as ok`, [
        member,
        eventId,
      ]),
    );
    expect((res.rows[0] as { ok: boolean }).ok).toBe(false);
    const rows = await db.admin.query(
      `select 1 from user_badges ub join badge_definitions bd on bd.id = ub.badge_id
        where ub.user_id = $1 and bd.slug = 'garab-milestone'`,
      [member],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('a direct user_badges insert (the path that bypasses award_badge) is refused', async () => {
    const member = await seedMember(db, 'qb_direct');
    const badge = await garabBadgeId();
    await expect(
      db.withRole('service_role', null, (tx) =>
        tx.query(`insert into user_badges (user_id, badge_id, tier) values ($1, $2, '5')`, [
          member,
          badge,
        ]),
      ),
    ).rejects.toThrow(/badge_retired/);
    // Even the migration role is refused without the explicit override.
    await expect(
      db.admin.query(`insert into user_badges (user_id, badge_id, tier) values ($1, $2, '5')`, [
        member,
        badge,
      ]),
    ).rejects.toThrow(/badge_retired/);
  });

  it('re-pointing an existing row at the retired badge is refused', async () => {
    const member = await seedMember(db, 'qb_repoint');
    const live = await db.admin.query(
      `insert into user_badges (user_id, badge_id)
       select $1, id from badge_definitions where slug = 'lab-lead' returning id`,
      [member],
    );
    const rowId = (live.rows[0] as { id: string }).id;
    await expect(
      db.admin.query(`update user_badges set badge_id = $1 where id = $2`, [
        await garabBadgeId(),
        rowId,
      ]),
    ).rejects.toThrow(/badge_retired/);
  });

  it('history survives: an explicitly overridden fixture row persists and can still be revoked', async () => {
    // Explicit, test-only override (the same lever a data migration would use).
    // This is NOT a production path: clients cannot write user_badges at all.
    const member = await seedMember(db, 'qb_history');
    const badge = await garabBadgeId();
    await db.admin.query('begin');
    await db.admin.query(`set local xidig.allow_retired_badge = 'on'`);
    const inserted = await db.admin.query(
      `insert into user_badges (user_id, badge_id, tier) values ($1, $2, '5') returning id`,
      [member, badge],
    );
    await db.admin.query('commit');
    const rowId = (inserted.rows[0] as { id: string }).id;

    // Override is transaction-scoped: a fresh insert is refused again.
    await expect(
      db.admin.query(
        `insert into user_badges (user_id, badge_id, tier, context) values ($1, $2, '25', 'x')`,
        [member, badge],
      ),
    ).rejects.toThrow(/badge_retired/);
    // Revoking the historical row is an UPDATE of revoked_at — allowed.
    await db.admin.query(`update user_badges set revoked_at = now() where id = $1`, [rowId]);
    const kept = await db.admin.query(
      `select revoked_at is not null as revoked from user_badges where id = $1`,
      [rowId],
    );
    expect(kept.rows).toEqual([{ revoked: true }]);
  });

  it('live badges are unaffected: Top Helper (earned, with event) and Lab Lead (role) still grant', async () => {
    const member = await seedMember(db, 'qb_live');
    const evt = await db.admin.query(
      `insert into reputation_events (user_id, event_type, points, entity_type, entity_id)
       values ($1, 'ask_credited', 5, 'post', gen_random_uuid()) returning id`,
      [member],
    );
    const eventId = (evt.rows[0] as { id: string }).id;
    const top = await db.withRole('service_role', null, (tx) =>
      tx.query(`select award_badge($1, 'top-helper', '2026-08', $2) as ok`, [member, eventId]),
    );
    const lead = await db.withRole('service_role', null, (tx) =>
      tx.query(`select award_badge($1, 'lab-lead') as ok`, [member]),
    );
    expect((top.rows[0] as { ok: boolean }).ok).toBe(true);
    expect((lead.rows[0] as { ok: boolean }).ok).toBe(true);
  });

  it('showing support grants nothing: inserting a support row adds no badge', async () => {
    const lead = await seedMember(db, 'qg_lead');
    const lab = await seedLab(db, lead, 'qg-lab');
    const cand = await seedCandidate(db, lab, lead, { status: 'submitted' });
    const supporter = await seedMember(db, 'qg_supporter');
    const before = await db.admin.query(
      `select count(*)::int as n from user_badges where user_id = $1`,
      [supporter],
    );
    await db.admin.query(
      `insert into interests (candidate_id, user_id, type) values ($1, $2, 'cosign')`,
      [cand, supporter],
    );
    const after = await db.admin.query(
      `select count(*)::int as n from user_badges where user_id = $1`,
      [supporter],
    );
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });
});
