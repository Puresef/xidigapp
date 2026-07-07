/**
 * Phase 2 kept the notification helper here; Phase 3 (Fariimo) generalised it
 * into lib/notifications with the §26 channel matrix + push dispatch. This
 * module re-exports the inserter so the Phase 2 call sites (comment reply, ask
 * credit, stale-Ask nudge, moderation outcomes) keep importing from here
 * unchanged.
 */

export { insertNotification, notify, type NotificationInput } from '@/lib/notifications/notify';
