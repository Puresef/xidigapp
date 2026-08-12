/**
 * Content-script types for the test-community seeder.
 *
 * The dataset in content.ts is expressed in these author-friendly shapes
 * (handles + relative day offsets); run.ts resolves them into rows. All
 * timestamps are "days before the seed run" so the community always looks
 * freshly active no matter when it is seeded.
 */

export type ReactionType = 'fire' | 'strong' | 'mashallah' | 'idea' | 'watching';
export type ThreadType = 'ask' | 'win' | 'update' | 'poll';

export interface SeedReaction {
  handle: string;
  type: ReactionType;
}

export interface SeedComment {
  authorHandle: string;
  body: string;
  daysAgo: number;
  /** Marks this comment as the Ask's credited answer (one per thread). */
  credited?: boolean;
  /** AI helpers author with source 'ai' (labelled in the UI). */
  source?: 'member' | 'ai';
  reactions?: SeedReaction[];
}

export interface SeedPoll {
  options: string[];
  /** Negative = already closed that many days ago. */
  closesInDays: number;
  votes: { handle: string; option: number }[];
}

export interface SeedThread {
  key: string;
  authorHandle: string;
  type: ThreadType;
  title: string | null;
  body: string;
  tags: string[];
  daysAgo: number;
  /** Omitted for non-asks. Defaults to 'answered' when a credited comment exists. */
  askStatus?: 'open' | 'answered';
  poll?: SeedPoll;
  source?: 'member' | 'ai';
  /** Content status for moderation scenarios (default 'published'). */
  status?: 'published' | 'hidden' | 'removed';
  /** Generated post image (rendered via the media pipeline; scene from avatars.ts SCENES). */
  image?: { scene: string; alt: string };
  /** Pinned to the weekly-highlights slot (digest posts). */
  pinned?: boolean;
  comments: SeedComment[];
  reactions: SeedReaction[];
}

export interface SeedLabUpdate {
  labSlug: string;
  authorHandle: string;
  title: string;
  body: string;
  daysAgo: number;
  source?: 'member' | 'ai';
  /** Cross-posted via the accepted collaboration (run.ts resolves the id). */
  collaboration?: boolean;
}

export interface SeedLabArtifact {
  labSlug: string;
  addedByHandle: string;
  title: string;
  url: string;
  description: string;
}

export interface SeedLabDecision {
  labSlug: string;
  createdByHandle: string;
  title: string;
  context: string;
  decision: string;
  daysAgo: number;
}

export interface SeedDmMessage {
  from: string;
  body: string;
  daysAgo: number;
}

export interface SeedDmThread {
  key: string;
  aHandle: string;
  bHandle: string;
  status: 'pending' | 'accepted' | 'blocked';
  messages: SeedDmMessage[];
  /** How many trailing inbound messages the recipient has NOT read. */
  unreadCountForRecipient: number;
  /** Which side is the (partially) unread recipient. */
  unreadSide: 'a' | 'b';
}

export interface SeedListing {
  key: string;
  /** null = unclaimed demo listing (claimable via the §18 flow). */
  ownerHandle: string | null;
  businessName: string;
  categorySlug: string;
  city: string;
  country: string;
  shortDescription: string;
  tags?: string[];
  verified?: boolean;
}

export interface SeedEvent {
  key: string;
  title: string;
  description: string;
  categorySlug: string;
  mode: 'online' | 'in_person' | 'hybrid';
  hostHandle: string;
  labSlug?: string;
  daysFromNow: number;
  capacity?: number;
  venueName?: string;
  venueAddress?: string;
  city?: string;
  rsvps: { handle: string; status: 'going' | 'interested'; showPublicly?: boolean }[];
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'impersonation'
  | 'fraud_or_scam'
  | 'inappropriate_content'
  | 'misinformation'
  | 'other';

export type ModActionKind =
  | 'remove_content'
  | 'restore_content'
  | 'hide_content'
  | 'warn_user'
  | 'suspend_user'
  | 'unsuspend_user'
  | 'dismiss_report'
  | 'other';

export type ModerationTarget =
  | { kind: 'post'; threadKey: string }
  | { kind: 'comment'; threadKey: string; commentIndex: number }
  | { kind: 'message'; dmKey: string; messageIndex: number }
  | { kind: 'lab'; labSlug: string };

/** A full report lifecycle example (report → snapshot → actions → appeal). */
export interface ModerationCase {
  key: string;
  reporterHandle: string;
  target: ModerationTarget;
  reason: ReportReason;
  details: string;
  reportDaysAgo: number;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  assignedToHandle?: string;
  resolution?: string;
  resolvedByHandle?: string;
  resolvedDaysAgo?: number;
  actions?: {
    action: ModActionKind;
    actorHandle: string;
    reason: string;
    daysAgo: number;
    /** In-app notice the affected member receives (plain language, §19). */
    notifyType?: 'moderation_removed' | 'account_warned' | 'account_suspended';
  }[];
  appeal?: {
    body: string;
    status: 'upheld' | 'overturned';
    reviewedByHandle: string;
    decisionNotes: string;
    filedDaysAgo: number;
    decidedDaysAgo: number;
  };
}

/** HITL (§15) queue rows — the AI pre-scan verdict on a specific post. */
export interface HitlReview {
  threadKey: string;
  reason: 'ai_flagged' | 'ai_uncertain';
  language: 'so' | 'en';
  status: 'pending' | 'approved' | 'removed' | 'dismissed';
  reviewedByHandle?: string;
  reviewNote?: string;
  daysAgo: number;
}

export interface SeedCandidateCopy {
  name: string;
  oneLiner: string;
  problem: string;
  solution: string;
  traction: string;
  team: string;
  ask: string;
}
