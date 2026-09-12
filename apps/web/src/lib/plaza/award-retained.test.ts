import { describe, expect, it } from 'vitest';

import { hydratePosts, type PostRow } from './views';

/**
 * Community Awards results after a winner deletes their account (retained
 * content, owner ruling 11 Sep): historical evidence stays (award_results is
 * not touched), public rendering resolves through the current profile state
 * or the tombstone, and nothing implies a current standing.
 *
 * The results post is a 'system' post whose BODY baked the winner's real name
 * in at publish time; PostCard is a client component, so whatever body the
 * hydrator returns reaches every feed viewer's browser. These tests run the
 * real hydrator against a fake service-role client.
 */

type Result = { data: unknown; error: null };

/** Any chain method returns the chain; awaiting it yields the table's next result. */
function fakeAdmin(queues: Record<string, Result[]>) {
  const admin = {
    from(table: string) {
      const result = queues[table]?.shift() ?? { data: [], error: null };
      const chain: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve(result).then(resolve, reject);
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return () =>
                Promise.resolve({
                  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
                  error: null,
                });
            }
            return () => chain;
          },
        },
      );
      return chain;
    },
  };
  return admin as never;
}

const POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function awardPost(): PostRow {
  return {
    id: POST_ID,
    author_user_id: 'seed-actor',
    lab_id: null,
    type: 'win',
    title: null,
    body: 'Most Helpful — 2026-Q3: Hodan Warsame\nThank you for 7 resolved asks.',
    link_url: null,
    image_urls: [],
    ask_status: null,
    ask_nudged_at: null,
    ask_helper_user_id: null,
    ask_helped_at: null,
    ask_fulfilled_at: null,
    poll_status: null,
    poll_closes_at: null,
    status: 'published',
    source: 'system',
    pinned_at: null,
    edited_at: null,
    created_at: '2026-09-01T00:00:00Z',
  } as unknown as PostRow;
}

function profile(userId: string, name: string, handle: string) {
  return {
    user_id: userId,
    display_name: name,
    handle,
    location_city: null,
    avatar_path: null,
    avatar_blurhash: null,
    verification_status: 'unverified',
  };
}

describe('award results post — a winner who has since been deleted', () => {
  it('ships no stored body (the baked-in real name) and resolves the winner to the tombstone', async () => {
    const admin = fakeAdmin({
      award_results: [
        {
          data: [
            {
              post_id: POST_ID,
              quarter: '2026-Q3',
              category: 'most_helpful',
              target_type: 'user',
              target_id: 'winner-1',
              votes: 12,
              evidence: { asksResolved: 7 },
            },
          ],
          error: null,
        },
      ],
      profiles: [
        { data: [profile('seed-actor', 'Xidig', 'xidig')], error: null },
        { data: [profile('winner-1', 'Deleted member', 'deleted_abc123abc123')], error: null },
      ],
      users: [
        {
          data: [{ id: 'winner-1', status: 'deleted', is_ai: false, is_test: false }],
          error: null,
        },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerDeleted).toBe(true);
    expect(view?.award?.winner?.displayName).toBe('Deleted member');
    expect(view?.post.body).toBe('');
    expect(JSON.stringify(view)).not.toContain('Hodan Warsame');
    // The historical evidence (votes, resolved asks) is still rendered.
    expect(view?.award?.votes).toBe(12);
    expect(view?.award?.evidence).toEqual({ asksResolved: 7 });
  });

  it('a live winner is unchanged: body kept, winnerDeleted false', async () => {
    const admin = fakeAdmin({
      award_results: [
        {
          data: [
            {
              post_id: POST_ID,
              quarter: '2026-Q3',
              category: 'most_helpful',
              target_type: 'user',
              target_id: 'winner-1',
              votes: 12,
              evidence: {},
            },
          ],
          error: null,
        },
      ],
      profiles: [
        { data: [profile('seed-actor', 'Xidig', 'xidig')], error: null },
        { data: [profile('winner-1', 'Hodan Warsame', 'hodan')], error: null },
      ],
      users: [
        { data: [{ id: 'winner-1', status: 'active', is_ai: false, is_test: false }], error: null },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerDeleted).toBe(false);
    expect(view?.post.body).toContain('Hodan Warsame');
    expect(view?.award?.winner?.href).toBe('/u/hodan');
  });

  it('a Best Win whose author was deleted resolves to the tombstone — never the hidden post’s title or link', async () => {
    const admin = fakeAdmin({
      award_results: [
        {
          data: [
            {
              post_id: POST_ID,
              quarter: '2026-Q3',
              category: 'best_win',
              target_type: 'post',
              target_id: 'win-post-1',
              votes: 9,
              evidence: {},
            },
          ],
          error: null,
        },
      ],
      posts: [
        {
          data: [
            { id: 'win-post-1', title: 'We opened the Burao shop', author_user_id: 'author-1' },
          ],
          error: null,
        },
      ],
      profiles: [
        { data: [profile('seed-actor', 'Xidig', 'xidig')], error: null },
        { data: [profile('author-1', 'Deleted member', 'deleted_def456def456')], error: null },
      ],
      users: [
        {
          data: [{ id: 'author-1', status: 'deleted', is_ai: false, is_test: false }],
          error: null,
        },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerDeleted).toBe(true);
    expect(view?.award?.winner?.displayName).toBe('Deleted member');
    expect(view?.award?.winner?.href).not.toContain('/p/');
    expect(JSON.stringify(view)).not.toContain('Burao shop');
    expect(view?.post.body).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Test-account quarantine (users.is_test, migration 20260912050000). A results
// card whose winner is a quarantined seeded/test account — the member, the
// winning Win's author or the winning Space's lead — never presents that
// account as a real member: no name, no avatar, no link, and (as for a deleted
// winner) the stored body that baked the fixture's name in is not shipped.
// ---------------------------------------------------------------------------

function awardResult(category: string, targetType: string, targetId: string) {
  return {
    data: [
      {
        post_id: POST_ID,
        quarter: '2026-Q3',
        category,
        target_type: targetType,
        target_id: targetId,
        votes: 12,
        evidence: {},
      },
    ],
    error: null,
  };
}

describe('award results post — a quarantined test-account winner', () => {
  it('a test member winner is not presented: no winner, no stored body', async () => {
    const admin = fakeAdmin({
      award_results: [awardResult('most_helpful', 'user', 'fixture-1')],
      profiles: [
        { data: [profile('seed-actor', 'Xidig', 'xidig')], error: null },
        { data: [profile('fixture-1', 'Hodan Warsame', 'hodan_fixture')], error: null },
      ],
      users: [
        { data: [{ id: 'fixture-1', status: 'active', is_ai: false, is_test: true }], error: null },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerIsTest).toBe(true);
    expect(view?.award?.winnerDeleted).toBe(false); // not deleted — quarantined
    expect(view?.award?.winner).toBeNull();
    expect(view?.post.body).toBe('');
    expect(JSON.stringify(view)).not.toContain('Hodan Warsame');
    expect(JSON.stringify(view)).not.toContain('hodan_fixture');
  });

  it('a Best Win written by a test account shows neither its title, its link nor its author', async () => {
    const admin = fakeAdmin({
      award_results: [awardResult('best_win', 'post', 'win-post-1')],
      posts: [
        {
          data: [
            { id: 'win-post-1', title: 'We opened the Burao shop', author_user_id: 'fixture-2' },
          ],
          error: null,
        },
      ],
      profiles: [
        { data: [profile('seed-actor', 'Xidig', 'xidig')], error: null },
        { data: [profile('fixture-2', 'Fixture Author', 'fixture_author')], error: null },
      ],
      users: [
        { data: [{ id: 'fixture-2', status: 'active', is_ai: false, is_test: true }], error: null },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerIsTest).toBe(true);
    expect(view?.award?.winner).toBeNull();
    expect(view?.post.body).toBe('');
    const shipped = JSON.stringify(view);
    expect(shipped).not.toContain('Burao shop');
    expect(shipped).not.toContain('Fixture Author');
    expect(shipped).not.toContain('/p/win-post-1');
  });

  it('a Best Lab led by a test account is not presented either', async () => {
    const admin = fakeAdmin({
      award_results: [awardResult('best_lab', 'lab', 'lab-1')],
      labs: [
        {
          data: [
            {
              id: 'lab-1',
              name: 'Fixture Space',
              slug: 'fixture-space',
              icon_path: null,
              icon_blurhash: null,
              lead_user_id: 'fixture-3',
            },
          ],
          error: null,
        },
      ],
      profiles: [{ data: [profile('seed-actor', 'Xidig', 'xidig')], error: null }],
      users: [
        { data: [{ id: 'fixture-3', status: 'active', is_ai: false, is_test: true }], error: null },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerIsTest).toBe(true);
    expect(view?.award?.winner).toBeNull();
    expect(JSON.stringify(view)).not.toContain('/labs/fixture-space');
  });

  it('a real Space lead is unchanged (control)', async () => {
    const admin = fakeAdmin({
      award_results: [awardResult('best_lab', 'lab', 'lab-1')],
      labs: [
        {
          data: [
            {
              id: 'lab-1',
              name: 'Burao Makers',
              slug: 'burao-makers',
              icon_path: null,
              icon_blurhash: null,
              lead_user_id: 'lead-1',
            },
          ],
          error: null,
        },
      ],
      profiles: [{ data: [profile('seed-actor', 'Xidig', 'xidig')], error: null }],
      users: [
        { data: [{ id: 'lead-1', status: 'active', is_ai: false, is_test: false }], error: null },
      ],
    });

    const [view] = await hydratePosts(admin, 'viewer-1', [awardPost()], {
      applyMuteFilter: false,
    });

    expect(view?.award?.winnerIsTest).toBe(false);
    expect(view?.award?.winner?.href).toBe('/labs/burao-makers');
    expect(view?.post.body).toContain('Hodan Warsame'); // stored body kept
  });
});
