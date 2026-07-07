import type { NotificationType } from './types';

/**
 * Smart notification bundling (§22: "group related notifications instead of
 * individual pings — '3 people reacted to your post · 2 new Lab updates · 1
 * Ask answered'"). Pure + deterministic so it is unit-testable; the API
 * hydrates actors and the UI renders the copy.
 *
 * Rule: notifications sharing a (type, bundle_key) collapse into ONE bundle
 * with a count + the distinct recent actors. A null bundle_key is never
 * bundled — each such notification stands alone (e.g. a DM request is a
 * distinct decision, not a "you have 3 requests" blur, though several DO group
 * into a requests section in the UI). Input is assumed newest-first; output
 * preserves that order by each bundle's most-recent member.
 */

export interface RawNotification {
  id: string;
  type: NotificationType;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  bundleKey: string | null;
  readAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
  actor: { handle: string; displayName: string } | null;
}

export interface NotificationBundle {
  /** Stable key for React + mark-read targeting. */
  id: string;
  type: NotificationType;
  /** Number of source notifications collapsed into this bundle. */
  count: number;
  /** Distinct actors, most-recent-first, capped for display. */
  actors: Array<{ handle: string; displayName: string }>;
  /** Distinct actor count (may exceed actors.length when capped). */
  actorCount: number;
  latestAt: string;
  /** True if ANY notification in the bundle is unread. */
  unread: boolean;
  /** Entity of the most-recent notification (drives the permalink). */
  entityType: string | null;
  entityId: string | null;
  /** Every source notification id — for mark-as-read on the whole bundle. */
  notificationIds: string[];
  /** Most-recent payload (e.g. a message/post excerpt). */
  payload: Record<string, unknown>;
}

const MAX_ACTORS_SHOWN = 3;

export function bundleNotifications(rows: readonly RawNotification[]): NotificationBundle[] {
  const order: string[] = [];
  const bundles = new Map<string, NotificationBundle>();
  const actorIds = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = row.bundleKey ? `${row.type}::${row.bundleKey}` : `id::${row.id}`;

    let bundle = bundles.get(key);
    if (!bundle) {
      bundle = {
        id: key,
        type: row.type,
        count: 0,
        actors: [],
        actorCount: 0,
        latestAt: row.createdAt,
        unread: false,
        entityType: row.entityType,
        entityId: row.entityId,
        notificationIds: [],
        payload: row.payload,
      };
      bundles.set(key, bundle);
      actorIds.set(key, new Set());
      order.push(key);
    }

    bundle.count += 1;
    bundle.notificationIds.push(row.id);
    if (!row.readAt) bundle.unread = true;

    // Rows arrive newest-first, so the first-seen entity/payload is the latest.
    const seenActors = actorIds.get(key)!;
    if (row.actorUserId && row.actor && !seenActors.has(row.actorUserId)) {
      seenActors.add(row.actorUserId);
      bundle.actorCount += 1;
      if (bundle.actors.length < MAX_ACTORS_SHOWN) bundle.actors.push(row.actor);
    }
  }

  return order.map((key) => bundles.get(key)!);
}
