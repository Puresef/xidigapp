import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { ApiError } from '@/lib/api';
import type { MediaKind } from '@/lib/media/transcode';

/**
 * Shared attach-time validation for media_uploads rows (Phase 4.5).
 *
 * Uploading (POST /api/media) and attaching (profile avatar/cover, listing
 * photos, Space icon/cover) are separate steps, so every attach surface must
 * re-check the same three facts before denormalizing paths onto the target
 * row: the upload belongs to the caller, it was uploaded AS the kind this
 * surface expects, and its AI pre-scan didn't flag it. Mirrors the imageIds
 * validation in POST /api/posts (media_not_ready 409 on any failure — never
 * reveal WHICH check failed for someone else's media id).
 */

export interface AttachableMedia {
  id: string;
  storage_path: string;
  thumb_path: string | null;
  blurhash: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
}

const USABLE_SCAN_STATUSES = new Set(['passed', 'uncertain', 'skipped']);

/**
 * Load a media_uploads row and 409 (`media_not_ready`) unless it is owned by
 * `userId`, uploaded with one of `expectedKinds`, and scan-clean.
 */
export async function loadAttachableMedia(
  admin: SupabaseClient<Database>,
  userId: string,
  mediaId: string,
  expectedKinds: readonly MediaKind[],
): Promise<AttachableMedia> {
  const { data, error } = await admin
    .from('media_uploads')
    .select(
      'id, owner_user_id, kind, scan_status, storage_path, thumb_path, blurhash, alt_text, width, height, bytes',
    )
    .eq('id', mediaId)
    .maybeSingle();
  if (error) throw new Error(`media attach lookup failed: ${error.message}`);

  const usable =
    data &&
    data.owner_user_id === userId &&
    (expectedKinds as readonly string[]).includes(data.kind) &&
    USABLE_SCAN_STATUSES.has(data.scan_status);
  if (!usable) throw new ApiError('media_not_ready', 409);

  return {
    id: data.id,
    storage_path: data.storage_path,
    thumb_path: data.thumb_path,
    blurhash: data.blurhash,
    alt_text: data.alt_text,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
  };
}
