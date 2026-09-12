import { redirect } from 'next/navigation';

import { SpaceForm } from '@/components/labs/space-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Create a Space (§16). RSC wrapper — auth-gates, then renders the client form.
 * Opening a new Lab is paused for everyone (Xidig Plus doctrine, owner 12 Sep),
 * so the form shows the Lab option disabled with a neutral note. The API
 * refuses it independently.
 */
export default async function NewSpacePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/labs/new');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('lab.createTitle')}</h1>
      {/* Lab creation is refused to an account in the deletion grace, and
          paused for everyone else while eligibility is under review. */}
      <SpaceForm allowLab={ctx.appUser.status === 'active'} labPaused />
    </main>
  );
}
