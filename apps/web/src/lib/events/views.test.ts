import { describe, expect, it, vi } from 'vitest';

import type { AuthContext } from '@/lib/auth/guards';

import { getFeaturedUpcomingPublicEvent, listEventCards } from './views';

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
      lt: rec('lt'),
      or: rec('or'),
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

// ---------------------------------------------------------------------------
// listEventCards (Task 4, frame 9a): one events query per tab (+ the 3-most-
// recent past strip on 'upcoming'), then BATCHED hydration — the whole card
// list must never issue a per-event query.
// ---------------------------------------------------------------------------

const VIEWER = 'viewer-1';
const CARDS_NOW = new Date('2026-08-10T12:00:00Z');

function ctxFor(fake: unknown): AuthContext {
  return {
    user: { id: VIEWER },
    appUser: { id: VIEWER, role: 'member', status: 'active' },
    supabase: fake,
  } as unknown as AuthContext;
}

function cardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'e1',
    slug: 'tea-talk',
    title: 'Tea & talk',
    category_id: 'community',
    description: '',
    starts_at: '2026-08-20T18:30:00Z',
    ends_at: null,
    timezone: 'Africa/Mogadishu',
    mode: 'online',
    venue_name: null,
    host_user_id: 'host-2',
    lab_id: null,
    listing_id: null,
    candidate_id: null,
    visibility: 'members',
    capacity: null,
    featured_at: null,
    status: 'published',
    source: 'member',
    created_at: '2026-07-01T00:00:00Z',
    cover_path: null,
    cover_blurhash: null,
    agenda: [],
    ...overrides,
  };
}

describe('listEventCards (batched card loader)', () => {
  it('upcoming tab: upcoming asc + 3-most-recent past strip, hydrated in batches', async () => {
    const e1 = cardRow({
      id: 'e1',
      slug: 'demo-day',
      lab_id: 'lab-1',
      capacity: 2,
      cover_path: 'u1/abc.webp',
      cover_blurhash: 'LKO2?U%2',
    });
    const e2 = cardRow({
      id: 'e2',
      slug: 'running-meetup',
      starts_at: '2026-08-10T09:00:00Z',
      ends_at: '2026-08-10T18:00:00Z',
    });
    const e3 = cardRow({ id: 'e3', slug: 'last-week', starts_at: '2026-08-01T10:00:00Z' });

    // SQL order: starts_at asc — the already-running e2 sorts before e1.
    const { admin, queries } = makeFakeAdmin({
      events: [
        { data: [e2, e1], error: null },
        { data: [e3], error: null },
      ],
      event_rsvps: [
        {
          data: [
            { event_id: 'e1', status: 'going', checked_in_at: null },
            { event_id: 'e1', status: 'going', checked_in_at: null },
            { event_id: 'e2', status: 'going', checked_in_at: null },
            { event_id: 'e2', status: 'interested', checked_in_at: null },
            { event_id: 'e3', status: 'going', checked_in_at: '2026-08-01T10:05:00Z' },
            { event_id: 'e3', status: 'going', checked_in_at: '2026-08-01T10:06:00Z' },
            { event_id: 'e3', status: 'going', checked_in_at: null },
          ],
          error: null,
        },
        {
          data: [
            { event_id: 'e1', user_id: 'u1' },
            { event_id: 'e1', user_id: 'u2' },
            { event_id: 'e3', user_id: 'u7' },
          ],
          error: null,
        },
        // show_publicly: false — proves the STORED opt-out threads through to
        // the card (the verb must resend it, never a hardcoded true).
        { data: [{ event_id: 'e1', status: 'going', show_publicly: false }], error: null },
      ],
      labs: [
        { data: [{ id: 'lab-1', name: 'Hargeisa Devs', slug: 'hargeisa-devs' }], error: null },
      ],
      profiles: [
        {
          data: [
            { user_id: 'host-2', display_name: 'Amina', handle: 'amina' },
            { user_id: 'u1', display_name: 'A One', handle: 'a1' },
            { user_id: 'u2', display_name: 'B Two', handle: 'b2' },
            { user_id: 'u7', display_name: 'C Seven', handle: 'c7' },
          ],
          error: null,
        },
      ],
    });
    holder.admin = admin;

    const { items, upcomingCount } = await listEventCards(ctxFor(admin), 'upcoming', CARDS_NOW);

    expect(items.map((i) => i.slug)).toEqual(['running-meetup', 'demo-day', 'last-week']);
    expect(upcomingCount).toBe(2);

    // BATCHED hydration: 2 events queries (upcoming + past strip), 3 rsvp
    // queries (aggregate, samples, viewer) each over the full id set, one labs
    // query, one profiles query. Nothing per-event.
    expect(queries.filter((q) => q.table === 'events')).toHaveLength(2);
    const rsvpQueries = queries.filter((q) => q.table === 'event_rsvps');
    expect(rsvpQueries).toHaveLength(3);
    for (const q of rsvpQueries) {
      expect(q.calls.some((c) => c.method === 'in')).toBe(true);
    }
    expect(queries.filter((q) => q.table === 'labs')).toHaveLength(1);
    expect(queries.filter((q) => q.table === 'profiles')).toHaveLength(1);

    const [running, demoDay, lastWeek] = items;
    // e1: exact going, full (capacity 2), lab host, cover urls, viewer going.
    expect(demoDay!.goingCount).toBe(2);
    expect(demoDay!.isFull).toBe(true);
    expect(demoDay!.isPast).toBe(false);
    expect(demoDay!.attendedCount).toBeNull();
    expect(demoDay!.host).toEqual({
      kind: 'lab',
      name: 'Hargeisa Devs',
      href: '/labs/hargeisa-devs',
    });
    expect(demoDay!.coverUrl).toContain('/storage/v1/object/public/post-media/u1/abc.webp');
    expect(demoDay!.coverThumbUrl).toContain('u1/abc_thumb.webp');
    expect(demoDay!.coverBlurhash).toBe('LKO2?U%2');
    expect(demoDay!.viewerRsvp).toEqual({ status: 'going', showPublicly: false });
    expect(demoDay!.attendeeSample).toEqual([
      { displayName: 'A One', handle: 'a1' },
      { displayName: 'B Two', handle: 'b2' },
    ]);
    // e2: still running — not past, member host.
    expect(running!.isPast).toBe(false);
    expect(running!.host).toEqual({ kind: 'member', name: 'Amina', href: '/u/amina' });
    expect(running!.isFull).toBe(false);
    // e3: past strip — checked-in count wins as attendance.
    expect(lastWeek!.isPast).toBe(true);
    expect(lastWeek!.goingCount).toBe(3);
    expect(lastWeek!.attendedCount).toBe(2);
    expect(lastWeek!.viewerRsvp).toBeNull();
  });

  it('mine tab: merges hosted + RSVPed via one events query, upcoming asc then past desc', async () => {
    const mine = cardRow({ id: 'e9', slug: 'was-there', starts_at: '2026-08-02T10:00:00Z' });
    const hosted = cardRow({ id: 'e1', slug: 'my-next', starts_at: '2026-08-21T10:00:00Z' });

    const { admin, queries } = makeFakeAdmin({
      event_rsvps: [
        { data: [{ event_id: 'e9', status: 'interested', show_publicly: true }], error: null },
        { data: [], error: null }, // aggregate batch
        { data: [], error: null }, // sample batch
      ],
      events: [{ data: [mine, hosted], error: null }],
      profiles: [
        { data: [{ user_id: 'host-2', display_name: 'Amina', handle: 'amina' }], error: null },
      ],
    });
    holder.admin = admin;

    const { items, upcomingCount } = await listEventCards(ctxFor(admin), 'mine', CARDS_NOW);

    expect(items.map((i) => i.slug)).toEqual(['my-next', 'was-there']);
    expect(upcomingCount).toBe(1);
    // The viewer's own RSVP rows come from the FIRST query — no fourth
    // event_rsvps round-trip re-fetches them.
    expect(queries.filter((q) => q.table === 'event_rsvps')).toHaveLength(3);
    expect(queries.filter((q) => q.table === 'events')).toHaveLength(1);

    const eventsQuery = queries.find((q) => q.table === 'events')!;
    const orArgs = eventsQuery.calls.filter((c) => c.method === 'or').map((c) => c.args[0]);
    expect(orArgs.some((a) => String(a).includes(`host_user_id.eq.${VIEWER}`))).toBe(true);
    expect(orArgs.some((a) => String(a).includes('id.in.(e9)'))).toBe(true);

    expect(items[1]!.viewerRsvp).toEqual({ status: 'interested', showPublicly: true });
  });

  it('an empty tab issues no hydration queries at all', async () => {
    const { admin, queries } = makeFakeAdmin({
      events: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    });
    holder.admin = admin;

    const { items, upcomingCount } = await listEventCards(ctxFor(admin), 'upcoming', CARDS_NOW);

    expect(items).toEqual([]);
    expect(upcomingCount).toBe(0);
    expect(queries.filter((q) => q.table === 'event_rsvps')).toHaveLength(0);
    expect(queries.filter((q) => q.table === 'labs')).toHaveLength(0);
    expect(queries.filter((q) => q.table === 'profiles')).toHaveLength(0);
  });
});
