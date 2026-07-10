import { describe, expect, it } from 'vitest';

import { SEED_LISTINGS, SEED_PLAYBOOKS, SEED_POSTS, SEED_TAGS } from './data';

/**
 * Launch-day density manifest guards (docs/seeding.md "Launch-day density
 * manifest"). The dataset is allowed to grow, but only inside the honesty
 * rules — these tests make the rules structural, so a future expansion that
 * drops a "(demo)" label, references a missing tag/category, or quietly
 * doubles the seed volume fails CI instead of shipping.
 */

/** The 15 migration-seeded listing_categories slugs (20260704000000). */
const LISTING_CATEGORY_SLUGS = new Set([
  'restaurant-food',
  'retail',
  'professional-services',
  'tech-digital',
  'import-export',
  'transport-logistics',
  'beauty-fashion',
  'construction',
  'agriculture',
  'education',
  'health',
  'media-creative',
  'finance',
  'real-estate',
  'travel',
]);

/** Manifest ceilings — "occupied, not crowded". Raising these is a product
 * decision that belongs in docs/seeding.md, not a drive-by data.ts edit. */
const MAX_SEED_POSTS = 12;
const MAX_SEED_LISTINGS = 12;

function assertUnique(values: string[], label: string) {
  expect(new Set(values).size, `${label} must be unique`).toBe(values.length);
}

describe('seed dataset: idempotency keys', () => {
  it('post/listing keys, playbook slugs and tag names are unique', () => {
    assertUnique(
      SEED_POSTS.map((p) => p.key),
      'post keys',
    );
    assertUnique(
      SEED_LISTINGS.map((l) => l.key),
      'listing keys',
    );
    assertUnique(
      SEED_PLAYBOOKS.map((p) => p.slug),
      'playbook slugs',
    );
    assertUnique([...SEED_TAGS], 'tag names');
  });

  it('tags match the tags_name_format CHECK (lowercase slug form)', () => {
    for (const tag of SEED_TAGS) {
      expect(tag).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

describe('seed dataset: honesty rules (no impersonation, clearly demo)', () => {
  it('every post is non-member sourced and self-describes as demo/AI content', () => {
    for (const post of SEED_POSTS) {
      // Never 'member' — seeded content is labelled, earns no reputation,
      // and is excluded from front-door proof (lib/front/organic).
      expect(['seed', 'ai']).toContain(post.source);
      // The body itself discloses what it is, beyond the UI badge.
      expect(post.body, `post ${post.key} must self-describe`).toMatch(/demo|AI-assisted/i);
    }
  });

  it('every listing is generic and visibly demo — never a real business identity', () => {
    for (const listing of SEED_LISTINGS) {
      expect(listing.businessName, `listing ${listing.key}`).toMatch(/\(demo\)$/);
      expect(listing.shortDescription, `listing ${listing.key}`).toMatch(/^Demo listing:/);
    }
  });

  it('no seeded live Labs — Lab density is templates (playbooks) only', () => {
    // Structural: the dataset has no Labs collection at all; playbooks carry
    // charter templates, not activity. If someone adds a SEED_LABS export,
    // this file is where the argument happens.
    for (const playbook of SEED_PLAYBOOKS) {
      expect(playbook.template, `playbook ${playbook.slug}`).toBeTruthy();
    }
  });
});

describe('seed dataset: referential integrity + manifest sizing', () => {
  it('post/listing tags all exist in SEED_TAGS', () => {
    const known = new Set<string>(SEED_TAGS);
    for (const post of SEED_POSTS) {
      for (const tag of post.tags ?? []) {
        expect(known.has(tag), `post ${post.key} references unknown tag ${tag}`).toBe(true);
      }
    }
    for (const listing of SEED_LISTINGS) {
      for (const tag of listing.tags ?? []) {
        expect(known.has(tag), `listing ${listing.key} references unknown tag ${tag}`).toBe(true);
      }
    }
  });

  it('listing categories are real migration-seeded slugs', () => {
    for (const listing of SEED_LISTINGS) {
      expect(
        LISTING_CATEGORY_SLUGS.has(listing.categorySlug),
        `listing ${listing.key} uses unknown category ${listing.categorySlug}`,
      ).toBe(true);
    }
  });

  it('stays within the manifest ceilings (occupied, not crowded)', () => {
    expect(SEED_POSTS.length).toBeLessThanOrEqual(MAX_SEED_POSTS);
    expect(SEED_LISTINGS.length).toBeLessThanOrEqual(MAX_SEED_LISTINGS);
  });
});
