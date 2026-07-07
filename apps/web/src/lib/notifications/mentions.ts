import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { parseMentions } from '@/lib/mentions';

import { notify } from './notify';

/**
 * Resolve @handles in a piece of content to members and fan out `mention`
 * notifications (§13). Best-effort — never throws (a mention notification must
 * not fail the post/comment/message that carried it).
 *
 * Guarantees the Phase 3 acceptance list asks for:
 *   - dedup: at most one mention notification per user per event (handles are
 *     deduped by parseMentions; `alreadyNotified` skips users who already got a
 *     more specific notification, e.g. the post author's `reply`);
 *   - privacy: `visibleToUserIds`, when provided, restricts notifications to
 *     users who can actually access the content (used for DMs — only the two
 *     participants; a @mention of a non-participant in a private thread must
 *     not notify them). Plaza posts/comments are member-visible, so callers
 *     omit it.
 */
export async function notifyMentions(
  admin: SupabaseClient<Database>,
  params: {
    text: string;
    actorUserId: string;
    entityType: Enums<'entity_type'>;
    entityId: string;
    bundleKey?: string;
    /** Users who already received a notification for this event — skipped. */
    alreadyNotified?: ReadonlySet<string>;
    /** When set, only these user ids may be notified (content access gate). */
    visibleToUserIds?: ReadonlySet<string>;
  },
): Promise<string[]> {
  const handles = parseMentions(params.text);
  if (handles.length === 0) return [];

  const { data, error } = await admin
    .from('profiles')
    .select('user_id, handle')
    .in('handle', handles);
  if (error || !data) {
    if (error) console.error('[mentions] handle resolution failed:', error.message);
    return [];
  }

  const alreadyNotified = params.alreadyNotified ?? new Set<string>();
  const notified: string[] = [];

  for (const row of data) {
    const targetId = row.user_id;
    if (targetId === params.actorUserId) continue; // no self-mention ping
    if (alreadyNotified.has(targetId)) continue; // dedup vs a more specific notification
    if (params.visibleToUserIds && !params.visibleToUserIds.has(targetId)) continue; // privacy gate
    if (notified.includes(targetId)) continue;

    await notify(admin, {
      userId: targetId,
      actorUserId: params.actorUserId,
      type: 'mention',
      entityType: params.entityType,
      entityId: params.entityId,
      bundleKey: params.bundleKey ?? `mention:${params.entityType}:${params.entityId}`,
    });
    notified.push(targetId);
  }

  return notified;
}
