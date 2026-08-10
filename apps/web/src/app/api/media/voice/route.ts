import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  VOICE_MAX_BYTES,
  VOICE_MAX_SECONDS,
  VOICE_MIN_SECONDS,
} from '@/lib/dm/constants';
import { DM_MEDIA_BUCKET, ensureDmMediaBucket } from '@/lib/media/storage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * POST /api/media/voice — Fariimo voice-note upload (F2 §4).
 *
 * Deliberately a SEPARATE pipeline from /api/media (images): no transcode,
 * no thumb, no blurhash, no public URL. The container is sniffed from bytes
 * (client mime never trusted — same rule as images): WebM/Opus (Chromium),
 * Ogg/Opus (Firefox), MP4/AAC (Safari). Stored AS-IS in the PRIVATE dm-media
 * bucket; the response carries no URL — playback goes through the
 * participant-checked signed-URL route once the note is attached to a
 * message. Voice is self-recorded by contract (MediaRecorder in the
 * composer); a server can't verify provenance, so the cap that matters is
 * duration ≤120s + 3MB. Audio has no AI scan in P1 → scan_status 'skipped'
 * with an honest verdict marker (moderation reaches audio via the report
 * flow, which soft-deletes the MESSAGE).
 */

const RATE_LIMIT = { max: 30, windowSeconds: 3600 };

// ISO-BMFF major brands MediaRecorder emits for AUDIO on Safari/WebKit.
// A bare 'ftyp' check would also admit HEIC/MOV/video MP4 (review #5);
// brand-gating keeps this best-effort (brands are self-declared), but the
// residual is bounded: private bucket, played via <audio> only, ≤3MB.
const AUDIO_MP4_BRANDS = new Set(['M4A ', 'M4B ', 'mp42', 'iso5', 'isom']);

function sniffAudio(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  if (buffer.length > 4 && buffer.toString('latin1', 0, 4) === 'OggS') {
    return { mime: 'audio/ogg', ext: 'ogg' };
  }
  if (
    buffer.length > 12 &&
    buffer.toString('latin1', 4, 8) === 'ftyp' &&
    AUDIO_MP4_BRANDS.has(buffer.toString('latin1', 8, 12))
  ) {
    return { mime: 'audio/mp4', ext: 'm4a' };
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('invalid_request', 400);
    if (file.size > VOICE_MAX_BYTES) throw new ApiError('voice_too_large', 413);

    const rawDuration = form.get('durationSeconds');
    if (typeof rawDuration !== 'string') throw new ApiError('invalid_request', 400);
    const duration = Math.round(Number(rawDuration));
    if (
      !Number.isFinite(duration) ||
      duration < VOICE_MIN_SECONDS ||
      duration > VOICE_MAX_SECONDS
    ) {
      throw new ApiError('invalid_request', 400);
    }

    await enforceRateLimit(`media:${ctx.appUser.id}`, RATE_LIMIT);

    const input = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffAudio(input);
    if (!sniffed) throw new ApiError('voice_invalid', 400);

    const admin = getSupabaseAdmin();
    await ensureDmMediaBucket(admin, VOICE_MAX_BYTES);

    const objectId = crypto.randomUUID();
    const path = `${ctx.appUser.id}/${objectId}.${sniffed.ext}`;

    const { error: uploadError } = await admin.storage
      .from(DM_MEDIA_BUCKET)
      .upload(path, input, { contentType: sniffed.mime });
    if (uploadError) throw new Error(`voice upload failed: ${uploadError.message}`);

    const { data: media, error: insertError } = await admin
      .from('media_uploads')
      .insert({
        owner_user_id: ctx.appUser.id,
        bucket: DM_MEDIA_BUCKET,
        storage_path: path,
        kind: 'voice',
        mime_type: sniffed.mime,
        bytes: input.byteLength,
        duration_seconds: duration,
        scan_status: 'skipped',
        scan_verdict: { decision: 'skipped', reason: 'audio_unscanned_p1' } as unknown as Json,
      })
      .select('id')
      .single();
    if (insertError || !media) {
      throw new Error(`voice insert failed: ${insertError?.message ?? 'no row returned'}`);
    }

    // No URL in the response — on purpose. The client previews its own local
    // recording; everyone else streams through the conversation route.
    return apiOk(
      {
        media: {
          id: media.id,
          kind: 'voice' as const,
          durationSeconds: duration,
          bytes: input.byteLength,
          mimeType: sniffed.mime,
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
