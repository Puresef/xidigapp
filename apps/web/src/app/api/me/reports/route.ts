import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * The reporter's own-status view (§19 "visible outcome"): a member sees the
 * reports THEY filed and where each landed — status + the reporter-facing
 * `resolution` copy, never the internal mod note or any other reporter's
 * identity. Reads run under the caller's RLS (reports_select_own), so this can
 * only ever return the caller's own rows.
 */

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();

    const { data, error } = await ctx.supabase
      .from('reports')
      .select('id, target_type, reason, status, resolution, created_at, resolved_at')
      .eq('reporter_user_id', ctx.appUser.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`reports query failed: ${error.message}`);

    return apiOk({ reports: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
