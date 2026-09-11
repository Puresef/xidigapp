import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';
import { createTranslator } from '@xidig/i18n';

import { writeAudit } from '@/lib/audit';
import { loadStatuses, TOMBSTONE_DISPLAY_NAME } from '@/lib/retained-content';

import { renderAwardResultBody } from './publish';

type Admin = SupabaseClient<Database>;

/**
 * Retained content — award results posts whose winner was deleted (owner
 * ruling 11 Sep: targeted redaction approved where a deleted member's name is
 * still directly readable).
 *
 * publishAwardResults bakes the winner's display name (or, for a winning post
 * with a title, that title) into `posts.body` once, at publish time. The Plaza
 * card re-resolves the winner live and 998f991 stopped shipping the body for
 * a deleted winner, but the stored text is still read directly: any signed-in
 * member can select posts.body through PostgREST (the post is a live system
 * actor's published post), the following feed hydrates `row.body`, and post
 * search matches and returns body text. Projection alone cannot close that.
 *
 * So the one stored field is rewritten: the SAME renderer the publisher uses,
 * with the name replaced by the tombstone ("Deleted member" — the name every
 * other surface shows). Scope is exactly the award_results rows whose target
 * is a deleted user, or a post whose author is deleted; only their own
 * `source = 'system'` post is touched, and only when its body differs from the
 * redacted text, so a re-run is a no-op. Nothing is deleted: award_results
 * (the restricted evidence — target id, votes, asks resolved) is untouched,
 * and each rewrite leaves an audit row that names the post and category, never
 * the old text. The old name is not copied anywhere.
 */

export interface AwardRedactionResult {
  /** Posts whose stored body was rewritten this run. */
  redacted: number;
  /** Rewrites that failed this run; the next run retries them. */
  failed: number;
}

export async function redactDeletedWinnerAwardPosts(admin: Admin): Promise<AwardRedactionResult> {
  const result: AwardRedactionResult = { redacted: 0, failed: 0 };

  const { data: results, error } = await admin
    .from('award_results')
    .select('quarter, category, target_type, target_id, post_id')
    .in('target_type', ['user', 'post'])
    .not('post_id', 'is', null);
  if (error) throw new Error(`award redaction scan failed: ${error.message}`);
  const rows = results ?? [];
  if (rows.length === 0) return result;

  // A winning post counts as a deleted winner when its author was deleted.
  const winningPostIds = rows.filter((r) => r.target_type === 'post').map((r) => r.target_id);
  const postAuthors = new Map<string, string>();
  if (winningPostIds.length > 0) {
    const { data: posts, error: postError } = await admin
      .from('posts')
      .select('id, author_user_id')
      .in('id', winningPostIds);
    if (postError) throw new Error(`award redaction post scan failed: ${postError.message}`);
    for (const post of posts ?? []) postAuthors.set(post.id, post.author_user_id);
  }

  const memberOf = (row: (typeof rows)[number]): string | undefined =>
    row.target_type === 'user' ? row.target_id : postAuthors.get(row.target_id);
  const flags = await loadStatuses(admin, rows.map(memberOf));
  const deletedRows = rows.filter((row) => {
    const member = memberOf(row);
    return member !== undefined && flags.get(member)?.status === 'deleted';
  });
  if (deletedRows.length === 0) return result;

  // Fixed Somali translator — the same one the publish route renders with.
  const t = createTranslator('so');
  const { data: stored, error: storedError } = await admin
    .from('posts')
    .select('id, body, source')
    .in(
      'id',
      deletedRows.map((row) => row.post_id as string),
    );
  if (storedError) throw new Error(`award redaction body read failed: ${storedError.message}`);
  const bodies = new Map((stored ?? []).map((post) => [post.id, post]));

  for (const row of deletedRows) {
    const postId = row.post_id as string;
    const post = bodies.get(postId);
    // Only the award's own system post; anything else is not ours to rewrite.
    if (!post || post.source !== 'system') continue;
    const redactedBody = renderAwardResultBody(t, {
      category: row.category,
      quarter: row.quarter,
      name: TOMBSTONE_DISPLAY_NAME,
    });
    if (post.body === redactedBody) continue;

    const { error: updateError } = await admin
      .from('posts')
      .update({ body: redactedBody })
      .eq('id', postId)
      .eq('source', 'system');
    if (updateError) {
      // Id only — never the body.
      console.error(`[awards] winner redaction failed for post ${postId}:`, updateError.message);
      result.failed += 1;
      continue;
    }
    result.redacted += 1;
    await writeAudit(admin, {
      actorUserId: null,
      action: 'award_post.winner_redacted',
      targetType: 'post',
      targetId: postId,
      metadata: { quarter: row.quarter, category: row.category, reason: 'winner_deleted' },
    });
  }
  return result;
}
