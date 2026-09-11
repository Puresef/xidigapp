import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Legacy unsafe API keys are revoked outright (migration 20260911000800;
 * owner ruling, 11 Sep).
 *
 * Since a8cb98c the write scopes (plaza:write / listings:write / labs:write)
 * and `admin` are operational — an ACTIVE admin's only — and the app narrows a
 * non-admin's key to `read` on use. A live key that still LISTS those scopes
 * but only behaves as read-only is misleading, so it is revoked:
 *   * revoke_unsafe_api_keys() — revokes every live key holding an unsafe
 *     scope whose owner is live (active or the deletion grace) but not an
 *     active admin, writing one immutable audit_logs row per key
 *     (action api_key.revoked, reason in metadata, never key material);
 *     run once by the migration, idempotent;
 *   * a users trigger re-runs it for one owner whenever they stop being an
 *     active admin while live (demotion, entering the grace, reinstatement
 *     as a non-admin), so the invariant cannot quietly re-open.
 * Suspended / deactivated owners are NOT revoked (ruling: blocked on use);
 * deleted owners were already revoked by 20260911000700. Read-only keys and an
 * active admin's operational keys are untouched.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function owner(handle: string, role: string, status: string): Promise<string> {
  const id = await seedMember(db, handle);
  await db.admin.query(
    `update users set role = $2::user_role, status = $3::account_status,
       deletion_requested_at = case when $3 = 'pending_deletion' then now() else null end
     where id = $1`,
    [id, role, status],
  );
  return id;
}
async function key(
  ownerId: string,
  name: string,
  scopes: string[],
  revokedAt: string | null = null,
) {
  const res = await db.admin.query(
    `insert into api_keys (owner_user_id, name, key_hash, key_prefix, scopes, revoked_at)
     values ($1, $2, $3, 'xdg_live_abc123', $4, $5) returning id`,
    [ownerId, name, `hash_${ownerId}_${name}`, scopes, revokedAt],
  );
  return res.rows[0].id as string;
}
async function isRevoked(keyId: string): Promise<boolean> {
  const res = await db.admin.query(`select revoked_at from api_keys where id = $1`, [keyId]);
  return res.rows[0].revoked_at !== null;
}
async function auditFor(keyId: string) {
  const res = await db.admin.query(
    `select actor_user_id, action, target_type::text, metadata from audit_logs
      where target_id = $1 and action = 'api_key.revoked' order by created_at`,
    [keyId],
  );
  return res.rows;
}
const cleanup = async () =>
  (
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.revoke_unsafe_api_keys() as n`),
    )
  ).rows[0].n as number;

describe('one-shot cleanup: revoke_unsafe_api_keys()', () => {
  const k = {} as Record<string, string>;

  beforeAll(async () => {
    const memberA = await owner('lk_member', 'member', 'active');
    const modA = await owner('lk_mod', 'mod', 'active');
    const memberG = await owner('lk_member_grace', 'member', 'pending_deletion');
    const adminG = await owner('lk_admin_grace', 'admin', 'pending_deletion');
    const adminA = await owner('lk_admin', 'admin', 'active');
    const suspended = await owner('lk_susp', 'member', 'suspended');
    const deactivated = await owner('lk_deact', 'admin', 'deactivated');
    k.memberWrite = await key(memberA, 'mw', ['read', 'plaza:write']);
    k.memberRead = await key(memberA, 'mr', ['read']);
    k.modWrite = await key(modA, 'modw', ['listings:write']);
    k.graceWrite = await key(memberG, 'gw', ['read', 'labs:write']);
    k.graceAdmin = await key(adminG, 'ga', ['admin']);
    k.adminOps = await key(adminA, 'ops', ['plaza:write', 'admin']);
    k.suspendedWrite = await key(suspended, 'sw', ['plaza:write']);
    k.deactivatedAdmin = await key(deactivated, 'da', ['admin']);
    k.oldRevoked = await key(memberA, 'old', ['plaza:write'], '2026-01-01T00:00:00Z');
  });

  it('revokes exactly the live non-admin (and grace) keys holding unsafe scopes', async () => {
    expect(await cleanup()).toBe(4);
    for (const name of ['memberWrite', 'modWrite', 'graceWrite', 'graceAdmin']) {
      expect(await isRevoked(k[name]!), name).toBe(true);
    }
  });

  it('leaves read-only keys, the active admin’s operational key and blocked owners alone', async () => {
    for (const name of ['memberRead', 'adminOps', 'suspendedWrite', 'deactivatedAdmin']) {
      expect(await isRevoked(k[name]!), name).toBe(false);
    }
    const old = await db.admin.query(`select revoked_at from api_keys where id = $1`, [
      k.oldRevoked,
    ]);
    expect((old.rows[0].revoked_at as Date).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('records one immutable, reasoned audit row per revoked key — no key material', async () => {
    const rows = await auditFor(k.memberWrite!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: null,
      action: 'api_key.revoked',
      target_type: 'api_key',
      metadata: expect.objectContaining({
        reason: 'legacy_non_admin_write_scope_revoked',
        owner_status: 'active',
        owner_role: 'member',
        unsafe_scopes: ['plaza:write'],
      }),
    });
    const all = await db.admin.query(
      `select metadata::text as m from audit_logs where action = 'api_key.revoked'`,
    );
    for (const r of all.rows) {
      expect(r.m).not.toMatch(/key_hash|hash_|xdg_/);
    }
  });

  it('is idempotent', async () => {
    expect(await cleanup()).toBe(0);
    expect(await auditFor(k.memberWrite!)).toHaveLength(1);
  });

  it('is not callable by clients', async () => {
    const res = await db.admin.query(
      `select has_function_privilege('authenticated', 'public.revoke_unsafe_api_keys(uuid, text)', 'EXECUTE') as authed,
              has_function_privilege('anon', 'public.revoke_unsafe_api_keys(uuid, text)', 'EXECUTE') as anon`,
    );
    expect(res.rows[0]).toEqual({ authed: false, anon: false });
  });
});

describe('the invariant stays closed: an owner who stops being an active admin', () => {
  it('demotion revokes the operational keys (reasoned)', async () => {
    const a = await owner('lk_demote', 'admin', 'active');
    const ops = await key(a, 'ops', ['plaza:write']);
    const read = await key(a, 'r', ['read']);
    await db.admin.query(`update users set role = 'member' where id = $1`, [a]);
    expect(await isRevoked(ops)).toBe(true);
    expect(await isRevoked(read)).toBe(false);
    expect((await auditFor(ops))[0].metadata).toMatchObject({
      reason: 'owner_no_longer_active_admin',
    });
  });

  it('entering the deletion grace revokes them', async () => {
    const a = await owner('lk_grace_entry', 'admin', 'active');
    const ops = await key(a, 'ops', ['admin']);
    await db.admin.query(
      `update users set status = 'pending_deletion', deletion_requested_at = now() where id = $1`,
      [a],
    );
    expect(await isRevoked(ops)).toBe(true);
  });

  it('suspension or deactivation does NOT revoke (blocked on use instead)', async () => {
    for (const status of ['suspended', 'deactivated']) {
      const a = await owner(`lk_${status.slice(0, 5)}_adm`, 'admin', 'active');
      const ops = await key(a, 'ops', ['plaza:write']);
      await db.admin.query(`update users set status = $2::account_status where id = $1`, [
        a,
        status,
      ]);
      expect(await isRevoked(ops), status).toBe(false);
      // Reinstated as an active admin: the key is still theirs.
      await db.admin.query(`update users set status = 'active' where id = $1`, [a]);
      expect(await isRevoked(ops), `${status} → active admin`).toBe(false);
    }
  });

  it('a suspended member reinstated as a member loses a legacy write key', async () => {
    const m = await owner('lk_reinstate', 'member', 'suspended');
    const legacy = await key(m, 'legacy', ['read', 'listings:write']);
    await db.admin.query(`update users set status = 'active' where id = $1`, [m]);
    expect(await isRevoked(legacy)).toBe(true);
  });

  it('an active admin’s ordinary edits never touch their keys', async () => {
    const a = await owner('lk_admin_stays', 'admin', 'active');
    const ops = await key(a, 'ops', ['plaza:write', 'admin']);
    await db.admin.query(`update users set preferred_language = 'so' where id = $1`, [a]);
    await db.admin.query(`update users set role = 'admin' where id = $1`, [a]);
    expect(await isRevoked(ops)).toBe(false);
  });
});
