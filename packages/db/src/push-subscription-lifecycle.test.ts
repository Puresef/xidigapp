import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Push subscriptions at final deletion (migration 20260911000900; owner
 * ruling, 11 Sep).
 *
 * A deleted account must not keep a live device endpoint. When an account
 * becomes 'deleted' — however it gets there (anonymise_user today) — every
 * live push subscription it holds is revoked (revoked_at = now()), the same
 * key-death semantics the sender and the prune path already use. Rows are
 * not deleted and endpoint / key material is not scrubbed here (that is the
 * retained-content lane); live DELIVERY capability is what ends.
 * Reversible states — the grace, suspension, deactivation — never revoke:
 * the sender refuses non-live recipients at send time instead
 * (apps/web/src/lib/push/send.ts), and a reinstated member keeps their
 * devices. No endpoint or key material appears in assertions.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

let seq = 0;
async function subscribe(userId: string, revokedAt: string | null = null): Promise<string> {
  seq += 1;
  const res = await db.admin.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, revoked_at)
     values ($1, $2, 'zz-p256dh', 'zz-auth', $3) returning id`,
    [userId, `https://push.invalid/zz-psl/${seq}`, revokedAt],
  );
  return res.rows[0].id as string;
}
async function revokedAt(id: string): Promise<string | null> {
  const res = await db.admin.query(`select revoked_at from push_subscriptions where id = $1`, [id]);
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

describe('final deletion revokes live push subscriptions', () => {
  it('anonymise_user leaves no live subscription; earlier revocations keep their time; peers untouched', async () => {
    const member = await seedMember(db, 'psl_member');
    const peer = await seedMember(db, 'psl_peer');
    const phone = await subscribe(member);
    const laptop = await subscribe(member);
    const old = await subscribe(member, '2026-01-01T00:00:00.000Z');
    const peerSub = await subscribe(peer);

    await anonymise(member);

    expect(await revokedAt(phone)).not.toBeNull();
    expect(await revokedAt(laptop)).not.toBeNull();
    expect(await revokedAt(old)).toBe('2026-01-01T00:00:00.000Z');
    expect(await revokedAt(peerSub)).toBeNull();
    const rows = await db.admin.query(
      `select count(*)::int as n from push_subscriptions where user_id = $1`,
      [member],
    );
    expect(rows.rows[0].n).toBe(3); // revoked, not deleted
  });

  it('is idempotent: a repeat anonymise does not move the revocation time', async () => {
    const member = await seedMember(db, 'psl_repeat');
    const sub = await subscribe(member);
    await anonymise(member);
    const first = await revokedAt(sub);
    await db.withRole('service_role', null, (tx) =>
      tx.query(`select public.anonymise_user($1)`, [member]),
    );
    expect(await revokedAt(sub)).toBe(first);
  });

  it.each(['pending_deletion', 'suspended', 'deactivated'])(
    '%s does not revoke (reversible; the sender refuses at send time)',
    async (status) => {
      const member = await seedMember(db, `psl_${status.slice(0, 6)}`);
      const sub = await subscribe(member);
      await db.admin.query(
        `update users set status = $2::account_status,
           deletion_requested_at = case when $2 = 'pending_deletion' then now() else null end
         where id = $1`,
        [member, status],
      );
      expect(await revokedAt(sub)).toBeNull();
    },
  );

  it('the trigger function is not callable by clients', async () => {
    const res = await db.admin.query(
      `select has_function_privilege('authenticated', 'public.tg_users_revoke_push_on_delete()', 'EXECUTE') as authed,
              has_function_privilege('anon', 'public.tg_users_revoke_push_on_delete()', 'EXECUTE') as anon`,
    );
    expect(res.rows[0]).toEqual({ authed: false, anon: false });
  });
});
