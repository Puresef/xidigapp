import { describe, expect, it } from 'vitest';

import { collectDigestCandidates } from './candidates';
import { digestWindow } from './period';

/**
 * Weekly digest candidates — test-account quarantine (users.is_test,
 * migration 20260912050000). The digest is broadcast community proof (a
 * pinned Plaza post, the member email and GET /api/external/digest/candidates
 * all carry it), so nothing written, led, owned or hosted by a quarantined
 * seeded/test account is a candidate. One service-role flags read covers
 * every author, lead, owner and host; a failed read throws rather than
 * snapshotting unchecked rows.
 */

type Result = { data: unknown; error: { message: string } | null };
type Recorded = { table: string; nots: unknown[][] };

const recorded: Recorded[] = [];

function fakeAdmin(queues: Record<string, Result[]>) {
  const admin = {
    from(table: string) {
      const result = queues[table]?.shift() ?? { data: [], error: null };
      const entry: Recorded = { table, nots: [] };
      recorded.push(entry);
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'is', 'in', 'gte', 'lt', 'lte', 'order', 'limit']) {
        chain[method] = () => chain;
      }
      chain.not = (...args: unknown[]) => (entry.nots.push(args), chain);
      chain.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  };
  return admin as never;
}

const WINDOW = digestWindow(new Date('2026-09-11T00:00:00Z'));

function flags(id: string, isTest: boolean) {
  return { id, status: 'active', is_ai: false, is_test: isTest };
}

/**
 * `users` answers twice, in call order: the quarantined-id lookup (applied
 * in the Wins/Asks queries, before their limit), then the flags read over
 * every author, lead, owner and host.
 */
function seededAdmin(testIds: Result, users: Result) {
  recorded.length = 0;
  return fakeAdmin({
    posts: [
      {
        data: [
          { id: 'w-real', title: 'Real win', author_user_id: 'real' },
          { id: 'w-fake', title: 'Fixture win', author_user_id: 'fixture' },
        ],
        error: null,
      },
      {
        data: [
          { id: 'a-real', title: 'Real ask', author_user_id: 'real' },
          { id: 'a-fake', title: 'Fixture ask', author_user_id: 'fixture' },
        ],
        error: null,
      },
    ],
    labs: [
      {
        data: [
          { id: 'lab-real', name: 'Real Space', slug: 'real-space', lead_user_id: 'real' },
          { id: 'lab-fake', name: 'Fixture Space', slug: 'fixture-space', lead_user_id: 'fixture' },
        ],
        error: null,
      },
    ],
    business_listings: [
      {
        data: [
          { id: 'l-real', business_name: 'Real shop', city: 'Hargeisa', owner_user_id: 'real' },
          { id: 'l-fake', business_name: 'Fixture shop', city: 'Burao', owner_user_id: 'fixture' },
          { id: 'l-seed', business_name: 'Imported shop', city: 'Berbera', owner_user_id: null },
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
            host_user_id: 'real',
          },
          {
            slug: 'fake-meetup',
            title: 'Fixture meetup',
            starts_at: '2026-09-21T10:00:00Z',
            host_user_id: 'fixture',
          },
        ],
        error: null,
      },
    ],
    users: [testIds, users],
  });
}

const FIXTURE_IDS: Result = { data: [{ id: 'fixture' }], error: null };

describe('collectDigestCandidates — quarantined test accounts', () => {
  it('drops test-authored Wins/Asks, test-led Spaces, test-owned listings and test-hosted events', async () => {
    const admin = seededAdmin(FIXTURE_IDS, {
      data: [flags('real', false), flags('fixture', true)],
      error: null,
    });

    const candidates = await collectDigestCandidates(admin, WINDOW);

    expect(candidates.wins.map((w) => w.id)).toEqual(['w-real']);
    expect(candidates.openAsks.map((a) => a.id)).toEqual(['a-real']);
    expect(candidates.newLabs.map((l) => l.id)).toEqual(['lab-real']);
    // Owner-less (imported) listings are not test accounts' — they stay.
    expect(candidates.newListings.map((l) => l.id)).toEqual(['l-real', 'l-seed']);
    expect(candidates.upcomingEvents?.map((e) => e.slug)).toEqual(['real-meetup']);
    expect(candidates.counts).toEqual({ wins: 1, openAsks: 1, newLabs: 1, newListings: 2 });
    // PII-free at rest: no author/lead/owner/host id is snapshotted.
    expect(JSON.stringify(candidates)).not.toMatch(/"(real|fixture)"/);
  });

  it('excludes test authors IN the Wins and open-Asks queries, so fixtures cannot fill the 5 slots', async () => {
    // Open Asks have no time window and fixture Asks stay open: filtering
    // only after the limit could leave the broadcast section empty while
    // older real open Asks exist.
    const admin = seededAdmin(FIXTURE_IDS, {
      data: [flags('real', false), flags('fixture', true)],
      error: null,
    });

    await collectDigestCandidates(admin, WINDOW);

    const postQueries = recorded.filter((entry) => entry.table === 'posts');
    expect(postQueries).toHaveLength(2);
    for (const query of postQueries) {
      expect(query.nots).toContainEqual(['author_user_id', 'in', '(fixture)']);
    }
  });

  it('with no test accounts, the Wins/Asks queries carry no author filter', async () => {
    const admin = seededAdmin(
      { data: [], error: null },
      { data: [flags('real', false)], error: null },
    );

    await collectDigestCandidates(admin, WINDOW);

    for (const query of recorded.filter((entry) => entry.table === 'posts')) {
      expect(query.nots).toEqual([]);
    }
  });

  it('a failed quarantine lookup throws rather than snapshotting unchecked rows', async () => {
    const failed: Result = {
      data: null,
      error: { message: 'column users.is_test does not exist' },
    };

    await expect(collectDigestCandidates(seededAdmin(failed, failed), WINDOW)).rejects.toThrow(
      /lookup failed/,
    );
    await expect(collectDigestCandidates(seededAdmin(FIXTURE_IDS, failed), WINDOW)).rejects.toThrow(
      /account flags lookup failed/,
    );
  });
});
