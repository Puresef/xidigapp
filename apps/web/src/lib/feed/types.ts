import type { ListingRow } from '@/components/suuq/listing-card';
import type { PostView } from '@/lib/plaza/views';

/**
 * Following feed item types (§13). The unified feed source (`following_feed`
 * view, migration 20260708000000) yields ordered rows of three kinds; the API
 * hydrates each into a rich view and returns a discriminated union so the
 * client can render the right card per kind.
 *
 * Locked for this sprint: posts + lab updates + listings ONLY — no comments /
 * replies (too noisy for a standard feed).
 */

/** One row as it comes back from the `following_feed` source, in feed order. */
export interface FeedSourceRow {
  item_type: 'post' | 'lab_update' | 'listing';
  item_id: string;
  sort_ts: string;
  /** Source lab for lab_update rows (else null) — spares an extra lookup. */
  lab_id: string | null;
}

/** Author byline shared by lab-update cards (posts carry their own author). */
export interface FeedAuthorRef {
  display_name: string;
  handle: string;
}

/** A followed member's / member-Space's Plaza post. */
export interface PostFeedItem {
  type: 'post';
  sortTs: string;
  view: PostView;
}

/** A weekly update from a followed / joined Space (§16). */
export interface LabUpdateFeedItem {
  type: 'lab_update';
  sortTs: string;
  update: {
    id: string;
    labId: string;
    /** Space slug for the permalink, or null if it couldn't be resolved. */
    labSlug: string | null;
    /** Space display name (chrome swaps Warshad/Koox via space_mode). */
    labName: string;
    spaceMode: 'club' | 'lab';
    title: string | null;
    body: string;
    /** True when this update is a cross-post mirror from a linked Space. */
    isCrossPost: boolean;
    createdAt: string;
    author: FeedAuthorRef | null;
  };
}

/** A new published business listing from a followed member. */
export interface ListingFeedItem {
  type: 'listing';
  sortTs: string;
  listing: ListingRow;
  owner: FeedAuthorRef | null;
}

export type FeedItem = PostFeedItem | LabUpdateFeedItem | ListingFeedItem;

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}
