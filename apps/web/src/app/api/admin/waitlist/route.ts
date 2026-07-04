import { apiOk, handleApiError } from '@/lib/api';
import { requireRole } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Waitlist queue for the admin surface. Contains non-member PII, so:
 * admin-only, service-role read, never exposed through RLS.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireRole('admin');

    const status = new URL(request.url).searchParams.get('status');
    const admin = getSupabaseAdmin();

    let query = admin
      .from('waitlist_entries')
      .select('id, email, phone, status, invited_at, created_at')
      .order('created_at', { ascending: true })
      .limit(500);
    if (status === 'pending' || status === 'invited' || status === 'joined') {
      query = query.eq('status', status);
    }

    const { data: entries, error } = await query;
    if (error) throw new Error(error.message);

    return apiOk({ entries: entries ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}
