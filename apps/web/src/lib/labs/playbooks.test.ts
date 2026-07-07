import { describe, expect, it } from 'vitest';

import {
  orderPlaybooks,
  playbookHintKey,
  playbookLabelKey,
  PLAYBOOK_LABEL_KEYS,
  PLAYBOOK_SLUGS,
  type Playbook,
} from './playbooks';

/** Pure playbook-picker helpers (§16 charter starter set). */

const make = (slug: string): Playbook => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  template: {},
});

describe('orderPlaybooks', () => {
  it('sorts fetched rows into the canonical PLAYBOOK_SLUGS order regardless of DB order', () => {
    const shuffled = ['technical', 'community', 'research', 'startup', 'creative', 'local-service'].map(
      make,
    );
    const ordered = orderPlaybooks(shuffled).map((p) => p.slug);
    expect(ordered).toEqual([...PLAYBOOK_SLUGS]);
  });

  it('pushes unknown slugs to the end without dropping them', () => {
    const rows = [make('mystery'), make('startup'), make('community')];
    const ordered = orderPlaybooks(rows).map((p) => p.slug);
    expect(ordered).toEqual(['community', 'startup', 'mystery']);
  });

  it('does not mutate the input array', () => {
    const rows = [make('technical'), make('community')];
    const copy = [...rows];
    orderPlaybooks(rows);
    expect(rows).toEqual(copy);
  });
});

describe('playbookLabelKey', () => {
  it('maps every seeded slug to its dedicated label key', () => {
    for (const slug of PLAYBOOK_SLUGS) {
      expect(playbookLabelKey(slug)).toBe(PLAYBOOK_LABEL_KEYS[slug]);
    }
  });

  it('falls back to the generic key for an unseen slug', () => {
    expect(playbookLabelKey('mystery')).toBe('lab.playbookGeneric');
  });
});

describe('playbookHintKey', () => {
  it('returns a hint key for seeded slugs and null for unseen ones', () => {
    expect(playbookHintKey('startup')).toBe('lab.playbookStartupHint');
    expect(playbookHintKey('mystery')).toBeNull();
  });
});
