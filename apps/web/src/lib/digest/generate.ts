import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json, Tables } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { getSeedActorUserId } from '@/lib/seed/actor';
import { createSeededPost } from '@/lib/seed/content';

import { collectDigestCandidates } from './candidates';
import { digestWindow } from './period';
import { renderDigestEmail, renderDigestPost, type DigestEmailTemplate } from './render';

/**
 * Weekly digest generator (PRD §21). Idempotent per ISO week (the
 * digest_editions.period_key unique key): generating twice for the same week
 * returns the existing edition and never creates a second pinned post or a
 * duplicate email.
 *
 * Outputs:
 *   * a PINNED Plaza post (authored by the AI account, source='ai', labelled),
 *   * an email TEMPLATE (payload built; bulk sending is deferred — see the cron
 *     route — until the digest-email channel is safe + configured).
 *
 * Visibility-safe + deterministic + PII-free by construction (candidates.ts).
 * Earns no reputation. `publish=false` stores the candidate snapshot as a
 * 'generated' dry-run without pinning a post.
 */

export interface GenerateDigestOptions {
  now?: Date;
  publish?: boolean;
  appUrl: string;
}

export interface GenerateDigestResult {
  periodKey: string;
  created: boolean;
  edition: Tables<'digest_editions'>;
  email: DigestEmailTemplate;
  pinnedPostId: string | null;
}

export async function generateDigest(
  admin: SupabaseClient<Database>,
  opts: GenerateDigestOptions,
): Promise<GenerateDigestResult> {
  const window = digestWindow(opts.now ?? new Date());
  const publish = opts.publish ?? true;

  const candidates = await collectDigestCandidates(admin, window);
  const email = renderDigestEmail(candidates, opts.appUrl);

  // Idempotency: already have this week's edition → return it, no new post.
  const existing = await admin
    .from('digest_editions')
    .select('*')
    .eq('period_key', window.periodKey)
    .maybeSingle();
  if (existing.error) throw new Error(`digest edition lookup failed: ${existing.error.message}`);
  if (existing.data) {
    return {
      periodKey: window.periodKey,
      created: false,
      edition: existing.data,
      email,
      pinnedPostId: existing.data.pinned_post_id,
    };
  }

  let pinnedPostId: string | null = null;
  if (publish) {
    // Unpin the previous digest post so the weekly-highlights slot doesn't fill
    // up with stale digests.
    const prior = await admin
      .from('digest_editions')
      .select('pinned_post_id')
      .not('pinned_post_id', 'is', null)
      .order('period_start', { ascending: false })
      .limit(1);
    const priorPostId = (prior.data ?? [])[0]?.pinned_post_id;
    if (priorPostId) {
      await admin.from('posts').update({ pinned_at: null }).eq('id', priorPostId);
    }

    const actorUserId = await getSeedActorUserId(admin);
    const { title, body } = renderDigestPost(candidates);
    const post = await createSeededPost(admin, {
      actorUserId,
      source: 'ai',
      dedupKey: `digest:${window.periodKey}`,
      type: 'update',
      title,
      body,
      pinned: true,
    });
    pinnedPostId = post.postId;
  }

  const insert = await admin
    .from('digest_editions')
    .insert({
      period_key: window.periodKey,
      period_start: window.periodStart,
      period_end: window.periodEnd,
      status: publish ? 'published' : 'generated',
      pinned_post_id: pinnedPostId,
      payload: candidates as unknown as Json,
      published_at: publish ? new Date().toISOString() : null,
    })
    .select('*')
    .single();

  // Lost a race with a concurrent cron fire → return the winner's edition.
  if (insert.error) {
    if (insert.error.code === '23505') {
      const raced = await admin
        .from('digest_editions')
        .select('*')
        .eq('period_key', window.periodKey)
        .single();
      if (raced.data) {
        return {
          periodKey: window.periodKey,
          created: false,
          edition: raced.data,
          email,
          pinnedPostId: raced.data.pinned_post_id,
        };
      }
    }
    throw new Error(`digest edition insert failed: ${insert.error.message}`);
  }

  emitServer(event('weekly_digest_generated', {}), { distinctId: 'digest' });
  if (publish) emitServer(event('weekly_digest_published', {}), { distinctId: 'digest' });

  return {
    periodKey: window.periodKey,
    created: true,
    edition: insert.data,
    email,
    pinnedPostId,
  };
}
