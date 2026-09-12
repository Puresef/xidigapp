import { describe, expect, it } from 'vitest';

import { collectDigestCandidates } from './candidates';
import { digestWindow } from './period';

/**
 * Weekly digest candidates — retained content. The digest is a service-role
 * projection (it bypasses RLS) that is then FROZEN into an edition and a
 * pinned post, so it must apply the member rules before snapshotting: a
 * non-live author's Win/Ask (hidden from members by author_is_active), a
 * non-live owner's listing (suppressed pending review) and a deleted host's
 * upcoming event (no longer running) are not candidates.
 */

type Result = { data: unknown; error: null };

function fakeAdmin(queues: Record<string, Result[]>) {
  const admin = {
    from(table: string) {
      const result = queues[table]?.shift() ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lt', 'lte', 'order', 'limit']) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  };
  return admin as never;
}

const WINDOW = digestWindow(new Date('2026-09-11T00:00:00Z'));

describe('collectDigestCandidates — retained-content filters', () => {
  it('drops a deleted author’s posts, a non-live owner’s listing and a deleted host’s upcoming event', async () => {
    const admin = fakeAdmin({
      posts: [
        {
          data: [
            { id: 'w1', title: 'Live win', author_user_id: 'live' },
            { id: 'w2', title: 'Gone win', author_user_id: 'gone' },
          ],
          error: null,
        },
        {
          data: [
            { id: 'a1', title: 'Gone ask', author_user_id: 'gone' },
            { id: 'a2', title: 'Suspended ask', author_user_id: 'paused' },
          ],
          error: null,
        },
      ],
      business_listings: [
        {
          data: [
            { id: 'l1', business_name: 'Live shop', city: 'Hargeisa', owner_user_id: 'live' },
            { id: 'l2', business_name: 'Gone shop', city: 'Berbera', owner_user_id: 'gone' },
            { id: 'l3', business_name: 'Seeded shop', city: 'Burao', owner_user_id: null },
          ],
          error: null,
        },
      ],
      events: [
        {
          data: [
            {
              slug: 'gone-meetup',
              title: 'Gone meetup',
              starts_at: '2026-09-20T10:00:00Z',
              ends_at: null,
              host_user_id: 'gone',
              lab_id: null,
            },
            {
              slug: 'space-meetup',
              title: 'Space meetup',
              starts_at: '2026-09-21T10:00:00Z',
              ends_at: null,
              host_user_id: 'gone',
              lab_id: 'lab-1',
            },
          ],
          error: null,
        },
      ],
      users: [
        {
          // post authors
          data: [
            { id: 'live', status: 'active', is_ai: false },
            { id: 'gone', status: 'deleted', is_ai: false },
            { id: 'paused', status: 'suspended', is_ai: false },
          ],
          error: null,
        },
        {
          // listing owners
          data: [
            { id: 'live', status: 'active', is_ai: false },
            { id: 'gone', status: 'deleted', is_ai: false },
          ],
          error: null,
        },
        {
          // event hosts
          data: [{ id: 'gone', status: 'deleted', is_ai: false }],
          error: null,
        },
      ],
    });

    const candidates = await collectDigestCandidates(admin, WINDOW);

    expect(candidates.wins.map((w) => w.id)).toEqual(['w1']);
    expect(candidates.openAsks).toEqual([]);
    expect(candidates.newListings.map((l) => l.id)).toEqual(['l1', 'l3']);
    expect(candidates.upcomingEvents?.map((e) => e.slug)).toEqual(['space-meetup']);
    // The snapshot carries no member ids.
    expect(JSON.stringify(candidates)).not.toMatch(/author_user_id|owner_user_id|host_user_id/);
  });
});

describe('collectDigestCandidates — test-account quarantine (users.is_test)', () => {
  it('drops posts, Spaces, listings and events by a test account; real and owner-less ones stay', async () => {
    const admin = fakeAdmin({
      posts: [
        {
          data: [
            { id: 'w-real', title: 'Real win', author_user_id: 'real' },
            { id: 'w-test', title: 'Seeded win', author_user_id: 'persona' },
          ],
          error: null,
        },
        {
          data: [
            { id: 'a-real', title: 'Real ask', author_user_id: 'real' },
            { id: 'a-test', title: 'Seeded ask', author_user_id: 'persona' },
          ],
          error: null,
        },
      ],
      labs: [
        {
          data: [
            { id: 'lab-real', name: 'Real Space', slug: 'real-space', lead_user_id: 'real' },
            { id: 'lab-test', name: 'Seeded Space', slug: 'seeded', lead_user_id: 'persona' },
          ],
          error: null,
        },
      ],
      business_listings: [
        {
          data: [
            { id: 'l-real', business_name: 'Real shop', city: 'Hargeisa', owner_user_id: 'real' },
            {
              id: 'l-test',
              business_name: 'Seeded shop',
              city: 'Berbera',
              owner_user_id: 'persona',
            },
            { id: 'l-none', business_name: 'Unclaimed', city: 'Burao', owner_user_id: null },
          ],
          error: null,
        },
      ],
      events: [
        {
          data: [
            {
              slug: 'real-meetup',
              title: 'Real meetup',
              starts_at: '2026-09-20T10:00:00Z',
              ends_at: null,
              host_user_id: 'real',
              lab_id: null,
            },
            {
              slug: 'seeded-meetup',
              title: 'Seeded meetup',
              starts_at: '2026-09-21T10:00:00Z',
              ends_at: null,
              host_user_id: 'persona',
              lab_id: null,
            },
          ],
          error: null,
        },
      ],
      users: [
        {
          // authors + Space leads + event hosts (one read)
          data: [
            { id: 'real', status: 'active', is_ai: false, is_test: false },
            { id: 'persona', status: 'active', is_ai: false, is_test: true },
          ],
          error: null,
        },
        {
          // listing owners
          data: [
            { id: 'real', status: 'active', is_ai: false, is_test: false },
            { id: 'persona', status: 'active', is_ai: false, is_test: true },
          ],
          error: null,
        },
        {
          // event hosts (deleted-host rule) — only the surviving real host
          data: [{ id: 'real', status: 'active', is_ai: false, is_test: false }],
          error: null,
        },
      ],
    });

    const candidates = await collectDigestCandidates(admin, WINDOW);

    expect(candidates.wins.map((w) => w.id)).toEqual(['w-real']);
    expect(candidates.openAsks.map((a) => a.id)).toEqual(['a-real']);
    expect(candidates.newLabs.map((l) => l.id)).toEqual(['lab-real']);
    expect(candidates.newListings.map((l) => l.id)).toEqual(['l-real', 'l-none']);
    expect(candidates.upcomingEvents?.map((e) => e.slug)).toEqual(['real-meetup']);
    expect(candidates.counts).toEqual({ wins: 1, openAsks: 1, newLabs: 1, newListings: 2 });
    // The lead id rides the query for the gate only — never the snapshot.
    expect(JSON.stringify(candidates)).not.toMatch(/lead_user_id|persona/);
  });
});
