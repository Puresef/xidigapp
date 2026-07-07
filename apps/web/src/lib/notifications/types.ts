/**
 * Notification type registry + the §26 delivery-channel matrix.
 *
 * `notifications.type` is TEXT in the schema (app-level constants — new kinds
 * every release must not need a migration). This module is the single source
 * of truth for the kinds the app writes and which of the three channels each
 * one uses. Bundling (§22) groups by (type, bundle_key) at read time
 * (lib/notifications/bundle.ts).
 *
 * §26 Notification matrix:
 *   in-app = EVERYTHING (every row is an in-app notification)
 *   email  = DM requests, candidate status changes, weekly digest
 *   push   = DMs, mentions, replies
 */

export const NOTIFICATION_TYPES = [
  // Phase 2 (Plaza) — in-app only until Phase 3 lights up the push channel.
  'reply',
  'ask_credited',
  'ask_stale',
  'moderation_hold',
  'moderation_removed',
  // Phase 3 (Fariimo) — DMs, notifications, mentions.
  'dm_request',
  'dm_accepted',
  'new_dm',
  'mention',
  // Channel capability only in Phase 3 (§26 email = candidate status). Capital
  // (Phase 5) is what actually emits this — Phase 3 just wires the channel.
  'candidate_status',
  // Phase 4 (Labs) — all in-app only (§26: no lab-specific email/push; a
  // @mention inside a Space update reuses the 'mention' type, which does push).
  'lab_update',
  'lab_join_request',
  'lab_join_response',
  'lab_promoted',
  'lab_dormant',
  'lab_skill_gap',
  'lab_collab_invite',
  'lab_collab_response',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationChannels {
  /** In-app is always true (every notification is a row); listed for clarity. */
  inApp: true;
  /** §26 email channel. */
  email: boolean;
  /** §26 PWA push channel. */
  push: boolean;
}

/**
 * Per-type channel routing. In-app is implicit-true for all. `email` copy is
 * contextual and sent at the call site (it needs sender/subject detail); the
 * flag here documents intent and gates the dispatch. `push` is a generic,
 * payload-less "new activity" tickle (privacy-preserving — no message body
 * leaves the server), so it can be fired generically from `notify()`.
 */
export const NOTIFICATION_CHANNELS: Record<NotificationType, NotificationChannels> = {
  reply: { inApp: true, email: false, push: true },
  mention: { inApp: true, email: false, push: true },
  new_dm: { inApp: true, email: false, push: true },
  dm_request: { inApp: true, email: true, push: true },
  dm_accepted: { inApp: true, email: false, push: false },
  candidate_status: { inApp: true, email: true, push: false },
  ask_credited: { inApp: true, email: false, push: false },
  ask_stale: { inApp: true, email: false, push: false },
  moderation_hold: { inApp: true, email: false, push: false },
  moderation_removed: { inApp: true, email: false, push: false },
  lab_update: { inApp: true, email: false, push: false },
  lab_join_request: { inApp: true, email: false, push: false },
  lab_join_response: { inApp: true, email: false, push: false },
  lab_promoted: { inApp: true, email: false, push: false },
  lab_dormant: { inApp: true, email: false, push: false },
  lab_skill_gap: { inApp: true, email: false, push: false },
  lab_collab_invite: { inApp: true, email: false, push: false },
  lab_collab_response: { inApp: true, email: false, push: false },
};
