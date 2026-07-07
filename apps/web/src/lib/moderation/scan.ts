import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { insertNotification } from '@/lib/plaza/notify';

import { getModerationProvider, type ModerationVerdict } from './provider';

/**
 * Post-publish text scanning (§15 AI pre-scan + HITL queue).
 *
 * Text content publishes immediately and is scanned asynchronously (routes
 * call this via next/server `after()`, like analytics emit):
 *
 *   allow / skipped → nothing to do
 *   uncertain       → stays published, queued for a human (Somali lane)
 *   flag            → auto-hidden + queued; a human confirms or restores.
 *                     The author keeps seeing their own post (RLS) with an
 *                     "awaiting review" banner and gets a notification.
 *
 * Never throws — a scanner problem must not break the request that spawned it.
 */

export interface ScanTarget {
  entityType: 'post' | 'comment';
  entityId: string;
  authorUserId: string;
  text: string;
}

const EXCERPT_MAX = 500;

async function upsertPendingReview(
  admin: SupabaseClient<Database>,
  target: ScanTarget,
  reason: 'ai_flagged' | 'ai_uncertain',
  verdict: ModerationVerdict,
): Promise<void> {
  // One pending review per entity (partial unique index). Partial indexes
  // aren't PostgREST upsert targets, so: refresh an existing pending row,
  // else insert a fresh one (re-scans after edits reuse the open row).
  const { data: existing } = await admin
    .from('moderation_reviews')
    .select('id')
    .eq('entity_type', target.entityType)
    .eq('entity_id', target.entityId)
    .eq('status', 'pending')
    .maybeSingle();

  const fields = {
    reason,
    language: verdict.language ?? null,
    content_excerpt: target.text.slice(0, EXCERPT_MAX),
    ai_verdict: verdict as unknown as never,
  };

  if (existing) {
    await admin.from('moderation_reviews').update(fields).eq('id', existing.id);
    return;
  }

  const { error } = await admin.from('moderation_reviews').insert({
    entity_type: target.entityType,
    entity_id: target.entityId,
    author_user_id: target.authorUserId,
    ...fields,
  });
  // 23505 = lost a race against a concurrent scan of the same entity — fine.
  if (error && error.code !== '23505') {
    console.error('[moderation] failed to queue review:', error.message);
  }
}

export async function scanTextContent(
  admin: SupabaseClient<Database>,
  target: ScanTarget,
): Promise<void> {
  try {
    const verdict = await getModerationProvider().scanText(target.text);
    if (verdict.decision === 'allow' || verdict.decision === 'skipped') return;

    await upsertPendingReview(
      admin,
      target,
      verdict.decision === 'flag' ? 'ai_flagged' : 'ai_uncertain',
      verdict,
    );

    if (verdict.decision !== 'flag') return;

    // Auto-hide pending the human decision — but never resurrect content a
    // mod/author already removed.
    const table = target.entityType === 'post' ? 'posts' : 'comments';
    const { error } = await admin
      .from(table)
      .update({ status: 'hidden' })
      .eq('id', target.entityId)
      .eq('status', 'published');
    if (error) {
      console.error('[moderation] failed to hide flagged content:', error.message);
      return;
    }

    await insertNotification(admin, {
      userId: target.authorUserId,
      type: 'moderation_hold',
      entityType: target.entityType,
      entityId: target.entityId,
    });
  } catch (error) {
    console.error('[moderation] text scan pipeline failed:', error);
  }
}
