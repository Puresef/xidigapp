import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * API keys at final deletion (migration 20260911000700).
 *
 * The app refuses a key whose owner is suspended, deactivated or deleted on
 * every request (lib/api-keys/guard.ts). Deletion is TERMINAL, so a deleted
 * owner's keys are also revoked in the data the moment the account becomes
 * 'deleted' — however it gets there (anonymise_user is the one path today).
 * Reversible states (the grace, suspension, deactivation) never revoke: the
 * use-time check covers them and a reinstated member keeps their keys.
 * Keys are compared by id only; no key material is involved.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function seedKey(owner: string, name: string, revokedAt: string | null = null) {
  const res = await db.admin.query(
    `insert into api_keys (owner_user_id, name, key_hash, key_prefix, scopes, revoked_at)
     values ($1, $2, $3, 'xdg_test_abc123', '{read}', $4) returning id`,
    [owner, name, `hash_${owner}_${name}`, revokedAt],
  );
  return res.rows[0].id as string;
}
async function revokedAt(keyId: string): Promise<string | null> {
  const res = await db.admin.query(`select revoked_at from api_keys where id = $1`, [keyId]);
  const v = res.rows[0].revoked_at as Date | null;
  return v === null ? null : v.toISOString();
}
async function anonymise(userId: string) {
  await db.admin.query(
    `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
    [userId],
  );
  await db.withRole('service_role', null, (tx) =>
    tx.query(`select public.anonymise_user($1)`, [userId]),
  );
}

describe('final deletion revokes the owner’s live API keys', () => {
  it('anonymise_user leaves no live key; an earlier revocation keeps its timestamp', async () => {
    const owner = await seedMember(db, 'akl_owner');
    const peer = await seedMember(db, 'akl_peer');
    const live = await seedKey(owner, 'live');
    const old = await seedKey(owner, 'old', '2026-01-01T00:00:00.000Z');
    const peerKey = await seedKey(peer, 'peer');

    await anonymise(owner);

    expect(await revokedAt(live)).not.toBeNull();
    expect(await revokedAt(old)).toBe('2026-01-01T00:00:00.000Z');
    expect(await revokedAt(peerKey)).toBeNull();

    // Idempotent: a repeat run does not move the revocation time.
    const first = await revokedAt(live);
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.anonymise_user($1)`, [owner]),
    );
    expect(await revokedAt(live)).toBe(first);
  });

  it.each(['pending_deletion', 'suspended', 'deactivated'])(
    '%s does not revoke (reversible; the use-time check covers it)',
    async (status) => {
      const owner = await seedMember(db, `akl_${status.slice(0, 6)}`);
      const key = await seedKey(owner, 'k');
      await db.admin.query(
        `update users set status = $2::account_status,
           deletion_requested_at = case when $2 = 'pending_deletion' then now() else null end
         where id = $1`,
        [owner, status],
      );
      expect(await revokedAt(key)).toBeNull();
    },
  );

  it('the trigger function is not callable by clients', async () => {
    const res = await db.admin.query(
      `select has_function_privilege('authenticated', 'public.tg_users_revoke_api_keys_on_delete()', 'EXECUTE') as authed,
              has_function_privilege('anon', 'public.tg_users_revoke_api_keys_on_delete()', 'EXECUTE') as anon`,
    );
    expect(res.rows[0]).toEqual({ authed: false, anon: false });
  });
});
