import type { Locale } from '@xidig/i18n';

/**
 * Best-effort sync of the language choice to `users.preferred_language` so it
 * follows a signed-in member across devices (RLS: own row only; the column is
 * in the self-service column grant). Signed-out or offline, the locale cookie
 * alone carries the preference — so failures here are logged, never surfaced.
 *
 * supabase-browser is imported DYNAMICALLY: LanguageToggle mounts in the
 * signed-out front-door header, and a static import here was the last thing
 * dragging @supabase/auth-js into the anonymous bundle (front-door §6 budget).
 * The chunk now loads only when a language switch actually happens.
 */
export async function persistPreferredLanguage(locale: Locale): Promise<void> {
  try {
    const { createClient } = await import('./supabase-browser');
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    const { error } = await supabase
      .from('users')
      .update({ preferred_language: locale })
      .eq('id', userId);
    if (error) {
      console.warn(`[i18n] could not persist language preference: ${error.message}`);
    }
  } catch {
    // Missing env or no network: the cookie already persisted the choice on
    // this device.
  }
}
