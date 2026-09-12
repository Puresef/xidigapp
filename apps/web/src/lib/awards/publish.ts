import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, Json, TablesInsert } from '@xidig/db';
import type { Translator } from '@xidig/i18n';

import { loadTestAccountIds, postgrestIdList } from '@/lib/account-flags';
import { ApiError } from '@/lib/api';
import { AWARD_CATEGORY_KEYS } from '@/lib/awards/categories';
import { getSeedActorUserId } from '@/lib/seed/actor';
import { createSeededEntity } from '@/lib/seed/registry';

type Admin = SupabaseClient<Database>;

/**
 * Community-Award results publish (§20, Munaasabado Task 8): tally → winners →
 * one system-provenance Plaza post per category → award_results rows → cycle
 * stamp. Everything here runs as the service role AFTER the route's
 * requireRole('admin') gate — the ballots (award_votes) are own-row-only under
 * RLS, and no member ever sees a live tally.
 *
 * Honesty properties:
 *   * quarantined test accounts (users.is_test) never decide a result: the
 *     ballots are re-tallied here without test voters or test targets
 *     (award_vote_tally() still counts them in SQL, so it is not used), and
 *     the most-helpful evidence line ignores Asks posted by test accounts;
 *   * results NEVER post mid-cycle (closes_at guard → award_cycle_not_closed);
 *   * posts are authored by the badged system actor with source 'system' —
 *     never a human member, never pinned, and never earning reputation (the
 *     registry create path calls no award_reputation);
 *   * the seed_entities dedup key `award:{quarter}:{category}` makes a re-run
 *     resolve to the existing post instead of double-celebrating;
 *   * a published cycle republishes as an idempotent no-op ({already: true});
 *   * CONCURRENT publishes serialize on the claim-first conditional
 *     published_at stamp — the loser resolves {already: true} before any
 *     post exists (final-review fix 4).
 */

/**
 * The stored results-post body: `{category} — {period}: {name}` + provenance.
 * Rendered with a FIXED translator (see publishAwardResults) because it is a
 * permanent platform artifact.
 */
export function renderAwardResultBody(
  t: Translator,
  args: { category: Enums<'award_category'>; quarter: string; name: string },
): string {
  const title = t('awards.resultTitle', {
    category: t(AWARD_CATEGORY_KEYS[args.category]),
    period: args.quarter,
    name: args.name,
  });
  return `${title}\n\n${t('awards.systemProvenance')}`;
}

export interface AwardWinner {
  category: Enums<'award_category'>;
  targetType: Enums<'entity_type'>;
  targetId: string;
  votes: number;
}

/**
 * Pure winner resolution: the top-voted target per category. A vote tie breaks
 * to the lexicographically-lowest target_id — deterministic by value, so the
 * outcome can never depend on tally row order or on when the publish re-ran.
 */
export function pickWinners(tally: AwardWinner[]): AwardWinner[] {
  const winners = new Map<Enums<'award_category'>, AwardWinner>();
  for (const entry of tally) {
    const current = winners.get(entry.category);
    if (
      !current ||
      entry.votes > current.votes ||
      (entry.votes === current.votes && entry.targetId < current.targetId)
    ) {
      winners.set(entry.category, entry);
    }
  }
  return [...winners.values()];
}

/** One stored ballot (award_votes is own-row-only under RLS → service role). */
export interface AwardBallot {
  category: Enums<'award_category'>;
  targetType: Enums<'entity_type'>;
  targetId: string;
  voterUserId: string;
}

/** `${targetType}:${targetId}` — the key of a lab/post target's owner. */
export function awardTargetKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * Pure organic tally (test-account quarantine: users.is_test, migration
 * 20260912050000). award_vote_tally() counts every ballot in SQL — including
 * ballots cast BY seeded/test accounts and ballots cast FOR them — so the
 * publish re-tallies from the ballots themselves. A ballot counts unless its
 * voter is a test account or its target belongs to one: a test member (user
 * target), a Space a test account leads (lab) or a Win a test account wrote
 * (post). `targetOwners` maps `awardTargetKey(type, id)` → lead/author for
 * lab/post targets; a target whose owner is unknown counts exactly as the RPC
 * counted it. Everything that is not a test account counts as before.
 */
export function tallyOrganicBallots(
  ballots: readonly AwardBallot[],
  testIds: ReadonlySet<string>,
  targetOwners: ReadonlyMap<string, string> = new Map(),
): AwardWinner[] {
  const tally = new Map<string, AwardWinner>();
  for (const ballot of ballots) {
    if (testIds.has(ballot.voterUserId)) continue;
    const owner =
      ballot.targetType === 'user'
        ? ballot.targetId
        : targetOwners.get(awardTargetKey(ballot.targetType, ballot.targetId));
    if (owner !== undefined && testIds.has(owner)) continue;
    const key = `${ballot.category}|${awardTargetKey(ballot.targetType, ballot.targetId)}`;
    const entry = tally.get(key);
    if (entry) entry.votes += 1;
    else
      tally.set(key, {
        category: ballot.category,
        targetType: ballot.targetType,
        targetId: ballot.targetId,
        votes: 1,
      });
  }
  return [...tally.values()];
}

/** Lab/post owner lookups are batched so a long id list never overflows a URL. */
const OWNER_LOOKUP_BATCH = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Every ballot of `quarter`, re-tallied with test accounts removed (see
 * tallyOrganicBallots). Pages through award_votes until an empty page, so a
 * PostgREST max_rows cap (1000 by default) can never silently truncate the
 * count. Owner lookups (lab lead, Win author) only run when test accounts
 * exist — with none, the result equals award_vote_tally().
 */
export async function loadOrganicAwardTally(
  admin: Admin,
  quarter: string,
  testIds: ReadonlySet<string>,
): Promise<AwardWinner[]> {
  const ballots: AwardBallot[] = [];
  const PAGE = 1000;
  for (let from = 0; ;) {
    const { data, error } = await admin
      .from('award_votes')
      .select('category, target_type, target_id, voter_user_id')
      .eq('quarter', quarter)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`award ballots read failed: ${error.message}`);
    const page = data ?? [];
    if (page.length === 0) break;
    for (const row of page) {
      ballots.push({
        category: row.category,
        targetType: row.target_type,
        targetId: row.target_id,
        voterUserId: row.voter_user_id,
      });
    }
    from += page.length;
  }

  const targetOwners = new Map<string, string>();
  if (testIds.size > 0 && ballots.length > 0) {
    const idsOf = (type: Enums<'entity_type'>) => [
      ...new Set(ballots.filter((b) => b.targetType === type).map((b) => b.targetId)),
    ];
    for (const ids of chunk(idsOf('lab'), OWNER_LOOKUP_BATCH)) {
      const { data, error } = await admin.from('labs').select('id, lead_user_id').in('id', ids);
      if (error) throw new Error(`award lab owner lookup failed: ${error.message}`);
      for (const lab of data ?? [])
        targetOwners.set(awardTargetKey('lab', lab.id), lab.lead_user_id);
    }
    for (const ids of chunk(idsOf('post'), OWNER_LOOKUP_BATCH)) {
      const { data, error } = await admin.from('posts').select('id, author_user_id').in('id', ids);
      if (error) throw new Error(`award post owner lookup failed: ${error.message}`);
      for (const post of data ?? []) {
        targetOwners.set(awardTargetKey('post', post.id), post.author_user_id);
      }
    }
  }

  return tallyOrganicBallots(ballots, testIds, targetOwners);
}

interface SystemPostArgs {
  actorUserId: string;
  dedupKey: string;
  body: string;
}

/**
 * A system-voice Plaza post (source 'system'), modeled on createSeededPost but
 * for platform-authored records rather than seeded content: same seed_entities
 * idempotency registry, no seeded_content_created emission (that event's
 * taxonomy is 'seed' | 'ai'; award_results_published is this flow's signal),
 * and — like every non-member path — no reputation is ever awarded.
 */
export async function createSystemPost(
  admin: Admin,
  args: SystemPostArgs,
): Promise<{ postId: string; created: boolean }> {
  const result = await createSeededEntity(admin, {
    dedupKey: args.dedupKey,
    entityType: 'post',
    source: 'system',
    create: async () => {
      const insert: TablesInsert<'posts'> = {
        author_user_id: args.actorUserId,
        type: 'update',
        title: null,
        body: args.body,
        source: 'system',
      };
      const { data, error } = await admin.from('posts').insert(insert).select('id').single();
      if (error || !data)
        throw new Error(`system post insert failed: ${error?.message ?? 'no row'}`);
      return data.id;
    },
  });
  return { postId: result.entityId, created: result.created };
}

/** Winner display name for the post-body fallback (the card re-resolves live). */
async function resolveWinnerName(admin: Admin, winner: AwardWinner): Promise<string> {
  if (winner.targetType === 'user') {
    const { data, error } = await admin
      .from('profiles')
      .select('display_name')
      .eq('user_id', winner.targetId)
      .maybeSingle();
    if (error) throw new Error(`award winner profile lookup failed: ${error.message}`);
    return data?.display_name ?? '—';
  }
  if (winner.targetType === 'lab') {
    const { data, error } = await admin
      .from('labs')
      .select('name')
      .eq('id', winner.targetId)
      .maybeSingle();
    if (error) throw new Error(`award winner lab lookup failed: ${error.message}`);
    return data?.name ?? '—';
  }
  if (winner.targetType === 'post') {
    const { data, error } = await admin
      .from('posts')
      .select('title, author_user_id')
      .eq('id', winner.targetId)
      .maybeSingle();
    if (error) throw new Error(`award winner post lookup failed: ${error.message}`);
    if (data?.title) return data.title;
    if (data?.author_user_id) {
      const author = await admin
        .from('profiles')
        .select('display_name')
        .eq('user_id', data.author_user_id)
        .maybeSingle();
      if (author.error)
        throw new Error(`award winner author lookup failed: ${author.error.message}`);
      return author.data?.display_name ?? '—';
    }
  }
  return '—';
}

/**
 * Publish a closed cycle's results. Returns the created/reused post ids, or
 * `{already: true}` when the cycle was published before (idempotent 200 at the
 * route). Throws ApiError not_found (no such cycle) / award_cycle_not_closed
 * (still open). getSeedActorUserId throws when the badged actor is
 * unprovisioned — deliberately surfaced as a 500 via handleApiError: posting
 * award results under a human author would be worse than failing loudly.
 *
 * `t` renders the stored post title/body ONLY — that text is a permanent
 * platform artifact (search snippets, digests, push previews for non-award-
 * aware surfaces), not a per-request response, so the route always passes a
 * FIXED `createTranslator('so')` here regardless of the publishing admin's
 * own locale (the app is SO-default). API error messages are unaffected —
 * they never flow through this `t`.
 */
export async function publishAwardResults(
  admin: Admin,
  quarter: string,
  t: Translator,
): Promise<{ postIds: string[] } | { already: true }> {
  const cycleRes = await admin
    .from('award_cycles')
    .select('quarter, opens_at, closes_at, published_at')
    .eq('quarter', quarter)
    .maybeSingle();
  if (cycleRes.error) throw new Error(`award cycle lookup failed: ${cycleRes.error.message}`);
  const cycle = cycleRes.data;
  if (!cycle) throw new ApiError('not_found', 404);
  if (cycle.published_at) return { already: true };
  if (Date.parse(cycle.closes_at) > Date.now()) throw new ApiError('award_cycle_not_closed', 409);

  // Claim-first concurrency guard (final-review fix 4). Two concurrent
  // publishes can BOTH pass the read-only published_at check above; without a
  // serialization point the loser would still create a duplicate visible post
  // before its cycle stamp quietly matched 0 rows. The conditional UPDATE on
  // `published_at IS NULL` is atomic — exactly ONE caller gets the row back;
  // every other caller resolves {already: true} BEFORE creating anything.
  // Accepted trade-off: a crash after the claim leaves a stamped cycle whose
  // posts need a manual re-run (clear published_at) — the seed_entities dedup
  // key keeps that re-run idempotent, and a rare manual resume beats a
  // duplicate celebration in the Plaza.
  const claim = await admin
    .from('award_cycles')
    .update({ published_at: new Date().toISOString() })
    .eq('quarter', quarter)
    .is('published_at', null)
    .select('quarter')
    .maybeSingle();
  if (claim.error) throw new Error(`award cycle claim failed: ${claim.error.message}`);
  if (!claim.data) return { already: true };

  // The tally, with quarantined test accounts removed on both sides of every
  // ballot (voter and target). award_vote_tally() still counts them in SQL,
  // so the ballots are re-tallied here (loadOrganicAwardTally) and fed to the
  // same deterministic pickWinners.
  const testIdList = await loadTestAccountIds(admin);
  const winners = pickWinners(await loadOrganicAwardTally(admin, quarter, new Set(testIdList)));

  const actorUserId = winners.length > 0 ? await getSeedActorUserId(admin) : null;

  const postIds: string[] = [];
  let mostHelpfulPostId: string | null = null;

  for (const winner of winners) {
    const name = await resolveWinnerName(admin, winner);

    // Most-helpful evidence: fulfilled Asks the winner helped INSIDE the
    // voting window, each one asker-confirmed (ask_status transitions are
    // asker-only) — the honesty line under the celebration. An Ask posted by
    // a quarantined test account is not organic evidence, so it never counts.
    let asksResolved: number | undefined;
    if (winner.category === 'most_helpful' && winner.targetType === 'user') {
      let evidenceQuery = admin
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'ask')
        .eq('ask_status', 'fulfilled')
        .eq('ask_helper_user_id', winner.targetId)
        .gte('ask_fulfilled_at', cycle.opens_at)
        .lte('ask_fulfilled_at', cycle.closes_at);
      if (testIdList.length > 0) {
        evidenceQuery = evidenceQuery.not('author_user_id', 'in', postgrestIdList(testIdList));
      }
      const countRes = await evidenceQuery;
      if (countRes.error) throw new Error(`award evidence count failed: ${countRes.error.message}`);
      // Omit the key entirely at zero — the card's `!== undefined` gate then
      // falls back to the vote-count line instead of celebrating a hollow
      // "0 Codsi oo la xaliyay".
      const count = countRes.count ?? 0;
      if (count > 0) asksResolved = count;
    }

    // The body is a fallback for non-award-aware surfaces (search snippets,
    // digests, push previews) — the Plaza card renders the structured
    // AwardPostView, never this text. One renderer, shared with the
    // retained-content redaction (lib/awards/redact.ts), so a redacted body is
    // this exact text with only the name replaced.
    const body = renderAwardResultBody(t, { category: winner.category, quarter, name });

    const { postId } = await createSystemPost(admin, {
      // winners.length > 0 here, so the actor id resolved above.
      actorUserId: actorUserId as string,
      dedupKey: `award:${quarter}:${winner.category}`,
      body,
    });
    postIds.push(postId);
    if (winner.category === 'most_helpful') mostHelpfulPostId = postId;

    // Upsert on the (quarter, category) PK so a crash between post creation
    // and the cycle stamp resumes cleanly instead of 23505ing.
    const { error: resultError } = await admin.from('award_results').upsert(
      {
        quarter,
        category: winner.category,
        target_type: winner.targetType,
        target_id: winner.targetId,
        votes: winner.votes,
        evidence: (asksResolved === undefined ? {} : { asksResolved }) as Json,
        post_id: postId,
      },
      { onConflict: 'quarter,category' },
    );
    if (resultError) throw new Error(`award result upsert failed: ${resultError.message}`);
  }

  // Anchor post: the most_helpful celebration when present, else the first
  // category posted (null when a zero-vote cycle publishes empty). The cycle
  // itself was already claimed (published_at stamped) up front — this only
  // links the anchor.
  const { error: cycleError } = await admin
    .from('award_cycles')
    .update({ results_post_id: mostHelpfulPostId ?? postIds[0] ?? null })
    .eq('quarter', quarter);
  if (cycleError) throw new Error(`award cycle anchor stamp failed: ${cycleError.message}`);

  return { postIds };
}
