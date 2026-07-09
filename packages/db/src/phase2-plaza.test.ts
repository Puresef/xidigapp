import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './testing/harness';

/**
 * Phase 2 (Plaza / Madal) RLS negative-test suite, covering migration
 * 20260706000000_phase2_plaza.sql:
 *
 *   * posts/comments/post_tags visibility (published+global vs author vs mod,
 *     hidden threads never leak, lab-scoped posts stay out of reach);
 *   * the API-only write model (posts/comments/post_tags/tags/media_uploads/
 *     moderation_reviews/notifications have NO client write grants);
 *   * reactions + poll ballots as the only client-writable Plaza tables, with
 *     own-row scoping and Seq 14's anonymous-ballot guarantees;
 *   * poll_results() as the sole tally read path;
 *   * reputation_* staying fully locked until Phase 7.
 *
 * Conventions (same as migrations.test.ts): policy denial → /row-level
 * security/, missing table/column grant → /permission denied/, locked table
 * → zero rows. Content rows are seeded via db.admin, mirroring the API's
 * service-role writer (posts/comments are API-only by design).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

/** Creates an active member (bypassing the beta gate) with a profile. */
async function seedMember(handle: string): Promise<string> {
  const userId = await db.createAuthUser({ email: `${handle}@example.com`, gateBypass: true });
  await db.asUser(userId, (tx) =>
    tx.query(`insert into profiles (user_id, display_name, handle) values ($1, $2, $3)`, [
      userId,
      handle,
      handle,
    ]),
  );
  return userId;
}

/** A member promoted to mod, as ops would do it. */
async function seedMod(handle: string): Promise<string> {
  const userId = await seedMember(handle);
  await db.admin.query(`update users set role = 'mod' where id = $1`, [userId]);
  return userId;
}

/**
 * Seeds a post the way the API's service role would (client inserts are
 * revoked by design). Defaults to a published, global 'update' post; the
 * lifecycle columns respect the posts_*_only_for_* CHECKs.
 */
async function seedPost(
  authorUserId: string,
  opts: {
    type?: 'intro' | 'ask' | 'win' | 'update' | 'poll';
    status?: 'published' | 'hidden' | 'removed';
    labId?: string;
    askStatus?: 'open' | 'answered' | 'closed';
    pollStatus?: 'open' | 'closed';
    pollClosesAt?: Date;
  } = {},
): Promise<string> {
  const type = opts.type ?? 'update';
  const result = await db.admin.query(
    `insert into posts (author_user_id, type, body, status, lab_id, ask_status, poll_status, poll_closes_at)
     values ($1, $2, 'Seeded Plaza content', $3, $4, $5, $6, $7) returning id`,
    [
      authorUserId,
      type,
      opts.status ?? 'published',
      opts.labId ?? null,
      opts.askStatus ?? (type === 'ask' ? 'open' : null),
      opts.pollStatus ?? (type === 'poll' ? 'open' : null),
      opts.pollClosesAt ?? null,
    ],
  );
  return result.rows[0].id as string;
}

/** Seeds one poll option; post_type defaults to 'poll' (composite FK). */
async function seedPollOption(postId: string, position: number): Promise<string> {
  const result = await db.admin.query(
    `insert into poll_options (post_id, label, position) values ($1, $2, $3) returning id`,
    [postId, `Option ${position}`, position],
  );
  return result.rows[0].id as string;
}

describe('posts policies', () => {
  it('published global posts are member-visible; hidden posts only author/mod; lab-scoped posts stay out', async () => {
    const author = await seedMember('plaza_author');
    const reader = await seedMember('plaza_reader');
    const mod = await seedMod('plaza_mod');

    const published = await seedPost(author);
    const hidden = await seedPost(author, { status: 'hidden' });

    const readerSeesPublished = await db.asUser(reader, (tx) =>
      tx.query(`select id from posts where id = $1`, [published]),
    );
    expect(readerSeesPublished.rows).toHaveLength(1);

    const readerSeesHidden = await db.asUser(reader, (tx) =>
      tx.query(`select id from posts where id = $1`, [hidden]),
    );
    expect(readerSeesHidden.rows).toEqual([]);

    const authorSeesHidden = await db.asUser(author, (tx) =>
      tx.query(`select id from posts where id = $1`, [hidden]),
    );
    expect(authorSeesHidden.rows).toHaveLength(1);

    const modSeesHidden = await db.asUser(mod, (tx) =>
      tx.query(`select id from posts where id = $1`, [hidden]),
    );
    expect(modSeesHidden.rows).toHaveLength(1);

    // A published-but-lab-scoped post is NOT part of the global Plaza; it
    // stays invisible to non-author members until Phase 4 ships lab policies.
    const lead = await seedMember('plaza_lab_lead');
    const lab = await db.admin.query(
      `insert into labs (name, slug, lead_user_id) values ('Phase Two Lab', 'phase-two-lab', $1) returning id`,
      [lead],
    );
    const labPost = await seedPost(lead, { labId: lab.rows[0].id as string });

    const readerSeesLabPost = await db.asUser(reader, (tx) =>
      tx.query(`select id from posts where id = $1`, [labPost]),
    );
    expect(readerSeesLabPost.rows).toEqual([]);
  });

  it('posts writes are API-only: direct INSERT and UPDATE denied even for the author', async () => {
    const author = await seedMember('plaza_writer');
    const own = await seedPost(author);

    await expect(
      db.asUser(author, (tx) =>
        tx.query(
          `insert into posts (author_user_id, type, body) values ($1, 'update', 'Direct insert')`,
          [author],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // Even the author's own row: the pre-scan/rate-limit pipeline is an API
    // obligation, so the table grant is revoked outright.
    await expect(
      db.asUser(author, (tx) =>
        tx.query(`update posts set body = 'Edited directly' where id = $1`, [own]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('comments & post_tags policies', () => {
  it('comments follow parent-post visibility; hidden threads never leak; direct INSERT denied', async () => {
    const poster = await seedMember('comment_poster');
    const commenter = await seedMember('comment_author');
    const reader = await seedMember('comment_reader');

    const publishedPost = await seedPost(poster);
    const hiddenPost = await seedPost(poster, { status: 'hidden' });

    const onPublished = await db.admin.query(
      `insert into comments (post_id, author_user_id, body) values ($1, $2, 'Visible reply') returning id`,
      [publishedPost, commenter],
    );
    const onHidden = await db.admin.query(
      `insert into comments (post_id, author_user_id, body) values ($1, $2, 'Reply on hidden post') returning id`,
      [hiddenPost, commenter],
    );

    const readerSeesPublished = await db.asUser(reader, (tx) =>
      tx.query(`select id from comments where id = $1`, [onPublished.rows[0].id]),
    );
    expect(readerSeesPublished.rows).toHaveLength(1);

    // The comment itself is published — its hidden parent must still gate it.
    const readerSeesHidden = await db.asUser(reader, (tx) =>
      tx.query(`select id from comments where id = $1`, [onHidden.rows[0].id]),
    );
    expect(readerSeesHidden.rows).toEqual([]);

    const commenterSeesOwn = await db.asUser(commenter, (tx) =>
      tx.query(`select id from comments where id = $1`, [onHidden.rows[0].id]),
    );
    expect(commenterSeesOwn.rows).toHaveLength(1);

    await expect(
      db.asUser(reader, (tx) =>
        tx.query(
          `insert into comments (post_id, author_user_id, body) values ($1, $2, 'Direct reply')`,
          [publishedPost, reader],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('post_tags follow parent-post visibility; direct INSERT denied', async () => {
    const author = await seedMember('tag_author');
    const reader = await seedMember('tag_reader');

    const hiddenPost = await seedPost(author, { status: 'hidden' });
    const tagId = (await db.admin.query(`select id from tags limit 1`)).rows[0].id as string;
    await db.admin.query(`insert into post_tags (post_id, tag_id) values ($1, $2)`, [
      hiddenPost,
      tagId,
    ]);

    const readerSees = await db.asUser(reader, (tx) =>
      tx.query(`select tag_id from post_tags where post_id = $1`, [hiddenPost]),
    );
    expect(readerSees.rows).toEqual([]);

    const authorSees = await db.asUser(author, (tx) =>
      tx.query(`select tag_id from post_tags where post_id = $1`, [hiddenPost]),
    );
    expect(authorSees.rows).toHaveLength(1);

    const publishedPost = await seedPost(author);
    await expect(
      db.asUser(author, (tx) =>
        tx.query(`insert into post_tags (post_id, tag_id) values ($1, $2)`, [publishedPost, tagId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('reactions policies (§20)', () => {
  it('own-rows only: insert/select/delete self, forged ids and hidden targets denied, per-type unique', async () => {
    const author = await seedMember('react_author');
    const reactor = await seedMember('react_member');
    const other = await seedMember('react_other');

    const published = await seedPost(author);
    const hidden = await seedPost(author, { status: 'hidden' });

    await db.asUser(reactor, (tx) =>
      tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
        reactor,
        published,
      ]),
    );

    // Forged user_id → with-check fails.
    await expect(
      db.asUser(other, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          reactor,
          published,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    // Reacting to a hidden post → with-check requires published+global target.
    await expect(
      db.asUser(reactor, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          reactor,
          hidden,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    // Same (user, post, type) again → partial unique index.
    await expect(
      db.asUser(reactor, (tx) =>
        tx.query(`insert into reactions (user_id, post_id, type) values ($1, $2, 'fire')`, [
          reactor,
          published,
        ]),
      ),
    ).rejects.toThrow(/duplicate key/);

    // Counts come from the API (service role); members cannot enumerate.
    const otherSees = await db.asUser(other, (tx) =>
      tx.query(`select id from reactions where post_id = $1`, [published]),
    );
    expect(otherSees.rows).toEqual([]);

    const deleted = await db.asUser(reactor, (tx) =>
      tx.query(`delete from reactions where post_id = $1 and type = 'fire'`, [published]),
    );
    expect(deleted.rowCount).toBe(1);
  });
});

describe('poll ballots (Seq 14: anonymous, counts only)', () => {
  it('own ballot insert + recast while open; closed/expired/forged denied; only poll_option_id updatable', async () => {
    const pollAuthor = await seedMember('poll_author');
    const voter = await seedMember('poll_voter');
    const other = await seedMember('poll_other');

    const openPoll = await seedPost(pollAuthor, { type: 'poll' });
    const optionA = await seedPollOption(openPoll, 0);
    const optionB = await seedPollOption(openPoll, 1);

    await db.asUser(voter, (tx) =>
      tx.query(
        `insert into poll_votes (post_id, poll_option_id, voter_user_id) values ($1, $2, $3)`,
        [openPoll, optionA, voter],
      ),
    );

    // Recast = UPDATE poll_option_id while the poll is open.
    const recast = await db.asUser(voter, (tx) =>
      tx.query(`update poll_votes set poll_option_id = $1 where post_id = $2`, [optionB, openPoll]),
    );
    expect(recast.rowCount).toBe(1);
    const stored = await db.admin.query(
      `select poll_option_id from poll_votes where post_id = $1 and voter_user_id = $2`,
      [openPoll, voter],
    );
    expect(stored.rows[0].poll_option_id).toBe(optionB);

    // Ballots are anonymous: another member reads zero rows.
    const otherSees = await db.asUser(other, (tx) =>
      tx.query(`select id from poll_votes where post_id = $1`, [openPoll]),
    );
    expect(otherSees.rows).toEqual([]);

    // Forged voter_user_id (someone who has not voted, so this is purely RLS).
    await expect(
      db.asUser(other, (tx) =>
        tx.query(
          `insert into poll_votes (post_id, poll_option_id, voter_user_id) values ($1, $2, $3)`,
          [openPoll, optionA, pollAuthor],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    // Manually closed poll (poll_status = 'closed').
    const closedPoll = await seedPost(pollAuthor, { type: 'poll', pollStatus: 'closed' });
    const closedOption = await seedPollOption(closedPoll, 0);
    await expect(
      db.asUser(voter, (tx) =>
        tx.query(
          `insert into poll_votes (post_id, poll_option_id, voter_user_id) values ($1, $2, $3)`,
          [closedPoll, closedOption, voter],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    // Still 'open' but past its deadline: the auto-close sweep may lag, the
    // database must not accept late ballots.
    const expiredPoll = await seedPost(pollAuthor, {
      type: 'poll',
      pollClosesAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const expiredOption = await seedPollOption(expiredPoll, 0);
    await expect(
      db.asUser(voter, (tx) =>
        tx.query(
          `insert into poll_votes (post_id, poll_option_id, voter_user_id) values ($1, $2, $3)`,
          [expiredPoll, expiredOption, voter],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    // The update grant is column-scoped to poll_option_id only.
    await expect(
      db.asUser(voter, (tx) =>
        tx.query(`update poll_votes set post_id = $1 where post_id = $2`, [expiredPoll, openPoll]),
      ),
    ).rejects.toThrow(/permission denied/);

    // Regression: a PostgREST-style upsert (ON CONFLICT DO UPDATE SET over
    // every provided column) trips the column-scoped grant — even for a
    // FIRST vote, because privileges are checked at plan time. The votes API
    // must therefore insert-then-recast (narrow update), never .upsert().
    await expect(
      db.asUser(voter, (tx) =>
        tx.query(
          `insert into poll_votes (post_id, poll_option_id, voter_user_id)
           values ($1, $2, $3)
           on conflict (post_id, voter_user_id) do update set
             post_id = excluded.post_id,
             poll_option_id = excluded.poll_option_id,
             voter_user_id = excluded.voter_user_id`,
          [openPoll, optionA, voter],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('poll_results(): counts only (zero-vote options included), hidden polls empty, anon denied', async () => {
    const author = await seedMember('results_author');
    const voter = await seedMember('results_voter');
    const bystander = await seedMember('results_bystander');

    const poll = await seedPost(author, { type: 'poll' });
    const optionA = await seedPollOption(poll, 0);
    const optionB = await seedPollOption(poll, 1);

    await db.asUser(voter, (tx) =>
      tx.query(
        `insert into poll_votes (post_id, poll_option_id, voter_user_id) values ($1, $2, $3)`,
        [poll, optionA, voter],
      ),
    );

    // Voter and non-voter get the identical tally; toEqual pins the exact row
    // shape — (poll_option_id, votes) and nothing else, no voter ids.
    for (const caller of [voter, bystander]) {
      const results = await db.asUser(caller, (tx) =>
        tx.query(`select * from public.poll_results($1)`, [poll]),
      );
      expect(results.rows).toEqual([
        { poll_option_id: optionA, votes: '1' },
        { poll_option_id: optionB, votes: '0' },
      ]);
    }

    // Poll on a hidden post: the SECURITY DEFINER function re-applies post
    // visibility, so a non-author caller gets zero rows…
    const hiddenPoll = await seedPost(author, { type: 'poll', status: 'hidden' });
    const hiddenOption = await seedPollOption(hiddenPoll, 0);
    const bystanderSeesHidden = await db.asUser(bystander, (tx) =>
      tx.query(`select * from public.poll_results($1)`, [hiddenPoll]),
    );
    expect(bystanderSeesHidden.rows).toEqual([]);

    // …while the author still gets their own tallies.
    const authorSeesHidden = await db.asUser(author, (tx) =>
      tx.query(`select * from public.poll_results($1)`, [hiddenPoll]),
    );
    expect(authorSeesHidden.rows).toEqual([{ poll_option_id: hiddenOption, votes: '0' }]);

    // Execute is revoked from anon (Plaza is members-only).
    await expect(
      db.withRole('anon', null, (tx) => tx.query(`select * from public.poll_results($1)`, [poll])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('media_uploads / moderation_reviews / notifications policies', () => {
  it('media_uploads: owner and mods read, others blind, direct INSERT denied', async () => {
    const owner = await seedMember('media_owner');
    const other = await seedMember('media_other');
    const mod = await seedMod('media_mod');

    await db.admin.query(
      `insert into media_uploads (owner_user_id, storage_path, bytes, scan_status)
       values ($1, $2, 12345, 'passed')`,
      [owner, `${owner}/upload-1.webp`],
    );

    const ownerSees = await db.asUser(owner, (tx) =>
      tx.query(`select id from media_uploads where owner_user_id = $1`, [owner]),
    );
    expect(ownerSees.rows).toHaveLength(1);

    const otherSees = await db.asUser(other, (tx) =>
      tx.query(`select id from media_uploads where owner_user_id = $1`, [owner]),
    );
    expect(otherSees.rows).toEqual([]);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from media_uploads where owner_user_id = $1`, [owner]),
    );
    expect(modSees.rows).toHaveLength(1);

    // Rows exist only after transcode + pre-scan — API-only writes.
    await expect(
      db.asUser(owner, (tx) =>
        tx.query(
          `insert into media_uploads (owner_user_id, storage_path, bytes, scan_status)
           values ($1, $2, 999, 'passed')`,
          [owner, `${owner}/upload-2.webp`],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('moderation_reviews: mod-only queue, invisible even to the content author, writes API-only', async () => {
    const author = await seedMember('review_author');
    const mod = await seedMod('review_mod');
    const flaggedPost = await seedPost(author, { status: 'hidden' });

    const review = await db.admin.query(
      `insert into moderation_reviews (entity_type, entity_id, author_user_id, reason, language, content_excerpt)
       values ('post', $1, $2, 'ai_flagged', 'so', 'Qoraal la hubinayo') returning id`,
      [flaggedPost, author],
    );

    // The author of the flagged content must not see the review row.
    const authorSees = await db.asUser(author, (tx) =>
      tx.query(`select * from moderation_reviews`),
    );
    expect(authorSees.rows).toEqual([]);

    const modSees = await db.asUser(mod, (tx) =>
      tx.query(`select id from moderation_reviews where id = $1`, [review.rows[0].id]),
    );
    expect(modSees.rows).toHaveLength(1);

    await expect(
      db.asUser(author, (tx) =>
        tx.query(
          `insert into moderation_reviews (entity_type, entity_id, author_user_id, reason)
           values ('post', $1, $2, 'ai_uncertain')`,
          [flaggedPost, author],
        ),
      ),
    ).rejects.toThrow(/permission denied/);

    // Resolution has side effects (status flips, audit, notification) — even
    // mods must go through the API.
    await expect(
      db.asUser(mod, (tx) =>
        tx.query(`update moderation_reviews set status = 'approved' where id = $1`, [
          review.rows[0].id,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("notifications: recipients read their own, nobody else's; INSERT is service-role-only", async () => {
    const recipient = await seedMember('notify_recipient');
    const other = await seedMember('notify_other');

    await db.admin.query(
      `insert into notifications (user_id, actor_user_id, type) values ($1, $2, 'reply')`,
      [recipient, other],
    );

    const recipientSees = await db.asUser(recipient, (tx) =>
      tx.query(`select type from notifications`),
    );
    expect(recipientSees.rows).toEqual([{ type: 'reply' }]);

    const otherSees = await db.asUser(other, (tx) => tx.query(`select * from notifications`));
    expect(otherSees.rows).toEqual([]);

    await expect(
      db.asUser(other, (tx) =>
        tx.query(`insert into notifications (user_id, type) values ($1, 'reply')`, [other]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('phase 1 locks unchanged', () => {
  it('tags: still member-readable, writes still API-only', async () => {
    const member = await seedMember('tags_probe_p2');

    const readable = await db.asUser(member, (tx) =>
      tx.query(`select count(*)::int as n from tags`),
    );
    expect(readable.rows[0].n).toBeGreaterThan(0);

    await expect(
      db.asUser(member, (tx) => tx.query(`insert into tags (name) values ('phase2-rogue')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('reputation_events / reputation_scores: client WRITES still locked (reads opened in Phase 7)', async () => {
    // Phase 7 (migration 20260709000000) opened the reputation READS — own-rows
    // on reputation_events, all-rows on reputation_scores — and those policies
    // are asserted in phase7-reputation-awards.test.ts. The invariant that stays
    // true here: a member can never WRITE these tables (scores are earned via
    // the service-role award engine, never a direct client insert/update).
    const member = await seedMember('rep_owner');
    await expect(
      db.asUser(member, (tx) =>
        tx.query(
          `insert into reputation_events (user_id, event_type, points) values ($1, 'ask_credited', 10)`,
          [member],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(member, (tx) =>
        tx.query(`insert into reputation_scores (user_id, helper_score) values ($1, 10)`, [member]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('credited answers (§15 helper credit)', () => {
  it('at most one credited answer per post (partial unique index)', async () => {
    const asker = await seedMember('credit_asker');
    const helperOne = await seedMember('credit_helper1');
    const helperTwo = await seedMember('credit_helper2');
    const ask = await seedPost(asker, { type: 'ask' });

    await db.admin.query(
      `insert into comments (post_id, author_user_id, body, is_credited_answer)
       values ($1, $2, 'First answer', true)`,
      [ask, helperOne],
    );

    await expect(
      db.admin.query(
        `insert into comments (post_id, author_user_id, body, is_credited_answer)
         values ($1, $2, 'Second answer', true)`,
        [ask, helperTwo],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
