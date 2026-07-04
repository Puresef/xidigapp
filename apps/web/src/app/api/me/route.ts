import { apiOk, handleApiError } from '@/lib/api';
import { getAuthContext } from '@/lib/auth/guards';

/**
 * Session snapshot for client hydration: account row + password state
 * (drives the §20 set-a-password nudge). `{ user: null }` when signed out —
 * a snapshot request is not an error.
 */
export async function GET(): Promise<Response> {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return apiOk({ user: null });

    const { data: hasPassword } = await ctx.supabase.rpc('has_password');

    const onboarding = (ctx.appUser.onboarding_state ?? {}) as Record<string, unknown>;

    return apiOk({
      user: {
        id: ctx.appUser.id,
        email: ctx.appUser.email,
        emailVerified: Boolean(ctx.user.email_confirmed_at),
        phone: ctx.appUser.phone,
        phoneVerified: Boolean(ctx.user.phone_confirmed_at),
        role: ctx.appUser.role,
        status: ctx.appUser.status,
        preferredLanguage: ctx.appUser.preferred_language,
        hasPassword: Boolean(hasPassword),
        passwordNudgeDismissed: onboarding['passwordNudgeDismissed'] === true,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
