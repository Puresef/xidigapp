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
