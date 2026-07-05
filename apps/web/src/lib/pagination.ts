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
