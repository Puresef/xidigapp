import { describe, expect, it } from 'vitest';

import {
  decodeCursor,
  decodeListingCursor,
  encodeCursor,
  encodeListingCursor,
  keysetBeforeListing,
  LISTING_CURSOR_PREFIX,
  type ListingCursor,
} from './pagination';

/**
 * Task 11 — versioned directory cursor for the verified-first sort.
 * Contract under test:
 *   1. round-trip: encodeListingCursor → decodeListingCursor is identity;
 *   2. graceful restart: anything that is not a well-formed v2 cursor decodes
 *      to null (never throws) — including OLD unversioned {createdAt,id}
 *      cursors minted before the sort change, so stale clients restart from
 *      page 1 instead of paging a created_at keyset against the new order;
 *   3. keysetBeforeListing walks (is_verified DESC, updated_at DESC, id DESC)
 *      correctly, including the tier boundary (a verified-tier cursor must
 *      still reach the whole unverified tier).
 */

const CURSOR: ListingCursor = {
  verified: true,
  updatedAt: '2026-07-30T10:20:30.123456+00:00',
  id: '22222222-2222-4222-8222-222222222222',
};

describe('listing cursor round-trip', () => {
  it('encodes with the version prefix and decodes back to the same cursor', () => {
    const encoded = encodeListingCursor(CURSOR);
    expect(encoded.startsWith(LISTING_CURSOR_PREFIX)).toBe(true);
    expect(decodeListingCursor(encoded)).toEqual(CURSOR);
  });

  it('round-trips the unverified tier too', () => {
    const cursor: ListingCursor = { ...CURSOR, verified: false };
    expect(decodeListingCursor(encodeListingCursor(cursor))).toEqual(cursor);
  });
});

describe('listing cursor graceful restart', () => {
  it('treats an OLD unversioned {createdAt,id} cursor as no cursor (page 1)', () => {
    const old = encodeCursor({ createdAt: '2026-07-01T00:00:00Z', id: CURSOR.id });
    // sanity: the old decoder still accepts its own shape…
    expect(decodeCursor(old)).not.toBeNull();
    // …but the listing decoder must NOT (no version prefix → restart).
    expect(decodeListingCursor(old)).toBeNull();
  });

  it('treats garbage, empty, and null as no cursor', () => {
    expect(decodeListingCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeListingCursor('')).toBeNull();
    expect(decodeListingCursor(null)).toBeNull();
    expect(decodeListingCursor(undefined)).toBeNull();
  });

  it('rejects a prefixed payload whose fields have the wrong shape', () => {
    const wrongTypes =
      LISTING_CURSOR_PREFIX +
      Buffer.from(JSON.stringify({ verified: 'yes', updatedAt: 1, id: null }), 'utf8').toString(
        'base64url',
      );
    expect(decodeListingCursor(wrongTypes)).toBeNull();

    const oldShapePrefixed =
      LISTING_CURSOR_PREFIX +
      Buffer.from(JSON.stringify({ createdAt: '2026-07-01T00:00:00Z', id: CURSOR.id })).toString(
        'base64url',
      );
    expect(decodeListingCursor(oldShapePrefixed)).toBeNull();
  });

  it('rejects a v2 payload that is not valid base64 JSON', () => {
    expect(decodeListingCursor(`${LISTING_CURSOR_PREFIX}%%%`)).toBeNull();
  });
});

describe('keysetBeforeListing', () => {
  it('from a VERIFIED-tier cursor: same-tier walk plus the whole unverified tier', () => {
    const filter = keysetBeforeListing(CURSOR);
    expect(filter).toBe(
      `and(is_verified.eq.true,updated_at.lt.${CURSOR.updatedAt}),` +
        `and(is_verified.eq.true,updated_at.eq.${CURSOR.updatedAt},id.lt.${CURSOR.id}),` +
        'is_verified.eq.false',
    );
  });

  it('from an UNVERIFIED-tier cursor: same-tier walk only (no tier below)', () => {
    const cursor: ListingCursor = { ...CURSOR, verified: false };
    const filter = keysetBeforeListing(cursor);
    expect(filter).toBe(
      `and(is_verified.eq.false,updated_at.lt.${cursor.updatedAt}),` +
        `and(is_verified.eq.false,updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`,
    );
    expect(filter).not.toContain('is_verified.eq.true');
  });
});
