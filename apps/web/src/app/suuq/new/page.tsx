import { redirect } from 'next/navigation';

import { ListingForm } from '@/components/suuq/listing-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getCategories } from '@/lib/categories';
import { getLocale, getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Add a business listing (§18 pin-drop create — the Abuur target in Phase 1).
 * Low-bandwidth mode swaps the pick-map for manual coordinates (§22).
 */
export default async function NewListingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/suuq/new');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const locale = await getLocale();
  const lowBandwidth = await getLowBandwidth();
  const categories = await getCategories(ctx.supabase, locale);

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('suuq.newListingTitle')}</h1>
      <ListingForm categories={categories} lowBandwidth={lowBandwidth} />
    </main>
  );
}
