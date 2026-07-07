import { apiOk, ApiError, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { ensureMediaBucket, publicMediaUrl } from '@/lib/media/storage';
import {
  isMediaKind,
  TranscodeError,
  transcodeMediaKind,
  type MediaKind,
} from '@/lib/media/transcode';
import { getModerationProvider } from '@/lib/moderation/provider';
import { IMAGE_MAX_BYTES, MEDIA_BUCKET } from '@/lib/plaza/constants';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import type { Json } from '@xidig/db';

/**
 * POST /api/media — direct image upload (§15/§26; generalized for every media
 * kind in Phase 4.5: post, avatar, cover, listing_photo, space_icon,
 * space_cover, candidate_logo, candidate_cover, block).
 *
 * Pipeline: multipart `file` (≤5MB) + optional `kind` (default `post`) +
 * optional `alt` → sharp transcode to WebP per kind (EXIF/GPS stripped by
 * re-encode, real format sniffed from bytes; also yields a small thumb WebP
 * and a blurhash) → SYNCHRONOUS AI pre-scan (unlike text, a flagged image is
 * never stored — §15, same scan for all kinds) → Supabase Storage under
 * `{userId}/{uuid}.webp` (+ `{userId}/{uuid}_thumb.webp`) → media_uploads row
 * the attach surfaces later claim (posts.imageIds, profile avatar/cover,
 * listing photos, Space icon/cover).
 *
 * `alt` is REQUIRED for listing_photo (accessibility is part of the listing
 * contract, §18) and auto-filled with the display name for avatars.
 *
 * Writes go through the service role: media_uploads has no client RLS write
 * policies (deliberate — the pre-scan and rate limit above ARE the authz).
 */

const RATE_LIMIT = { max: 30, windowSeconds: 3600 };

const ALT_TEXT_MAX = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError('invalid_request', 400);
    // Pre-transcode cap: refuse oversized originals before decoding them.
    if (file.size > IMAGE_MAX_BYTES) throw new ApiError('image_too_large', 413);

    const rawKind = form.get('kind');
    if (rawKind !== null && typeof rawKind !== 'string') throw new ApiError('invalid_request', 400);
    const kind: MediaKind =
      rawKind === null || rawKind === ''
        ? 'post'
        : (() => {
            if (!isMediaKind(rawKind)) throw new ApiError('invalid_request', 400);
            return rawKind;
          })();

    const rawAlt = form.get('alt');
    if (rawAlt !== null && typeof rawAlt !== 'string') throw new ApiError('invalid_request', 400);
    let altText = (rawAlt ?? '').trim().slice(0, ALT_TEXT_MAX) || null;
    // §18: a listing photo without a description is not attachable.
    if (kind === 'listing_photo' && !altText) throw new ApiError('image_alt_required', 400);

    await enforceRateLimit(`media:${ctx.appUser.id}`, RATE_LIMIT);

    const input = Buffer.from(await file.arrayBuffer());

    let webp;
    try {
      webp = await transcodeMediaKind(input, kind);
    } catch (error) {
      if (error instanceof TranscodeError) {
        throw error.reason === 'too_large'
          ? new ApiError('image_too_large', 413)
          : new ApiError('image_invalid', 400);
      }
      throw error;
    }

    // §15: image scan is synchronous and blocking — flag → store NOTHING.
    // Provider errors resolve to 'skipped' internally (fail-open).
    const verdict = await getModerationProvider().scanImage(webp.buffer, 'image/webp');
    if (verdict.decision === 'flag') throw new ApiError('image_moderation_blocked', 422);
    const scanStatus =
      verdict.decision === 'allow'
        ? ('passed' as const)
        : verdict.decision === 'uncertain'
          ? ('uncertain' as const)
          : ('skipped' as const);

    const admin = getSupabaseAdmin();
    await ensureMediaBucket(admin);

    // Avatar alt defaults to the member's display name (§22 — screen readers
    // announce the person, not "image"). Best-effort: no profile yet → null.
    if (kind === 'avatar' && !altText) {
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('user_id', ctx.appUser.id)
        .maybeSingle();
      altText = profile?.display_name ?? null;
    }

    const objectId = crypto.randomUUID();
    const path = `${ctx.appUser.id}/${objectId}.webp`;
    const thumbPath = `${ctx.appUser.id}/${objectId}_thumb.webp`;

    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, webp.buffer, { contentType: 'image/webp' });
    if (uploadError) throw new Error(`media upload failed: ${uploadError.message}`);

    const { error: thumbError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(thumbPath, webp.thumbBuffer, { contentType: 'image/webp' });
    if (thumbError) throw new Error(`media thumb upload failed: ${thumbError.message}`);

    const { data: media, error: insertError } = await admin
      .from('media_uploads')
      .insert({
        owner_user_id: ctx.appUser.id,
        storage_path: path,
        thumb_path: thumbPath,
        kind,
        alt_text: altText,
        blurhash: webp.blurhash,
        mime_type: 'image/webp',
        bytes: webp.buffer.byteLength,
        width: webp.width,
        height: webp.height,
        scan_status: scanStatus,
        scan_verdict: verdict as unknown as Json,
      })
      .select('id')
      .single();
    if (insertError || !media) {
      throw new Error(`media insert failed: ${insertError?.message ?? 'no row returned'}`);
    }

    // Uncertain → human review queue (Somali lane, §15 HITL); the image stays
    // visible meanwhile. Best-effort: a queue hiccup must not fail the upload.
    if (verdict.decision === 'uncertain') {
      const { error: reviewError } = await admin.from('moderation_reviews').insert({
        entity_type: 'media_upload',
        entity_id: media.id,
        author_user_id: ctx.appUser.id,
        reason: 'ai_uncertain',
        language: verdict.language ?? null,
        content_excerpt: null,
        ai_verdict: verdict as unknown as Json,
      });
      // 23505 = pending review already exists for this entity — fine.
      if (reviewError && reviewError.code !== '23505') {
        console.error('[media] failed to queue moderation review:', reviewError.message);
      }
    }

    return apiOk(
      {
        media: {
          id: media.id,
          url: publicMediaUrl(path),
          thumbUrl: publicMediaUrl(thumbPath),
          storagePath: path,
          kind,
          alt: altText,
          blurhash: webp.blurhash,
          width: webp.width,
          height: webp.height,
          bytes: webp.buffer.byteLength,
          scanStatus,
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
