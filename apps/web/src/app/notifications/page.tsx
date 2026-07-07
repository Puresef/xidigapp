import { redirect } from 'next/navigation';

import { NotificationsInbox } from '@/components/notifications/notifications-inbox';
import { PushToggle } from '@/components/pwa/push-toggle';
import { getAuthContext } from '@/lib/auth/guards';
import { loadNotificationInbox } from '@/lib/notifications/inbox';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Digniino — Notifications inbox (§9, §22 bundling, §26 matrix). SSR the first
 * bundled page; the client keeps it live over Realtime. The push opt-in lives
 * here (natural home for "how you get notified").
 */
export default async function NotificationsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/notifications');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const initial = await loadNotificationInbox(ctx.supabase);

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('nav.notifications')}</h1>
      <p className="xidig-card__meta">{t('notif.subtitle')}</p>
      <PushToggle />
      <NotificationsInbox initial={initial} />
    </main>
  );
}
