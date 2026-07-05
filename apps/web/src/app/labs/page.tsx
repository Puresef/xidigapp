import { ComingSoon } from '@/components/coming-soon';
import { getT } from '@/lib/locale';

// Labs (Warshad/Koox spaces) ship in Phase 4 — locked state until then (Seq 29).
export default async function LabsPage() {
  const t = await getT();
  return <ComingSoon title={t('nav.labs')} />;
}
