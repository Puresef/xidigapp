import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ASK_NUDGE_AFTER_DAYS } from '@/lib/plaza/constants';
import { insertNotification } from '@/lib/plaza/notify';

/**
 * Scheduled Plaza sweeps (§15/§26 stale-Ask nudge, Seq 14 poll auto-close),
 * run hourly by /api/cron/plaza. Pure of any request context — they take the
 * service-role client and a clock so tests can drive them directly.
 */

const DAY_MS = 86_400_000;

/**
 * Nudge authors of Asks that have sat open and un-nudged for
 * ASK_NUDGE_AFTER_DAYS. Per the §26 notification matrix this is in-app only
 * (type 'ask_stale') — no email. The candidate query mirrors
 * posts_open_asks_idx (type/ask_status/ask_nudged_at partial on created_at);
 * the per-row conditional update keeps the sweep idempotent when two runs
 * overlap. Returns the number of posts nudged by THIS run.
 */
export async function nudgeStaleAsks(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - ASK_NUDGE_AFTER_DAYS * DAY_MS).toISOString();

  const { data: stale, error } = await admin
    .from('posts')
    .select('id, author_user_id')
    .eq('type', 'ask')
    .eq('ask_status', 'open')
    .is('ask_nudged_at', null)
    .eq('status', 'published')
    .is('lab_id', null)
    .lt('created_at', cutoff)
    .limit(200);
  if (error) throw new Error(`stale-ask sweep query failed: ${error.message}`);

  let nudged = 0;
  for (const post of stale ?? []) {
    // Conditional update: only the sweep that flips ask_nudged_at from null
    // sends the notification, so concurrent runs can't double-nudge.
    const { data: updated, error: updateError } = await admin
      .from('posts')
      .update({ ask_nudged_at: now.toISOString() })
      .eq('id', post.id)
      .is('ask_nudged_at', null)
      .select('id');
    if (updateError) {
      throw new Error(`stale-ask nudge update failed: ${updateError.message}`);
    }
    if (!updated || updated.length === 0) continue; // another sweep got there first

    nudged += 1;
    await insertNotification(admin, {
      userId: post.author_user_id,
      type: 'ask_stale',
      entityType: 'post',
      entityId: post.id,
      payload: { days: ASK_NUDGE_AFTER_DAYS },
    });
  }

  return nudged;
}

/**
 * Close polls whose deadline has passed (Seq 14: 1–7 day window, auto-close).
 * A single conditional UPDATE — already-closed polls (including author early
 * closes) don't match, so the sweep is naturally idempotent. Returns the
 * number of polls closed by this run.
 */
export async function closeDuePolls(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<number> {
  const { data, error } = await admin
    .from('posts')
    .update({ poll_status: 'closed' })
    .eq('type', 'poll')
    .eq('poll_status', 'open')
    .not('poll_closes_at', 'is', null)
    .lt('poll_closes_at', now.toISOString())
    .select('id');
  if (error) throw new Error(`poll auto-close sweep failed: ${error.message}`);

  return data?.length ?? 0;
}
