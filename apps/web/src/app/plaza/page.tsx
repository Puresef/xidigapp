import { ComingSoon } from '@/components/coming-soon';
import { getT } from '@/lib/locale';

// Madal / Plaza ships in Phase 2 — locked state until then (Seq 29).
export default async function PlazaPage() {
  const t = await getT();
  return <ComingSoon title={t('nav.plaza')} />;
}
