import { describe, expect, it, vi } from 'vitest';

import { getFeaturedUpcomingPublicEvent } from './views';

/**
 * Homepage "next up" helper (front-door standard §2-E26): featured-else-
 * soonest must be ONE query — the fallback branch is expressed as an ORDER BY
 * (featured_at DESC NULLS LAST, then starts_at ASC), never a second serial
 * round-trip. The organic-proof predicates and the AI-host drop are pinned
 * alongside.
 */

const holder = vi.hoisted(() => ({ admin: null as unknown }));

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => holder.admin,
}));

// ---------------------------------------------------------------------------
// Fake query builder that records the chain (organic.test.ts precedent),
// with per-table result queues so the users (is_ai) lookup can answer too.
// ---------------------------------------------------------------------------
interface RecordedQuery {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

function makeFakeAdmin(resultsByTable: Record<string, QueryResult[]>) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const record: RecordedQuery = { table, calls: [] };
    queries.push(record);
    const queue = resultsByTable[table] ?? [];
    const result: QueryResult = queue.shift() ?? { data: [], error: null };

    function rec(method: string) {
      return (...args: unknown[]) => (record.calls.push({ method, args }), chain);
    }
    const chain = {
      select: rec('select'),
      eq: rec('eq'),
      gte: rec('gte'),
      in: rec('in'),
      not: rec('not'),
      order: rec('order'),
      limit: rec('limit'),
      then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return chain;
  }

  return { admin: { from } as never, queries };
}

const NOW = new Date('2026-07-11T00:00:00Z');

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    slug: 'tea-talk',
    title: 'Tea & talk',
    category_id: 'community',
    starts_at: '2026-08-01T18:30:00+03:00',
    timezone: 'Africa/Mogadishu',
    mode: 'online',
    status: 'published',
    host_user_id: 'human-1',
    ...overrides,
  };
}

describe('getFeaturedUpcomingPublicEvent (merged featured-else-soonest)', () => {
  it('resolves featured-else-soonest in ONE events query, even when empty', async () => {
    const { admin, queries } = makeFakeAdmin({ events: [{ data: [], error: null }] });
    holder.admin = admin;

    expect(await getFeaturedUpcomingPublicEvent(NOW)).toBeNull();

    const eventQueries = queries.filter((q) => q.table === 'events');
    expect(
      eventQueries,
      'featured-else-soonest must be one merged query, not two serial ones (§2-E26)',
    ).toHaveLength(1);
  });

  it('orders featured first (newest pin, NULLs last), then the soonest of the rest', async () => {
    const { admin, queries } = makeFakeAdmin({ events: [{ data: [], error: null }] });
    holder.admin = admin;

    await getFeaturedUpcomingPublicEvent(NOW);

    const calls = queries[0]!.calls;
    expect(calls.filter((c) => c.method === 'order').map((c) => c.args)).toEqual([
      ['featured_at', { ascending: false, nullsFirst: false }],
      ['starts_at', { ascending: true }],
    ]);
    // The organic-proof + public predicates stay on the merged query.
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['visibility', 'public'],
      ['status', 'published'],
      ['moderation_status', 'published'],
      ['source', 'member'],
    ]);
    expect(calls.filter((c) => c.method === 'gte').map((c) => c.args)).toEqual([
      ['starts_at', NOW.toISOString()],
    ]);
  });

  it('maps the first row into the card projection', async () => {
    const { admin } = makeFakeAdmin({
      events: [{ data: [eventRow()], error: null }],
      users: [{ data: [], error: null }],
    });
    holder.admin = admin;

    expect(await getFeaturedUpcomingPublicEvent(NOW)).toEqual({
      slug: 'tea-talk',
      title: 'Tea & talk',
      categoryId: 'community',
      startsAt: '2026-08-01T18:30:00+03:00',
      timezone: 'Africa/Mogadishu',
      mode: 'online',
      status: 'published',
    });
  });

  it('drops AI-hosted rows and falls through to the next candidate', async () => {
    const { admin } = makeFakeAdmin({
      events: [
        {
          data: [
            eventRow({ slug: 'seeded', host_user_id: 'ai-1' }),
            eventRow({ slug: 'organic', host_user_id: 'human-1' }),
          ],
          error: null,
        },
      ],
      users: [{ data: [{ id: 'ai-1' }], error: null }],
    });
    holder.admin = admin;

    const item = await getFeaturedUpcomingPublicEvent(NOW);
    expect(item?.slug).toBe('organic');
  });

  it('throws on a query error (the caller degrades, not this helper)', async () => {
    const { admin } = makeFakeAdmin({
      events: [{ data: null, error: { message: 'boom' } }],
    });
    holder.admin = admin;

    await expect(getFeaturedUpcomingPublicEvent(NOW)).rejects.toThrow(/event query failed/);
  });
});
