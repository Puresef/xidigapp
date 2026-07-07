import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Badge counts for the app shell (Checkpoint 4): unread notifications + unread
 * DM conversations. Both RLS-scoped to the caller (notifications via the
 * own-rows policy; DMs via dm_unread_count()'s internal auth.uid()). The nav
 * seeds its badges from here, then keeps them live over Realtime.
 */

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const [{ count: notifications }, { data: dmUnread }] = await Promise.all([
      ctx.supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null),
      ctx.supabase.rpc('dm_unread_count'),
    ]);

    const messages = typeof dmUnread === 'number' ? dmUnread : 0;
    const notif = notifications ?? 0;

    return apiOk({ notifications: notif, messages, total: notif + messages });
  } catch (error) {
    return handleApiError(error);
  }
}
