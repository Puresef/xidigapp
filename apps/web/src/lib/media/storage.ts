import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { env } from '@/env';
import { IMAGE_MAX_BYTES, MEDIA_BUCKET } from '@/lib/plaza/constants';

/**
 * Supabase Storage plumbing for the Plaza media pipeline (§15/§24).
 *
 * The bucket is created lazily at runtime (idempotent, service role) instead
 * of in a migration: the migration harness (embedded Postgres) has no storage
 * schema, and bucket creation is data-plane setup. The bucket is PUBLIC —
 * objects are already-transcoded WebP with EXIF dropped, paths are
 * unguessable UUIDs, and §28's public share pages need the images anyway.
 */

let bucketReady = false;

export async function ensureMediaBucket(admin: SupabaseClient<Database>): Promise<void> {
  if (bucketReady) return;

  const { data } = await admin.storage.getBucket(MEDIA_BUCKET);
  if (data) {
    bucketReady = true;
    return;
  }

  const { error } = await admin.storage.createBucket(MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: IMAGE_MAX_BYTES,
    allowedMimeTypes: ['image/webp'],
  });
  // Lost a create race → the bucket exists; anything else is a real failure.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`media bucket setup failed: ${error.message}`);
  }
  bucketReady = true;
}

/**
 * Thumb object path by pipeline convention: `{userId}/{uuid}.webp` →
 * `{userId}/{uuid}_thumb.webp`. Only valid for Phase 4.5+ uploads
 * (transcodeMediaKind always writes the pair); rows from before then carry
 * `thumb_path = null` and callers must fall back to the main path.
 */
export function derivedThumbPath(storagePath: string): string {
  return storagePath.replace(/\.webp$/, '_thumb.webp');
}

/** Public CDN URL for a stored object path (what posts.image_urls stores). */
export function publicMediaUrl(storagePath: string): string {
  // SKIP_ENV_VALIDATION builds may not have SUPABASE_URL — guard like
  // lib/rate-limit.ts does.
  const base = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL : '';
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}
