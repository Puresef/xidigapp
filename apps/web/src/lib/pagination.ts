import { z } from 'zod';

/**
 * Keyset (cursor) pagination shared by list endpoints (§22 API-first). Keyset
 * over OFFSET so deep pages stay cheap and stable under inserts — the
 * directory grows constantly. The cursor encodes the last row's ordering keys
 * (created_at + a unique tiebreaker id); it's opaque base64url to clients.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE);

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Tolerant decode: a malformed/forged cursor is treated as "no cursor". */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Cursor).createdAt === 'string' &&
      typeof (parsed as Cursor).id === 'string'
    ) {
      return parsed as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * PostgREST `.or()` filter for "strictly before" the cursor under a
 * `created_at desc, id desc` ordering: earlier timestamp, or same timestamp
 * with a smaller id (the stable tiebreaker).
 */
export function keysetBefore(cursor: Cursor, idColumn: string): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},${idColumn}.lt.${cursor.id})`;
}

// ---------------------------------------------------------------------------
// Directory (business listings) cursor — Task 11 verified-first sort.
// Ordering: is_verified DESC, updated_at DESC, id DESC. The cursor is
// VERSIONED (`v2:` prefix) because its shape changed: anything without the
// prefix — including old {createdAt,id} cursors minted before the sort change
// — decodes to null, and the route treats null as "first page". A stale
// load-more therefore restarts cleanly instead of paging a created_at keyset
// against the new order (never a 400, never mixed pages).
// ---------------------------------------------------------------------------

export const LISTING_CURSOR_PREFIX = 'v2:';

export interface ListingCursor {
  /** Tier of the last row (is_verified — verification_status = 'verified'). */
  verified: boolean;
  updatedAt: string;
  id: string;
}

export function encodeListingCursor(cursor: ListingCursor): string {
  return (
    LISTING_CURSOR_PREFIX + Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
  );
}

/** Tolerant decode: no prefix, malformed payload, or wrong shape → null. */
export function decodeListingCursor(raw: string | null | undefined): ListingCursor | null {
  if (!raw || !raw.startsWith(LISTING_CURSOR_PREFIX)) return null;
  try {
    const payload = raw.slice(LISTING_CURSOR_PREFIX.length);
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ListingCursor).verified === 'boolean' &&
      typeof (parsed as ListingCursor).updatedAt === 'string' &&
      typeof (parsed as ListingCursor).id === 'string'
    ) {
      return parsed as ListingCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * PostgREST `.or()` filter for "strictly before" the cursor under
 * `is_verified desc, updated_at desc, id desc`: within the cursor's tier the
 * usual (updated_at, id) walk; from the verified tier the WHOLE unverified
 * tier is still ahead, so it is included as a third arm. From the unverified
 * tier there is no tier below — two arms only. This is what keeps verified
 * rows strictly above unverified ones across page boundaries.
 */
export function keysetBeforeListing(cursor: ListingCursor): string {
  const tier = `is_verified.eq.${cursor.verified}`;
  const walk =
    `and(${tier},updated_at.lt.${cursor.updatedAt}),` +
    `and(${tier},updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`;
  return cursor.verified ? `${walk},is_verified.eq.false` : walk;
}
