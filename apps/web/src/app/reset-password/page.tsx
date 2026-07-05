import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { getAuthContext } from '@/lib/auth/guards';
import { getT } from '@/lib/locale';

// Session-dependent (request vs update stage) — never static.
export const dynamic = 'force-dynamic';

/**
 * Forgot password (§27: 60-minute email link). Signed out → request form.
 * Signed in (including the recovery session from the emailed link) → the
 * choose-a-new-password form.
 */
export default async function ResetPasswordPage() {
  const t = await getT();
  const ctx = await getAuthContext();
  const stage = ctx ? 'update' : 'request';

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">
        {stage === 'update' ? t('auth.chooseNewPassword') : t('auth.resetTitle')}
      </h1>
      <ResetPasswordForm stage={stage} />
    </main>
  );
}
