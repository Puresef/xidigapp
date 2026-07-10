import { describe, expect, it } from 'vitest';

import {
  externalListingCreateSchema,
  externalPostCreateSchema,
} from './schemas';
import { externalDedupKey } from './write';

/**
 * External write validation + idempotency-key derivation (PRD §21). Strict
 * validation is the first gate on every external write; the dedup key is what
 * makes retries safe.
 */

describe('external post schema', () => {
  it('accepts a valid post and defaults source to seed', () => {
    const parsed = externalPostCreateSchema.parse({ type: 'win', body: 'we shipped' });
    expect(parsed.source).toBe('seed');
  });

  it('rejects an unknown post type and a missing body', () => {
    expect(externalPostCreateSchema.safeParse({ type: 'poll', body: 'x' }).success).toBe(false);
    expect(externalPostCreateSchema.safeParse({ type: 'win' }).success).toBe(false);
  });

  it('never lets an external caller claim member source', () => {
    // 'member' is not in the seed|ai enum → rejected.
    expect(
      externalPostCreateSchema.safeParse({ type: 'win', body: 'x', source: 'member' }).success,
    ).toBe(false);
  });
});

describe('external listing schema', () => {
  it('requires a name and a category slug', () => {
    expect(externalListingCreateSchema.safeParse({ businessName: 'A' }).success).toBe(false);
    expect(
      externalListingCreateSchema.safeParse({ businessName: 'A', category: 'finance' }).success,
    ).toBe(true);
  });
});

describe('externalDedupKey', () => {
  it('namespaces by api key + client idempotency key', () => {
    expect(externalDedupKey('key-1', 'abc', {})).toBe('ext:key-1:abc');
    // Different keys never collide even with the same client id.
    expect(externalDedupKey('key-2', 'abc', {})).toBe('ext:key-2:abc');
  });

  it('falls back to a stable content hash when no key is given', () => {
    const a = externalDedupKey('key-1', undefined, { body: 'hello' });
    const b = externalDedupKey('key-1', undefined, { body: 'hello' });
    const c = externalDedupKey('key-1', undefined, { body: 'different' });
    expect(a).toBe(b); // identical content → identical key → idempotent retry
    expect(a).not.toBe(c);
    expect(a.startsWith('ext:key-1:auto:')).toBe(true);
  });
});
