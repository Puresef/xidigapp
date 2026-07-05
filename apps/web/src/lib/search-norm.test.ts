import { describe, expect, it } from 'vitest';

import { normalizeSearchName } from './search-norm';

/**
 * §18 acceptance: "Directory fuzzy search returns results for transliteration
 * variants (e.g. Maxamed / Mohamed)". Variant groups must fold to the same
 * skeleton; the SQL twin (xidig_name_norm) is asserted equivalent in
 * packages/db/src/migrations.test.ts.
 */
describe('normalizeSearchName', () => {
  const variantGroups: string[][] = [
    ['Maxamed', 'Mohamed', 'Mohammed', 'Muhammad', 'maxamed'],
    ['Axmed', 'Ahmed', 'Axmad'],
    ['Cali', 'Ali'],
    ['Cabdullahi', 'Abdullahi', 'Abdulahi'],
    ['Khadiija', 'Khadija'],
    ['Xasan', 'Hassan', 'Hasan'],
    ['Faarax', 'Farah'],
    ['Yuusuf', 'Yusuf'],
    ['Cumar', 'Omar', 'Umar'],
  ];

  it.each(variantGroups.map((group) => [group[0], group] as const))(
    'folds the %s variants together',
    (_label, group) => {
      const folded = new Set(group.map(normalizeSearchName));
      expect(folded.size).toBe(1);
    },
  );

  it('pins the exact skeletons the SQL twin pins (cross-language equivalence)', () => {
    // Mirrored in packages/db/src/migrations.test.ts against xidig_name_norm.
    expect(normalizeSearchName('Maxamed Warsame')).toBe('mahamad warsama');
    expect(normalizeSearchName('maxamed_w')).toBe('mahamad w');
  });

  it('keeps distinct names distinct', () => {
    expect(normalizeSearchName('Maxamed')).not.toBe(normalizeSearchName('Xaliimo'));
    expect(normalizeSearchName('Amina')).not.toBe(normalizeSearchName('Hodan'));
  });

  it('treats separators and case as noise', () => {
    expect(normalizeSearchName('maxamed_a')).toBe(normalizeSearchName('Mohamed A'));
  });

  it('returns an empty string when nothing alphanumeric survives', () => {
    expect(normalizeSearchName('—— !!')).toBe('');
    expect(normalizeSearchName('')).toBe('');
  });

  it('supports substring directory matching after folding', () => {
    const stored = normalizeSearchName('Mohamed Warsame mohamed_w');
    expect(stored.includes(normalizeSearchName('Maxamed'))).toBe(true);
  });
});
