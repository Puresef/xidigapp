import { redirect } from 'next/navigation';

import { SpaceForm } from '@/components/labs/space-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Create a Space (§16). RSC wrapper — auth-gates, then renders the client form.
 * The Club/Lab choice + Supporter gate for Labs live in the form/API.
 */
export default async function NewSpacePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/labs/new');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('lab.createTitle')}</h1>
      <SpaceForm />
    </main>
  );
}
