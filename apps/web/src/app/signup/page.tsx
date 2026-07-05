import { SignUpForm } from '@/components/auth/signup-form';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

// Signup mode drives whether the invite code is required — read per request.
export const dynamic = 'force-dynamic';

/** Join Xidig: invite code (invite-only) or open self-serve (waitlist mode). */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getT();
  const code = typeof params.code === 'string' ? params.code : '';

  // Open-waitlist mode makes the invite optional (self-serve). The server
  // route re-checks the mode — this only tailors the form, never the gate.
  let inviteRequired = true;
  try {
    const { data: mode } = await getSupabaseAdmin().rpc('get_signup_mode');
    inviteRequired = mode !== 'waitlist';
  } catch {
    // Fail closed on the UI: if we can't read the mode, keep the invite
    // required (the API gate is authoritative regardless).
  }

  return (
    <main className="xidig-auth">
      <h1 className="xidig-auth__title">{t('auth.signUpTitle')}</h1>
      <SignUpForm initialCode={code} inviteRequired={inviteRequired} />
    </main>
  );
}
