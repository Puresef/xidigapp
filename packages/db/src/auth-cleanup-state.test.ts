import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedMember } from './testing/factories';
import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Durable auth-shutdown state (migration 20260911000300).
 *
 * The GoTrue ban + email pseudonymisation happens OUTSIDE the anonymisation
 * transaction, in a second system that can fail on its own. These columns are
 * what lets the sweep find that work again and what stops anything reporting
 * a deletion as finished while the identity can still sign in:
 *
 *   pending   = status 'deleted' AND auth_cleaned_at IS NULL
 *   failed    = pending AND auth_cleanup_failure IS NOT NULL (retryable)
 *   complete  = auth_cleaned_at IS NOT NULL
 *
 * Pinned: the closed failure vocabulary, state only on deleted rows, no
 * failure on a completed row, clients can never write it, and the partial
 * index IS the reconciliation query.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

async function deletedMember(handle: string): Promise<string> {
  const id = await seedMember(db, handle);
  await db.admin.query(
    `update users set status = 'pending_deletion', deletion_requested_at = now() - interval '31 days' where id = $1`,
    [id],
  );
  await db.withRole('service_role', null, (tx) =>
    tx.query(`select public.anonymise_user($1)`, [id]),
  );
  return id;
}

describe('auth cleanup state columns', () => {
  it('exists as three nullable columns with the documented types', async () => {
    const res = await db.admin.query(
      `select column_name, data_type, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'users'
          and column_name like 'auth_clean%' order by column_name`,
    );
    expect(res.rows).toEqual([
      { column_name: 'auth_cleaned_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
      {
        column_name: 'auth_cleanup_attempted_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      },
      { column_name: 'auth_cleanup_failure', data_type: 'text', is_nullable: 'YES' },
    ]);
  });

  it('anonymise_user leaves them null — the transaction does not claim the auth step', async () => {
    const id = await deletedMember('acs_fresh');
    const row = await db.admin.query(
      `select auth_cleaned_at, auth_cleanup_attempted_at, auth_cleanup_failure from users where id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({
      auth_cleaned_at: null,
      auth_cleanup_attempted_at: null,
      auth_cleanup_failure: null,
    });
  });

  it('accepts only the closed failure vocabulary', async () => {
    const id = await deletedMember('acs_vocab');
    for (const failure of [
      'provider_unavailable',
      'provider_rejected',
      'identity_missing',
      'verification_failed',
    ]) {
      await db.admin.query(
        `update users set auth_cleanup_failure = $2, auth_cleanup_attempted_at = now() where id = $1`,
        [id, failure],
      );
    }
    await expect(
      db.admin.query(
        `update users set auth_cleanup_failure = 'Invalid email x@y.z' where id = $1`,
        [id],
      ),
    ).rejects.toThrow(/users_auth_cleanup_state/);
  });

  it('refuses auth cleanup state on an account that is not deleted', async () => {
    const live = await seedMember(db, 'acs_live');
    await expect(
      db.admin.query(`update users set auth_cleaned_at = now() where id = $1`, [live]),
    ).rejects.toThrow(/users_auth_cleanup_state/);
    await expect(
      db.admin.query(
        `update users set auth_cleanup_failure = 'provider_unavailable' where id = $1`,
        [live],
      ),
    ).rejects.toThrow(/users_auth_cleanup_state/);
  });

  it('a completed row cannot also carry a failure', async () => {
    const id = await deletedMember('acs_done');
    await expect(
      db.admin.query(
        `update users set auth_cleaned_at = now(), auth_cleanup_failure = 'provider_rejected' where id = $1`,
        [id],
      ),
    ).rejects.toThrow(/users_auth_cleanup_state/);
  });

  it('clients can neither write nor forge it — no UPDATE privilege for anon/authenticated', async () => {
    const res = await db.admin.query(
      `select r.rolname, c.col,
              has_column_privilege(r.rolname, 'public.users', c.col, 'UPDATE') as can_update
         from (values ('anon'), ('authenticated')) r(rolname)
         cross join (values ('auth_cleaned_at'), ('auth_cleanup_attempted_at'), ('auth_cleanup_failure')) c(col)`,
    );
    expect(res.rows.every((r) => r.can_update === false)).toBe(true);

    const own = await seedMember(db, 'acs_forger');
    await expect(
      db.asUser(own, (tx) =>
        tx.query(`update users set auth_cleaned_at = now() where id = $1`, [own]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('the partial index is the reconciliation query', async () => {
    const res = await db.admin.query(
      `select indexdef from pg_indexes
        where schemaname = 'public' and indexname = 'users_auth_cleanup_pending_idx'`,
    );
    expect(res.rows).toHaveLength(1);
    const def = String(res.rows[0].indexdef);
    expect(def).toMatch(/auth_cleanup_attempted_at NULLS FIRST/);
    expect(def).toMatch(/status = 'deleted'/);
    expect(def).toMatch(/auth_cleaned_at IS NULL/);
  });

  it('the reconciliation selects owed accounts only, never-attempted first', async () => {
    const neverTried = await deletedMember('acs_never');
    const failedEarlier = await deletedMember('acs_failed');
    const done = await deletedMember('acs_complete');
    await db.admin.query(
      `update users set auth_cleanup_attempted_at = now() - interval '1 day',
                        auth_cleanup_failure = 'provider_unavailable' where id = $1`,
      [failedEarlier],
    );
    await db.admin.query(
      `update users set auth_cleaned_at = now(), auth_cleanup_attempted_at = now() where id = $1`,
      [done],
    );

    const res = await db.admin.query(
      `select id from users
        where status = 'deleted' and auth_cleaned_at is null
          and id = any($1)
        order by auth_cleanup_attempted_at asc nulls first`,
      [[neverTried, failedEarlier, done]],
    );
    expect(res.rows.map((r) => r.id)).toEqual([neverTried, failedEarlier]);
  });
});
