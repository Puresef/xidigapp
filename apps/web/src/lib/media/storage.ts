import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

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
  // Deliberately reads the literal NEXT_PUBLIC var instead of importing
  // `@/env`: this module reaches CLIENT bundles (post-card → plaza/views →
  // here), where importing env.ts throws at module evaluation — the full
  // server schema can never validate in the browser (live incident: signed-in
  // home + /plaza + /saved crashed to the error boundary, Sentry
  // JAVASCRIPT-NEXTJS-C). Same rule as supabase-browser.ts: literal property
  // access only (Next.js inlines it at build), no destructuring, no dynamic
  // keys. NEXT_PUBLIC_SUPABASE_URL === SUPABASE_URL by env contract
  // (GO-LIVE §4), and SKIP_ENV_VALIDATION builds may lack it — hence the
  // same '' guard as before.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}
