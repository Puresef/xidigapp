import { z } from 'zod';

import { ApiError, apiError, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { VOICE_SIGNED_URL_TTL_SECONDS } from '@/lib/dm/constants';
import { loadConversationForUser } from '@/lib/dm/service';
import { DM_MEDIA_BUCKET } from '@/lib/media/storage';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/conversations/[id]/voice/[uploadId] — the ONLY way DM audio is
 * served. The dm-media bucket is private with zero storage policies, so
 * every byte flows through this gate:
 *
 *   1. caller is a participant of the conversation (else 404 — existence
 *      never leaks);
 *   2. the upload is a voice note attached to a NON-deleted message of THIS
 *      conversation (moderation soft-delete kills playback too);
 *   3. a short-lived signed URL is minted and the request 307-redirects —
 *      <audio src> follows it transparently.
 */

const paramsSchema = z.object({ id: z.string().uuid(), uploadId: z.string().uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; uploadId: string }> },
): Promise<Response> {
  try {
    const ctx = await requireUser();
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) throw new ApiError('not_found', 404);

    const admin = getSupabaseAdmin();
    const convo = await loadConversationForUser(admin, parsed.data.id, ctx.appUser.id);
    if (!convo) throw new ApiError('not_found', 404);

    const { data: message } = await admin
      .from('messages')
      .select('id, deleted_at, voice_upload_id, conversation_id')
      .eq('conversation_id', parsed.data.id)
      .eq('voice_upload_id', parsed.data.uploadId)
      .maybeSingle();
    if (!message || message.deleted_at !== null) throw new ApiError('not_found', 404);

    const { data: upload } = await admin
      .from('media_uploads')
      .select('storage_path, kind, bucket')
      .eq('id', parsed.data.uploadId)
      .maybeSingle();
    if (!upload || upload.kind !== 'voice' || upload.bucket !== DM_MEDIA_BUCKET) {
      throw new ApiError('not_found', 404);
    }

    const { data: signed, error } = await admin.storage
      .from(DM_MEDIA_BUCKET)
      .createSignedUrl(upload.storage_path, VOICE_SIGNED_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) {
      return apiError('server_error', 500);
    }

    return new Response(null, {
      status: 307,
      headers: {
        Location: signed.signedUrl,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
