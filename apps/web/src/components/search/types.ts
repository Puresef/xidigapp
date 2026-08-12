/**
 * The /search API response, mirrored from lib/search-view's projections.
 * Shared by the client shell and the row components so a projection change
 * surfaces as a type error in both places at once.
 */

export interface SearchPerson {
  userId: string;
  displayName: string;
  handle: string;
  /** Member view only — the visitor projection stays identity-only. */
  bio: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  verificationStatus: string;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

export interface SearchListing {
  id: string;
  businessName: string;
  categoryName: { en: string; so: string | null } | null;
  shortDescription: string | null;
  city: string | null;
  country: string | null;
  priceRange: number | null;
  verificationStatus: string;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  photoBlurhash: string | null;
  photoAlt: string | null;
}

export interface SearchLab {
  id: string;
  name: string;
  slug: string;
  spaceMode: string;
  shortDescription: string | null;
  stage: string;
  memberCount: number;
}

export interface SearchPostAuthor {
  displayName: string;
  handle: string;
  locationCity: string | null;
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
  verificationStatus: string;
}

export interface SearchPost {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  /** Whitespace-flattened body head — the row windows it around the match. */
  body: string;
  author: SearchPostAuthor | null;
  tags: { id: string; name: string }[];
  replyCount: number;
}

export interface SearchResults {
  people: SearchPerson[];
  listings: SearchListing[];
  labs: SearchLab[];
  posts: SearchPost[];
}
