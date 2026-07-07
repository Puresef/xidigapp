import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { decodeCursor, encodeCursor, keysetBefore } from '@/lib/pagination';

import { bundleNotifications, type NotificationBundle, type RawNotification } from './bundle';
import type { NotificationType } from './types';

/**
 * Load + bundle a page of the caller's notifications (§22). Shared by the API
 * route and the SSR page so both produce identical bundles. Runs under the
 * caller's RLS-scoped client (notifications_select_own).
 */

export const NOTIFICATION_PAGE_SIZE = 50;

export interface NotificationInboxPage {
  bundles: NotificationBundle[];
  unreadCount: number;
  nextCursor: string | null;
}

export async function loadNotificationInbox(
  supabase: SupabaseClient<Database>,
  rawCursor: string | null = null,
  limit = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationInboxPage> {
  const cursor = decodeCursor(rawCursor);

  let query = supabase
    .from('notifications')
    .select('id, type, actor_user_id, entity_type, entity_id, bundle_key, read_at, created_at, payload')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (cursor) query = query.or(keysetBefore(cursor, 'id'));

  const { data, error } = await query;
  if (error) throw new Error(`notifications failed: ${error.message}`);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

  const actorIds = [...new Set(page.map((r) => r.actor_user_id).filter((v): v is string => !!v))];
  const actors = new Map<string, { handle: string; displayName: string }>();
  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('user_id, handle, display_name')
      .in('user_id', actorIds);
    for (const p of profs ?? []) {
      actors.set(p.user_id, { handle: p.handle ?? '', displayName: p.display_name ?? '' });
    }
  }

  const raw: RawNotification[] = page.map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    actorUserId: r.actor_user_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    bundleKey: r.bundle_key,
    readAt: r.read_at,
    createdAt: r.created_at,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    actor: r.actor_user_id ? (actors.get(r.actor_user_id) ?? null) : null,
  }));

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);

  return { bundles: bundleNotifications(raw), unreadCount: count ?? 0, nextCursor };
}
