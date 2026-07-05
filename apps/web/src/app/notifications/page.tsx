import { ComingSoon } from '@/components/coming-soon';
import { getT } from '@/lib/locale';

// Digniino / notification delivery ships in Phase 3 — locked state until then (Seq 29).
export default async function NotificationsPage() {
  const t = await getT();
  return <ComingSoon title={t('nav.notifications')} />;
}
