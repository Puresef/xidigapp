import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums } from '@xidig/db';

import { sendPushToUser } from '@/lib/push/send';

import { isChannelEnabled, isQuietHours } from './prefs';
import { NOTIFICATION_CHANNELS, type NotificationType } from './types';

/**
 * In-app notification writes + §26 channel dispatch. Best-effort like
 * lib/audit.ts: a notification must never fail the action that caused it.
 *
 * `insertNotification` writes the row only (in-app channel). `notify` also
 * fires the generic payload-less push when the §26 matrix says to (reply,
 * mention, new_dm, dm_request). The EMAIL channel is contextual (it needs
 * subject/sender copy) so it is sent at the call site with a proper template,
 * gated on NOTIFICATION_CHANNELS[type].email.
 */

export interface NotificationInput {
  userId: string;
  actorUserId?: string | null;
  type: NotificationType;
  entityType?: Enums<'entity_type'>;
  entityId?: string;
  payload?: Record<string, unknown>;
  /** §22 smart bundling — grouped at read time (lib/notifications/bundle.ts). */
  bundleKey?: string;
}

export async function insertNotification(
  admin: SupabaseClient<Database>,
  input: NotificationInput,
): Promise<void> {
  const { error } = await admin.from('notifications').insert({
    user_id: input.userId,
    actor_user_id: input.actorUserId ?? null,
    type: input.type,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: (input.payload ?? {}) as never,
    bundle_key: input.bundleKey ?? null,
  });

  if (error) {
    console.error('[notify] failed to record notification:', error.message);
  }
}

/**
 * Record the in-app row AND deliver the push channel per §26. Use this for
 * anything push-worthy (DMs, mentions, replies). Skips self-notifications
 * (notifying yourself about your own action is noise). Marks `pushed_at` best
 * effort so the inbox can show "delivered".
 */
export async function notify(
  admin: SupabaseClient<Database>,
  input: NotificationInput,
): Promise<void> {
  if (input.actorUserId && input.actorUserId === input.userId) return;

  await insertNotification(admin, input);

  // §26 + Phase 4.5 prefs: the type must be push-capable, the member must
  // not have turned push off for it, and their quiet hours must not be on.
  // The in-app row above is ALWAYS written — prefs gate delivery channels only.
  if (NOTIFICATION_CHANNELS[input.type].push) {
    const [pushEnabled, quiet] = await Promise.all([
      isChannelEnabled(admin, input.userId, input.type, 'push'),
      isQuietHours(admin, input.userId),
    ]);
    if (pushEnabled && !quiet) {
      await sendPushToUser(admin, input.userId);
    }
  }
}
