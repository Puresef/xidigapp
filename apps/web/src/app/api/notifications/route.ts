import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { loadNotificationInbox } from '@/lib/notifications/inbox';

/**
 * Notification inbox (§9 Notifications; §22 smart bundling). Returns a keyset
 * page of the caller's notifications collapsed into bundles + the unread total
 * for the badge. Copy is rendered client-side per type.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const cursor = new URL(request.url).searchParams.get('cursor');
    const page = await loadNotificationInbox(ctx.supabase, cursor);
    return apiOk(page);
  } catch (error) {
    return handleApiError(error);
  }
}
