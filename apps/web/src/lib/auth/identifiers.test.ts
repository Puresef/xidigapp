import { describe, expect, it } from 'vitest';

import { E164_REGEX, emailSchema, normalizePhone, phoneForGoTrue } from './identifiers';

describe('normalizePhone', () => {
  it('accepts strict E.164 as-is', () => {
    expect(normalizePhone('+252612345678')).toBe('+252612345678');
  });

  it('strips human formatting (spaces, dashes, parens, dots)', () => {
    expect(normalizePhone('+252 61 234-5678')).toBe('+252612345678');
    expect(normalizePhone('+1 (415) 555.0132')).toBe('+14155550132');
  });

  it('converts 00 international prefix to +', () => {
    expect(normalizePhone('00252612345678')).toBe('+252612345678');
  });

  it('rejects numbers without a country code', () => {
    expect(normalizePhone('0612345678')).toBeNull();
    expect(normalizePhone('612345678')).toBeNull();
  });

  it('rejects garbage, letters, and out-of-range lengths', () => {
    expect(normalizePhone('+2526x2345678')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('+12345')).toBeNull(); // too short
    expect(normalizePhone('+1234567890123456')).toBeNull(); // > 15 digits
    expect(normalizePhone('+0252612345678')).toBeNull(); // leading zero after +
  });

  it('normalised output always matches the users.phone CHECK regex', () => {
    for (const input of ['+252 61 234 5678', '0044 20 7946 0958', '+14155550132']) {
      const result = normalizePhone(input);
      expect(result).not.toBeNull();
      expect(result!).toMatch(E164_REGEX);
    }
  });
});

describe('phoneForGoTrue', () => {
  it('strips the leading + (GoTrue stores bare digits)', () => {
    expect(phoneForGoTrue('+252612345678')).toBe('252612345678');
  });
});

describe('emailSchema', () => {
  it('trims and lowercases (canonical identifiers, §9 one account)', () => {
    expect(emailSchema.parse('  User@Example.COM ')).toBe('user@example.com');
  });

  it('rejects non-emails', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrow();
    expect(() => emailSchema.parse('a@b')).toThrow();
  });
});
