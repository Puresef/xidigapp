import { describe, expect, it } from 'vitest';

import type { PostView } from '@/lib/plaza/views';

import { assembleFeed, toListingRow } from './hydrate';
import type { FeedSourceRow, LabUpdateFeedItem, ListingFeedItem } from './types';

/**
 * Pure mapping tests for the Following-feed assembly (no DB). The privacy /
 * RLS behavior is proven in packages/db/src/following-feed.test.ts (the view
 * itself); here we prove the API preserves feed ORDER across item types and
 * drops rows whose base row failed to hydrate (never renders a broken card).
 */

function fakePostView(id: string): PostView {
  return {
    post: {
      id,
      author_user_id: 'u1',
      lab_id: null,
      type: 'update',
      title: null,
      body: 'body',
      link_url: null,
      image_urls: [],
      ask_status: null,
      ask_nudged_at: null,
      poll_status: null,
      poll_closes_at: null,
      status: 'published',
      source: 'member',
      pinned_at: null,
      edited_at: null,
      created_at: '2026-07-01T00:00:00Z',
    },
    author: null,
    imageUrls: [],
    images: [],
    link: null,
    tags: [],
    commentCount: 0,
    reactions: { fire: 0, strong: 0, mashallah: 0, idea: 0, watching: 0 },
    myReactions: [],
    poll: null,
    bookmarked: false,
  } as PostView;
}

function fakeUpdate(id: string): LabUpdateFeedItem['update'] {
  return {
    id,
    labId: 'lab1',
    labSlug: 'my-lab',
    labName: 'My Lab',
    spaceMode: 'lab',
    title: 'Weekly update',
    body: 'progress',
    isCrossPost: false,
    createdAt: '2026-07-02T00:00:00Z',
    author: { display_name: 'Amina', handle: 'amina' },
  };
}

function fakeListingItem(id: string): ListingFeedItem {
  return {
    type: 'listing',
    sortTs: '2026-07-03T00:00:00Z',
    listing: {
      id,
      owner_user_id: 'u2',
      business_name: 'Cafe',
      category_id: 'food',
      short_description: null,
      address: null,
      landmark: null,
      latitude: null,
      longitude: null,
      city: null,
      country: null,
      contact_links: null,
      verification_status: 'unverified',
      status: 'published',
      created_at: '2026-07-03T00:00:00Z',
    },
    owner: { display_name: 'Bashir', handle: 'bashir' },
  };
}

describe('assembleFeed', () => {
  it('preserves source order across mixed item types', () => {
    const source: FeedSourceRow[] = [
      { item_type: 'listing', item_id: 'L1', sort_ts: '2026-07-03T00:00:00Z', lab_id: null },
      { item_type: 'lab_update', item_id: 'U1', sort_ts: '2026-07-02T00:00:00Z', lab_id: 'lab1' },
      { item_type: 'post', item_id: 'P1', sort_ts: '2026-07-01T00:00:00Z', lab_id: null },
    ];
    const items = assembleFeed(
      source,
      new Map([['P1', fakePostView('P1')]]),
      new Map([['U1', fakeUpdate('U1')]]),
      new Map([['L1', fakeListingItem('L1')]]),
    );
    expect(items.map((i) => i.type)).toEqual(['listing', 'lab_update', 'post']);
    expect(items[0]).toMatchObject({ type: 'listing' });
    expect(items[1]).toMatchObject({ type: 'lab_update' });
    expect(items[2]).toMatchObject({ type: 'post' });
  });

  it('carries sort_ts from the source row onto post + lab_update items', () => {
    const source: FeedSourceRow[] = [
      { item_type: 'post', item_id: 'P1', sort_ts: '2026-07-09T12:00:00Z', lab_id: null },
      { item_type: 'lab_update', item_id: 'U1', sort_ts: '2026-07-08T12:00:00Z', lab_id: 'lab1' },
    ];
    const items = assembleFeed(
      source,
      new Map([['P1', fakePostView('P1')]]),
      new Map([['U1', fakeUpdate('U1')]]),
      new Map(),
    );
    expect(items[0]).toMatchObject({ type: 'post', sortTs: '2026-07-09T12:00:00Z' });
    expect(items[1]).toMatchObject({ type: 'lab_update', sortTs: '2026-07-08T12:00:00Z' });
  });

  it('skips a source row whose base row failed to hydrate (no broken card)', () => {
    const source: FeedSourceRow[] = [
      { item_type: 'post', item_id: 'P1', sort_ts: '2026-07-01T00:00:00Z', lab_id: null },
      { item_type: 'post', item_id: 'GONE', sort_ts: '2026-07-01T00:00:00Z', lab_id: null },
    ];
    const items = assembleFeed(source, new Map([['P1', fakePostView('P1')]]), new Map(), new Map());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'post' });
  });

  it('returns empty for empty source', () => {
    expect(assembleFeed([], new Map(), new Map(), new Map())).toEqual([]);
  });
});

describe('toListingRow', () => {
  it('resolves primary-photo url + thumb from the storage path', () => {
    const row = toListingRow({
      id: 'L1',
      owner_user_id: 'u2',
      business_name: 'Cafe',
      category_id: 'food',
      short_description: null,
      address: null,
      landmark: null,
      latitude: null,
      longitude: null,
      city: 'Hargeisa',
      country: 'SO',
      contact_links: null,
      verification_status: 'verified',
      status: 'published',
      created_at: '2026-07-03T00:00:00Z',
      price_range: 2,
      opening_hours: null,
      primary_photo_path: 'listings/L1/hero.webp',
      primary_photo_blurhash: 'abc',
      primary_photo_alt: 'Storefront',
      photo_count: 3,
    });
    expect(row.id).toBe('L1');
    expect(row.primary_photo_url).toContain('listings/L1/hero.webp');
    expect(row.primary_photo_thumb_url).toBeTruthy();
    expect(row.primary_photo_thumb_url).not.toBe(row.primary_photo_url);
    expect(row.photo_count).toBe(3);
  });

  it('leaves photo urls null when there is no primary photo', () => {
    const row = toListingRow({
      id: 'L2',
      owner_user_id: null,
      business_name: 'Shop',
      category_id: 'retail',
      short_description: null,
      address: null,
      landmark: null,
      latitude: null,
      longitude: null,
      city: null,
      country: null,
      contact_links: null,
      verification_status: 'unverified',
      status: 'published',
      created_at: '2026-07-03T00:00:00Z',
      price_range: null,
      opening_hours: null,
      primary_photo_path: null,
      primary_photo_blurhash: null,
      primary_photo_alt: null,
      photo_count: null,
    });
    expect(row.primary_photo_url).toBeNull();
    expect(row.primary_photo_thumb_url).toBeNull();
    expect(row.photo_count).toBe(0);
  });
});
