import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { hydrateMutes } from '@/lib/social/views';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * The caller's mute list (Phase 4.5) — backs the Muted section in
 * Settings → Privacy (components/social/muted-list.tsx). Rows read under RLS
 * (own-rows); labels hydrate via the service role so a Space that has since
 * gone private can still be recognised and unmuted. No pagination: mutes are
 * a personal denylist, capped in practice by the rate limit — one page.
 */

const MUTES_PAGE_CAP = 200;

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data, error } = await ctx.supabase
      .from('mutes')
      .select('entity_type, entity_id, created_at')
      .eq('user_id', ctx.appUser.id)
      .order('created_at', { ascending: false })
      .limit(MUTES_PAGE_CAP);
    if (error) throw new Error(`mutes query failed: ${error.message}`);

    const items = await hydrateMutes(getSupabaseAdmin(), data ?? []);
    return apiOk({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
