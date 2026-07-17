import { SignInForm, type SignInMethod } from '@/components/auth/signin-form';
import { Banner } from '@/components/banner';
import { AnimatedMark } from '@/components/brand/animated-mark';
import { isErrorCode, resolveError } from '@/lib/errors';
import { getT } from '@/lib/locale';
import { safeNextPath } from '@/lib/auth/links';

/**
 * Sign in — three co-equal methods (§9). ?reason=<code> renders the §27
 * banner (middleware sends session_expired here); ?method preselects a tab;
 * ?next survives the round trip (open-redirect-guarded).
 */

function asMethod(value: string | undefined): SignInMethod {
  return value === 'magic-link' || value === 'sms' ? value : 'password';
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getT();

  const reason = typeof params.reason === 'string' ? params.reason : undefined;
  const method = asMethod(typeof params.method === 'string' ? params.method : undefined);
  const next = safeNextPath(typeof params.next === 'string' ? params.next : undefined);

  const reasonError = isErrorCode(reason) ? resolveError(reason, t) : null;

  return (
    <main className="xidig-auth">
      {/* Entry ritual (mark-redesign spec §4): the mark assembles once above
          the title — scattered → gathered. Named: it stands alone here. */}
      <p className="xidig-auth__mark">
        <AnimatedMark mode="assemble" size={56} label={t('app.name')} />
      </p>
      <h1 className="xidig-auth__title">{t('auth.signInTitle')}</h1>
      {reasonError ? <Banner kind="error">{reasonError.message}</Banner> : null}
      <SignInForm initialMethod={method} next={next} />
    </main>
  );
}
