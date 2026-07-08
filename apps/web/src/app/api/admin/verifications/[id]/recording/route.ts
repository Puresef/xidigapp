import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireVerifier } from '@/lib/auth/guards';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * §14 access-logged recording read. A recording is the most sensitive artifact
 * in the app (a member's face + voice), so it lives behind requireVerifier and
 * every fetch writes a verification_access_log row BEFORE the URL is returned —
 * the log is the accountability record, so it must not be skippable by an early
 * return. No recording on file → 404.
 */

const idSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const verifier = await requireVerifier();
    const parsedId = idSchema.safeParse((await context.params).id);
    if (!parsedId.success) throw new ApiError('not_found', 404);
    const id = parsedId.data;

    const admin = getSupabaseAdmin();
    const { data: verification, error: loadError } = await admin
      .from('verifications')
      .select('id, recording_url')
      .eq('id', id)
      .maybeSingle();
    if (loadError) throw new Error(`recording load failed: ${loadError.message}`);
    if (!verification || !verification.recording_url) throw new ApiError('not_found', 404);

    // Log the access BEFORE handing over the URL (§14 accountability).
    const { error: logError } = await admin.from('verification_access_log').insert({
      verification_id: id,
      accessed_by_user_id: verifier.appUser.id,
      access_type: 'recording_view',
    });
    if (logError) throw new Error(`access log write failed: ${logError.message}`);

    return apiOk({ recordingUrl: verification.recording_url });
  } catch (error) {
    return handleApiError(error);
  }
}
