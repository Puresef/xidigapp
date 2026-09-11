import { describe, expect, it } from 'vitest';

import { queryExternalListings } from './read';

/**
 * External REST + MCP listing read (§21) — retained content. The projection
 * already omits address and contact_links; it must also stop returning a
 * listing whose owner is no longer live (the member RLS read hides it), and
 * owner_user_id — read only to apply that rule — must never leave the module.
 */

type Result = { data: unknown; error: null };

function fakeAdmin(queues: Record<string, Result[]>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const admin = {
    from(table: string) {
      const result = queues[table]?.shift() ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'ilike', 'in', 'or', 'order', 'limit']) {
        chain[method] = (...args: unknown[]) => (calls.push({ table, method, args }), chain);
      }
      chain.maybeSingle = () => Promise.resolve(result);
      chain.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  };
  return { admin: admin as never, calls };
}

function listing(id: string, owner: string | null, createdAt: string) {
  return {
    id,
    owner_user_id: owner,
    business_name: `Biz ${id}`,
    short_description: null,
    city: 'Hargeisa',
    country: 'SO',
    landmark: null,
    latitude: 9.56,
    longitude: 44.06,
    verification_status: 'verified',
    source: 'member',
    created_at: createdAt,
    category: null,
  };
}

describe('queryExternalListings — owner rule', () => {
  it('drops a deleted (or otherwise non-live) owner’s listing and never returns owner_user_id', async () => {
    const { admin, calls } = fakeAdmin({
      business_listings: [
        {
          data: [
            listing('a', 'live', '2026-09-10T00:00:00Z'),
            listing('b', 'gone', '2026-09-09T00:00:00Z'),
            listing('c', null, '2026-09-08T00:00:00Z'),
            listing('d', 'paused', '2026-09-07T00:00:00Z'),
          ],
          error: null,
        },
      ],
      users: [
        {
          data: [
            { id: 'live', status: 'active', is_ai: false },
            { id: 'gone', status: 'deleted', is_ai: false },
            { id: 'paused', status: 'suspended', is_ai: false },
          ],
          error: null,
        },
      ],
    });

    const page = await queryExternalListings(admin, { limit: 10 });

    const items = page.items as Array<Record<string, unknown>>;
    expect(items.map((item) => item.id)).toEqual(['a', 'c']);
    for (const item of items) expect(item).not.toHaveProperty('owner_user_id');
    expect(JSON.stringify(items)).not.toMatch(/owner_user_id|gone|paused/);
    // Still the published-only query.
    expect(calls).toContainEqual({
      table: 'business_listings',
      method: 'eq',
      args: ['status', 'published'],
    });
  });

  it('keeps keyset pagination on the RAW page, so a suppressed row never breaks the cursor', async () => {
    const { admin } = fakeAdmin({
      business_listings: [
        {
          data: [
            listing('a', 'gone', '2026-09-10T00:00:00Z'),
            listing('b', 'gone', '2026-09-09T00:00:00Z'),
            listing('c', 'live', '2026-09-08T00:00:00Z'), // limit+1 → there is a next page
          ],
          error: null,
        },
      ],
      users: [
        {
          data: [
            { id: 'gone', status: 'deleted', is_ai: false },
            { id: 'live', status: 'active', is_ai: false },
          ],
          error: null,
        },
      ],
    });

    const page = await queryExternalListings(admin, { limit: 2 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).not.toBeNull();
  });
});
