import { describe, expect, it } from 'vitest';

import { listingCreateSchema, listingUpdateSchema, normalizeBusinessName } from './listings';

describe('normalizeBusinessName (duplicate detection, §18)', () => {
  it('is case/punctuation/whitespace insensitive', () => {
    expect(normalizeBusinessName('Hodan  Café & Co.')).toBe('hodan cafe co');
    expect(normalizeBusinessName('HODAN CAFE CO')).toBe('hodan cafe co');
  });

  it('collapses transliteration-adjacent spacing but keeps distinct names distinct', () => {
    expect(normalizeBusinessName('Maxamed Traders')).not.toBe(
      normalizeBusinessName('Mohamed Traders'),
    );
  });
});

describe('listingCreateSchema', () => {
  it('requires a name and a category uuid, defaults contact_links and force', () => {
    const parsed = listingCreateSchema.parse({
      business_name: '  Berbera Exports ',
      category_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed).toMatchObject({
      business_name: 'Berbera Exports',
      contact_links: [],
      force: false,
    });
  });

  it('rejects a non-uuid category and out-of-range coordinates', () => {
    expect(listingCreateSchema.safeParse({ business_name: 'X', category_id: 'nope' }).success).toBe(
      false,
    );
    expect(
      listingCreateSchema.safeParse({
        business_name: 'X',
        category_id: '11111111-1111-4111-8111-111111111111',
        latitude: 200,
      }).success,
    ).toBe(false);
  });
});

describe('listingUpdateSchema', () => {
  it('accepts a partial edit', () => {
    expect(listingUpdateSchema.safeParse({ short_description: 'now open' }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(listingUpdateSchema.safeParse({}).success).toBe(false);
  });
});
