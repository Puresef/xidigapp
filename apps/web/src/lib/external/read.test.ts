import { describe, expect, it } from 'vitest';

import { queryExternalListings } from './read';

/**
 * GET /api/external/listings (API-key directory read) — test-account
 * quarantine (users.is_test, migration 20260912050000). A listing owned by a
 * quarantined seeded/test account is not directory proof for an external
 * consumer either: excluded in the query (a page still fills), owner-less
 * (imported, unclaimed) listings kept. The fake records each query's chain.
 */

type Row = Record<string, unknown>;
type Call = { op: string; args: unknown[] };

function fakeAdmin(testIds: string[]) {
  const queries: Array<{ table: string; calls: Call[] }> = [];
  const admin = {
    from(table: string) {
      const calls: Call[] = [];
      queries.push({ table, calls });
      const rows: Row[] = table === 'users' ? testIds.map((id) => ({ id })) : [];
      const target = {
        then<T1, T2>(
          onfulfilled?: ((v: { data: Row[]; error: null }) => T1 | PromiseLike<T1>) | null,
          onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
        ) {
          return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
        },
      };
      const proxy: unknown = new Proxy(target, {
        get(t, prop) {
          if (prop in t) return (t as Record<PropertyKey, unknown>)[prop];
          return (...args: unknown[]) => {
            calls.push({ op: String(prop), args });
            return proxy;
          };
        },
      });
      return proxy;
    },
  };
  return { admin: admin as never, queries };
}

function listingOrs(queries: Array<{ table: string; calls: Call[] }>): unknown[] {
  const listing = queries.find((query) => query.table === 'business_listings');
  return (listing?.calls ?? []).filter((call) => call.op === 'or').map((call) => call.args[0]);
}

describe('queryExternalListings — quarantined test accounts', () => {
  it('excludes test-owned listings in the query while keeping owner-less ones', async () => {
    const { admin, queries } = fakeAdmin(['t1', 't2']);

    await queryExternalListings(admin, { limit: 20 });

    expect(listingOrs(queries)).toContain('owner_user_id.is.null,owner_user_id.not.in.(t1,t2)');
  });

  it('adds no owner filter when there are no test accounts', async () => {
    const { admin, queries } = fakeAdmin([]);

    await queryExternalListings(admin, { limit: 20 });

    expect(listingOrs(queries)).toEqual([]);
  });
});
