import { ComingSoon } from '@/components/coming-soon';
import { getT } from '@/lib/locale';

// Fariimo / DMs ship in Phase 3 — locked state until then (Seq 29).
export default async function MessagesPage() {
  const t = await getT();
  return <ComingSoon title={t('nav.messages')} />;
}
