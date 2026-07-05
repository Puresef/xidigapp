import { SignUpForm } from '@/components/auth/signup-form';
import { getT } from '@/lib/locale';

/** Join Xidig (beta): invite code + any of the three sign-in methods. */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getT();
  const code = typeof params.code === 'string' ? params.code : '';

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('auth.signUpTitle')}</h1>
      <SignUpForm initialCode={code} />
    </main>
  );
}
