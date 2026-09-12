/**
 * Deletion-retention class map: R1a, config only.
 *
 * Owner doctrine (12 Sep 2026; docs/retention-doctrine.md §1–§1a and
 * docs/retention-implementation-plan.md): after FINAL account deletion,
 *   - remove or suppress the deleted member's UGC bodies/media and public
 *     identity from normal product surfaces;
 *   - retain restricted security/trust/dispute/legal metadata for up to
 *     RETENTION_WINDOW_DAYS;
 *   - then purge or further anonymise, unless a documented legal hold,
 *     statutory duty, unresolved safety case or active dispute needs longer.
 *
 * This module is DESIGN AND CONFIGURATION ONLY. Importing it deletes, hides or
 * changes nothing. It makes the policy visible in code, and
 * retention-class-map.test.ts fails when a table, a member-link column, a
 * text/json column, a media kind or an immutability trigger appears without a
 * classification here. That blocks silent drift.
 *
 * NOT A DELETION-COMPLIANCE CLAIM. Suppression (R1b) and any destructive step
 * (R2) are separate, owner-approved and, for R2, legal-reviewed slices. Public
 * media objects remain reachable until the media purge (A5b/R2): a KNOWN
 * RESIDUAL LEAK, recorded in MEDIA_KINDS. The GoTrue phone number has no
 * supported provider erasure path (PROVIDER_METADATA).
 *
 * Kept in @xidig/db (not apps/web): the DB contract test and the app both need
 * it, and packages/db cannot import the web app. Import it from the
 * '@xidig/db/retention' subpath so the map stays out of the browser barrel.
 */

/** The doctrine's one-year window for restricted metadata (owner, 12 Sep). */
export const RETENTION_WINDOW_DAYS = 365;

/**
 * Legal holds (an unresolved safety case, a dispute, a statutory duty) are
 * part of the doctrine, but no mechanism exists yet. The day-365 step (R2)
 * must not be built until this does.
 */
export const LEGAL_HOLD = 'not_implemented' as const;

/**
 * Doctrine classes (docs/retention-doctrine.md §3):
 *   remove     R — body/media removed at final deletion (today only the profile
 *                  scrub and satellite deletes do this; anything more is R2)
 *   suppress   S — withheld from normal surfaces by projection/policy
 *                  (reversible); the row stays as restricted metadata
 *   shell      — kept VISIBLE as a minimal historical shell by an owner ruling
 *                  (C2 events: title, date, status, tombstone host)
 *   restricted M — restricted metadata, at most RETENTION_WINDOW_DAYS
 *   legal      L — longer only with a documented legal/statutory/safety/dispute
 *                  reason (needs LEGAL_HOLD before any purge)
 *   review     ? — owner or legal decision still needed
 *   platform   — not member data: config, taxonomy, platform-authored records
 */
export type RetentionClass =
  'remove' | 'suppress' | 'shell' | 'restricted' | 'legal' | 'review' | 'platform';

/** What a text-like column holds. */
export type ColumnKind =
  | 'ugc' // member-authored words (body, title, bio, note, message)
  | 'media' // a storage path, blurhash or media reference
  | 'pii' // contact or identifying data (email, phone, address, location)
  | 'secret' // credentials, tokens, key material, hashes of them
  | 'derived' // a copy or projection of other content (payloads, snapshots, search text)
  | 'structural'; // type codes, statuses, slugs, taxonomy ids, config

export interface ColumnRule {
  kind: ColumnKind;
  class: RetentionClass;
  note?: string;
}

/** As enforced by forbid_mutation triggers (the contract test checks this). */
export type Mutability = 'mutable' | 'no_update' | 'append_only';

/**
 * Where the retention clock starts:
 *   anonymised_at  — users.anonymised_at (set once at final deletion, kept on re-run)
 *   dispute_closed — max(anonymised_at, reports.resolved_at | appeals.decided_at)
 *   none           — platform data, or no member-driven clock
 */
export type Anchor = 'anonymised_at' | 'dispute_closed' | 'none';

/** Doctrine status of the shipped behaviour for this table. */
export type RetentionStatus =
  | 'aligned' // current behaviour matches the doctrine (the 1-year step may still be missing)
  | 'conflict' // shipped behaviour conflicts; the plan step names the fix
  | 'owner' // needs an owner ruling
  | 'legal' // needs legal review
  | 'n/a'; // platform data

export interface TableRule {
  /** Row-level class: what the doctrine does with the row after final deletion. */
  class: RetentionClass;
  /** Columns holding an FK to public.users (the contract test enforces exactly these). */
  memberLink: readonly string[];
  /** For rows linked to a member only through a parent (or polymorphically). */
  linkedVia?: string;
  /** Text / citext / varchar / json / array columns and what they hold. */
  columns?: Readonly<Record<string, ColumnRule>>;
  /** Platform tables may declare every text column platform-owned at once. */
  allColumns?: 'platform';
  mutability: Mutability;
  anchor: Anchor;
  status: RetentionStatus;
  /**
   * Every signed-in member can read every row (a permissive SELECT policy
   * using(true) for `authenticated`). The contract test requires this flag to
   * match the database, so blanket exposure is never implicit. It detects
   * LITERAL using(true) only: broader predicates (e.g. user_badges'
   * "revoked_at is null or own row") are recorded in the entry's status/note.
   */
  memberReadable?: true;
  /** The plan step that addresses a conflict (docs/retention-implementation-plan.md). */
  plan?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Column shorthands.
const c = (kind: ColumnKind, cls: RetentionClass, note?: string): ColumnRule =>
  note ? { kind, class: cls, note } : { kind, class: cls };
const STRUCT = c('structural', 'restricted');

const UGC_SUPPRESS = c('ugc', 'suppress');
const UGC_REMOVED = c('ugc', 'remove');
const UGC_RESTRICTED = c('ugc', 'restricted');
const UGC_LEGAL = c('ugc', 'legal');
const UGC_REVIEW = c('ugc', 'review');
const PII_REMOVED = c('pii', 'remove');
const PII_SUPPRESS = c('pii', 'suppress');
const PII_RESTRICTED = c('pii', 'restricted');
const PII_LEGAL = c('pii', 'legal');
const SECRET = c('secret', 'restricted');
const MEDIA_REMOVED = c('media', 'remove');
const MEDIA_PUBLIC = c(
  'media',
  'suppress',
  'public post-media object: KNOWN RESIDUAL LEAK until the media purge (A5b/R2)',
);
const DERIVED_RESTRICTED = c('derived', 'restricted');
const DERIVED_LEGAL = c('derived', 'legal');
const DERIVED_REMOVED = c('derived', 'remove');

const R1B_DMS = 'R1b §3.2';
const R1B_SPACE = 'R1b §3.3';
const R1B_EVENTS = 'R1b §3.4';
const R1B_DIGESTS = 'R1b §3.5';
const R1B_SNAPSHOTS = 'R1b §3.6';
const R2 = 'R2 (legal-gated)';

// ---------------------------------------------------------------------------
// The map: every public base table, keyed by name.
export const RETENTION_CLASS_MAP = {
  // --- Identity & auth -------------------------------------------------------
  users: {
    class: 'restricted',
    memberLink: ['id'],
    columns: {
      email: c('pii', 'remove', 'cleared by anonymise_user'),
      phone: c('pii', 'remove', 'cleared by anonymise_user'),
      onboarding_state: STRUCT,
      suspension_reason: c('ugc', 'legal', 'moderator-written moderation record'),
      auth_cleanup_failure: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
    note: 'Row kept (FK target of immutable records) as restricted metadata; no day-365 in-place anonymisation yet. Hard delete is FK-blocked for every self-deleted member.',
  },
  profiles: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: {
      display_name: c('ugc', 'remove', 'tombstoned to "Deleted member"'),
      handle: c('ugc', 'remove', 'set to deleted_<hex>'),
      headline: UGC_REMOVED,
      bio: UGC_REMOVED,
      location_city: PII_REMOVED,
      location_country: PII_REMOVED,
      location_country_code: c('derived', 'remove', 'recomputed from the cleared country'),
      latitude: c('pii', 'remove', 'pinned location; cleared by anonymise_user'),
      longitude: c('pii', 'remove', 'pinned location; cleared by anonymise_user'),
      timezone: PII_REMOVED,
      skills: UGC_REMOVED,
      lanes: UGC_REMOVED,
      links: UGC_REMOVED,
      contact_options: PII_REMOVED,
      avatar_path: MEDIA_REMOVED,
      avatar_blurhash: MEDIA_REMOVED,
      cover_path: MEDIA_REMOVED,
      cover_blurhash: MEDIA_REMOVED,
      membership_tier_id: c('structural', 'restricted', 'billing state; member-readable today'),
      subscription_status: STRUCT,
      search_norm: DERIVED_REMOVED,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
    note: 'Scrubbed to the tombstone and frozen at final deletion (column contract: account-deletion-privacy.test.ts). membership_tier_id is kept and stays member-readable on the tombstone — owner call whether to reset it.',
  },
  auth_email_tokens: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { token_hash: SECRET, email: PII_RESTRICTED, type: STRUCT },
    mutability: 'mutable',
    anchor: 'none',
    status: 'aligned',
    note: 'Purged after 24h, opportunistically (on the next token write), not on a schedule.',
  },
  signup_grants: {
    class: 'restricted',
    memberLink: ['consumed_by_user_id'],
    columns: {
      email: c('pii', 'restricted', 'plaintext; hash/pseudonymise in R2'),
      phone: c('pii', 'restricted', 'plaintext; hash/pseudonymise in R2'),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  waitlist_entries: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'signup_grants.waitlist_entry_id → consumed_by_user_id',
    columns: {
      email: c('pii', 'restricted', 'plaintext; hash/pseudonymise in R2'),
      phone: c('pii', 'restricted', 'plaintext; hash/pseudonymise in R2'),
      source_page: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  email_suppressions: {
    class: 'legal',
    memberLink: [],
    linkedVia: 'email address (no FK)',
    columns: {
      email: c('pii', 'legal', 'deliverability/legal record; plaintext — hash where possible'),
      reason: STRUCT,
      source: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'conflict',
    plan: R2,
  },
  consent_records: {
    class: 'legal',
    memberLink: ['user_id'],
    columns: { version: STRUCT, method: STRUCT, document_url: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'legal',
    note: 'Legal record of consent; retention period is a legal question.',
  },
  api_keys: {
    class: 'restricted',
    memberLink: ['owner_user_id'],
    columns: {
      name: c('ugc', 'restricted', 'member-chosen label'),
      key_hash: c('secret', 'restricted', 'revoked on deletion; purge key material in R2'),
      key_prefix: SECRET,
      scopes: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  push_subscriptions: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {
      endpoint: c('secret', 'restricted', 'revoked on deletion; material kept — purge in R2'),
      p256dh: SECRET,
      auth: SECRET,
      user_agent: PII_RESTRICTED,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  webhook_endpoints: {
    class: 'restricted',
    memberLink: ['owner_user_id'],
    columns: { url: SECRET, secret: SECRET, event_types: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  user_settings: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {
      dm_privacy: STRUCT,
      location_granularity: STRUCT,
      digest_frequency: STRUCT,
      preferences: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  notification_prefs: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { notification_type: STRUCT, channel: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },

  // --- Profile satellites (deleted by anonymise_user) ------------------------
  profile_link_meta: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: {
      url_key: UGC_REMOVED,
      verification_status: STRUCT,
      verification_token: SECRET,
      og_status: STRUCT,
      og_title: DERIVED_REMOVED,
      og_site_name: DERIVED_REMOVED,
      og_image_path: MEDIA_REMOVED,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    memberReadable: true,
  },
  profile_modules: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: { module_id: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    memberReadable: true,
  },
  profile_open_to: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: { open_to_id: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    memberReadable: true,
  },
  profile_pinned_labs: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  profile_pins: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: { entity_type: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    memberReadable: true,
  },
  profile_showcase: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: { entity_type: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    memberReadable: true,
  },
  page_blocks: {
    class: 'review',
    memberLink: [],
    linkedVia: 'owner_type/owner_id (polymorphic: profile or Space)',
    columns: {
      owner_type: STRUCT,
      block_type: STRUCT,
      span: STRUCT,
      config: c('ugc', 'review', 'schema-only today; may carry member content'),
      visibility: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
  },

  // --- Plaza ------------------------------------------------------------------
  posts: {
    class: 'suppress',
    memberLink: ['author_user_id', 'ask_helper_user_id'],
    columns: {
      title: UGC_SUPPRESS,
      body: UGC_SUPPRESS,
      link_url: UGC_SUPPRESS,
      image_urls: MEDIA_PUBLIC,
      legacy_ask_status: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
    note: 'Hidden from members (author_is_active); bodies stay in rows until R2. System digest posts: R1b §3.5.',
  },
  comments: {
    class: 'suppress',
    memberLink: ['author_user_id'],
    columns: { body: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  post_revisions: {
    class: 'remove',
    memberLink: ['editor_user_id'],
    columns: {
      previous_title: UGC_REMOVED,
      previous_body: UGC_REMOVED,
      previous_link_url: UGC_REMOVED,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
    note: 'Old bodies kept (author/mod read) — or L when tied to a report.',
  },
  post_drafts: {
    class: 'remove',
    memberLink: ['user_id'],
    columns: { payload: c('ugc', 'remove', 'unpublished bodies') },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  poll_options: {
    class: 'suppress',
    memberLink: [],
    linkedVia: 'posts',
    columns: { label: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  poll_votes: {
    class: 'restricted',
    memberLink: ['voter_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Must not feed visible counts; whether counts exclude deleted members is gated.',
  },
  reactions: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
  },
  post_cosigns: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Support is inert; whether support counts exclude deleted members is gated.',
  },
  post_offers: {
    class: 'restricted',
    memberLink: ['helper_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  post_tags: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'posts',
    columns: {},
    mutability: 'mutable',
    anchor: 'none',
    status: 'aligned',
  },
  bookmarks: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { entity_type: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  mutes: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { entity_type: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  follows: {
    class: 'restricted',
    memberLink: ['follower_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Follower counts include deleted followers today (gated).',
  },

  // --- DMs & notifications (C1) -----------------------------------------------
  conversations: {
    class: 'restricted',
    memberLink: ['initiator_user_id', 'recipient_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    note: 'Thread continuity metadata (C1).',
  },
  conversation_declines: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'conversations',
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  messages: {
    class: 'suppress',
    memberLink: ['sender_user_id'],
    columns: {
      body: c('ugc', 'suppress', 'C1: placeholder "Message removed — account deleted."'),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_DMS,
    note: 'The counterparty still reads a deleted sender’s body directly today; voice notes (private dm-media) likewise.',
  },
  dm_read_states: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  user_blocks: {
    class: 'restricted',
    memberLink: ['blocker_user_id', 'blocked_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  notifications: {
    class: 'restricted',
    memberLink: ['user_id', 'actor_user_id'],
    columns: {
      type: STRUCT,
      payload: c('derived', 'suppress', 'DM previews (≤140 chars): C1 — stop writing + hide'),
      bundle_key: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_DMS,
    note: 'No retention applies to notifications today; a derived copy follows its source’s class.',
  },

  // --- Spaces / ventures / capital (C3, C4) ------------------------------------
  labs: {
    class: 'review',
    memberLink: ['lead_user_id'],
    columns: {
      name: UGC_REVIEW,
      slug: STRUCT,
      short_description: UGC_REVIEW,
      problem_statement: UGC_REVIEW,
      hypothesis: UGC_REVIEW,
      success_definition: UGC_REVIEW,
      settings: STRUCT,
      icon_path: MEDIA_PUBLIC,
      icon_blurhash: MEDIA_PUBLIC,
      cover_path: MEDIA_PUBLIC,
      cover_blurhash: MEDIA_PUBLIC,
      goal_statement: UGC_REVIEW,
      goal_unit: UGC_REVIEW,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'A Space LED by a deleted member: collective Space content or personal UGC? No lead transfer exists.',
  },
  lab_members: {
    class: 'restricted',
    memberLink: ['user_id', 'invited_by_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Rosters and counts include deleted members today (gated).',
  },
  lab_updates: {
    class: 'suppress',
    memberLink: ['author_user_id'],
    columns: { title: UGC_SUPPRESS, body: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SPACE,
    note: '998f991 author_is_retained keeps deleted authors’ bodies visible, including on the signed-out public page.',
  },
  lab_decisions: {
    class: 'suppress',
    memberLink: ['created_by_user_id'],
    columns: {
      title: c('ugc', 'suppress', 'C3: withheld by default in the decision shell'),
      context: UGC_SUPPRESS,
      decision: UGC_SUPPRESS,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SPACE,
    note: 'C3: minimal metadata + restricted evidence; full body only under accepted project terms, which do not exist.',
  },
  lab_artifacts: {
    class: 'suppress',
    memberLink: ['added_by_user_id'],
    columns: { title: UGC_SUPPRESS, url: UGC_SUPPRESS, description: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SPACE,
  },
  lab_events: {
    class: 'restricted',
    memberLink: ['actor_user_id'],
    columns: {
      event_type: STRUCT,
      metadata: c('derived', 'restricted', 'ids; the candidate_created entry carries a name'),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SPACE,
    note: 'Existence metadata, but the raw actor id reaches the Space audience today.',
  },
  lab_collaborations: {
    class: 'restricted',
    memberLink: ['proposed_by_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  lab_skill_needs: {
    class: 'restricted',
    memberLink: ['filled_by_user_id'],
    columns: { skill: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  lab_tags: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'labs',
    columns: {},
    mutability: 'mutable',
    anchor: 'none',
    status: 'aligned',
  },
  lab_playbooks: {
    class: 'platform',
    memberLink: ['created_by_user_id'],
    columns: {
      slug: c('structural', 'platform'),
      name: c('structural', 'platform'),
      venture_type: c('structural', 'platform'),
      template: c('structural', 'platform', 'platform-authored template'),
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    note: 'Platform-authored project templates.',
  },
  venture_tasks: {
    class: 'review',
    memberLink: [
      'created_by_user_id',
      'assignee_user_id',
      'attested_by_user_id',
      'verified_by_user_id',
    ],
    columns: { title: c('ugc', 'review', 'the Space’s work breakdown or the creator’s UGC?') },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
  },
  venture_workstreams: {
    class: 'review',
    memberLink: ['owner_user_id'],
    columns: { name: c('ugc', 'review', 'unattributable: owner seat, not the writer') },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
  },
  venture_capital_needs: {
    class: 'review',
    memberLink: [],
    linkedVia: 'labs (no declaring column)',
    columns: { purpose: c('ugc', 'review', 'unattributable to an author'), currency: STRUCT },
    mutability: 'mutable',
    anchor: 'none',
    status: 'owner',
  },
  venture_weight_schemes: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'labs',
    columns: { weights: STRUCT },
    mutability: 'mutable',
    anchor: 'none',
    status: 'aligned',
  },
  work_events: {
    class: 'restricted',
    memberLink: ['member_user_id', 'recorded_by_user_id'],
    columns: {
      note: c(
        'ugc',
        'suppress',
        'C4: inside the sha256 chain — suppress via an append-only overlay, never by UPDATE',
      ),
      prev_hash: STRUCT,
      hash: STRUCT,
    },
    mutability: 'append_only',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SNAPSHOTS,
  },
  work_event_attestations: {
    class: 'restricted',
    memberLink: ['attester_user_id'],
    columns: {},
    mutability: 'no_update',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Deleted attesters still count toward verified units (gated). Service-role DELETE is unguarded.',
  },
  venture_candidates: {
    class: 'review',
    memberLink: ['created_by_user_id'],
    columns: {
      name: UGC_REVIEW,
      one_liner: UGC_REVIEW,
      problem: UGC_REVIEW,
      solution: UGC_REVIEW,
      traction: UGC_REVIEW,
      team: UGC_REVIEW,
      ask: UGC_REVIEW,
      status_reason: c(
        'ugc',
        'restricted',
        'reviewer-written decision reason (restricted, not legal)',
      ),
      notes: UGC_REVIEW,
      logo_path: MEDIA_PUBLIC,
      logo_blurhash: MEDIA_PUBLIC,
      cover_path: MEDIA_PUBLIC,
      cover_blurhash: MEDIA_PUBLIC,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Builder-authored pitch vs Lab-owned object: owner ruling, and it interacts with Xidig Plus ruling B.',
  },
  candidate_reviews: {
    class: 'restricted',
    memberLink: ['reviewer_user_id'],
    columns: {
      notes: c(
        'ugc',
        'restricted',
        'owner ruling 12 Sep: reviewer notes with deleted-member personal data are restricted metadata',
      ),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SNAPSHOTS,
    note: 'Member-readable wherever the candidate is readable (§17 transparency lock) — conflicts with the ruling.',
  },
  candidate_votes: {
    class: 'restricted',
    memberLink: ['voter_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
    note: 'Vote paused; ballots are restricted records and the tally is server-only (20260912100000).',
  },
  interests: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { message: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Q2a (legacy invest-intent rows) is a separate owner/legal question.',
  },
  capital_gate_evaluations: {
    class: 'legal',
    memberLink: ['user_id'],
    columns: {
      profile_country: c('pii', 'legal', 'copy of the profile country the scrub cannot reach'),
      geo_ip_country: PII_LEGAL,
      reason: STRUCT,
    },
    mutability: 'append_only',
    anchor: 'anonymised_at',
    status: 'legal',
    note: 'Compliance log; Q2b.',
  },
  governance_log_entries: {
    class: 'review',
    memberLink: ['created_by_user_id'],
    columns: {
      title: c(
        'ugc',
        'review',
        'official record only where clearly platform-owned (ruling 4 analogue)',
      ),
      body: UGC_REVIEW,
      category: STRUCT,
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'owner',
  },

  // --- Listings & events (C2) --------------------------------------------------
  business_listings: {
    class: 'suppress',
    memberLink: ['owner_user_id'],
    columns: {
      business_name: UGC_SUPPRESS,
      short_description: UGC_SUPPRESS,
      address: PII_SUPPRESS,
      landmark: PII_SUPPRESS,
      city: PII_SUPPRESS,
      country: PII_SUPPRESS,
      contact_links: c('pii', 'suppress', 'suppressed today; remove in R2'),
      export_checklist: UGC_SUPPRESS,
      search_norm: c('derived', 'suppress'),
      opening_hours: UGC_SUPPRESS,
      primary_photo_path: MEDIA_PUBLIC,
      primary_photo_blurhash: MEDIA_PUBLIC,
      primary_photo_alt: UGC_SUPPRESS,
      latitude: c(
        'pii',
        'suppress',
        'manual pin-drop location; remove with the listing contact in R2',
      ),
      longitude: c(
        'pii',
        'suppress',
        'manual pin-drop location; remove with the listing contact in R2',
      ),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
    note: 'Suppressed everywhere when the owner is not live (998f991); rows, contact and photos retained.',
  },
  listing_photos: {
    class: 'suppress',
    memberLink: [],
    linkedVia: 'business_listings',
    columns: {
      storage_path: MEDIA_PUBLIC,
      thumb_path: MEDIA_PUBLIC,
      alt_text: UGC_SUPPRESS,
      blurhash: MEDIA_PUBLIC,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: 'A5b / R2',
  },
  listing_services: {
    class: 'suppress',
    memberLink: [],
    linkedVia: 'business_listings',
    columns: { name: UGC_SUPPRESS, price_label: UGC_SUPPRESS },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  listing_tags: {
    class: 'suppress',
    memberLink: [],
    linkedVia: 'business_listings',
    columns: {},
    mutability: 'mutable',
    anchor: 'none',
    status: 'conflict',
    plan: 'R1b (listing_tags must follow business_listings visibility)',
    memberReadable: true,
    note: 'Bare listing↔tag ids (no member text), but the using(true) policy does NOT follow the listing, so a suppressed listing’s tags stay readable.',
  },
  listing_claims: {
    class: 'restricted',
    memberLink: ['claimant_user_id', 'reviewed_by_user_id'],
    columns: { evidence: c('ugc', 'restricted', 'trust evidence') },
    mutability: 'mutable',
    anchor: 'dispute_closed',
    status: 'aligned',
  },
  events: {
    class: 'suppress',
    memberLink: ['host_user_id'],
    columns: {
      slug: STRUCT,
      title: c('ugc', 'shell', 'C2: kept in the minimal historical shell'),
      description: UGC_SUPPRESS,
      category_id: STRUCT,
      timezone: STRUCT,
      venue_name: PII_SUPPRESS,
      venue_address: PII_SUPPRESS,
      online_url: c('pii', 'suppress', 'C2: links/contact suppressed'),
      cover_path: MEDIA_PUBLIC,
      cover_blurhash: MEDIA_PUBLIC,
      agenda: UGC_SUPPRESS,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_EVENTS,
    note: 'C2 (owner 12 Sep): official/business events keep a body only when clearly organisation-owned under accepted terms; ambiguous → suppress.',
  },
  event_rsvps: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
  },

  // --- Awards, reputation, trust -----------------------------------------------
  award_votes: {
    class: 'restricted',
    memberLink: ['voter_user_id'],
    columns: { quarter: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Tallies count deleted voters (gated).',
  },
  award_results: {
    class: 'restricted',
    memberLink: [],
    linkedVia: 'target_id (polymorphic: the winning member)',
    columns: { quarter: STRUCT, evidence: DERIVED_RESTRICTED },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
    note: 'Every member reads rows, including a deleted winner’s id (R4-13).',
  },
  user_badges: {
    class: 'restricted',
    memberLink: ['user_id', 'awarded_by_user_id'],
    columns: { tier: STRUCT, context: STRUCT, metadata: DERIVED_RESTRICTED },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Never ranking; the tombstone hides chips. But the policy (revoked_at is null or own row) lets any member read a deleted member’s badge rows directly over PostgREST — not literal using(true), so memberReadable does not flag it.',
  },
  reputation_events: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: { event_type: STRUCT, score_class: STRUCT },
    mutability: 'no_update',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  reputation_scores: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
    note: 'The leaderboard excludes deleted members; the raw rows stay member-readable.',
  },
  skill_endorsements: {
    class: 'restricted',
    memberLink: ['endorsee_user_id', 'endorser_user_id'],
    columns: { skill: STRUCT },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
    note: 'Anti-Sybil reference; counts on live profiles include deleted endorsers (gated).',
  },
  vouches: {
    class: 'restricted',
    memberLink: ['voucher_user_id', 'vouchee_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    note: 'Anti-Sybil reference; the vouch threshold counts deleted vouchers (gated).',
  },
  verifications: {
    class: 'legal',
    memberLink: ['user_id', 'verifier_user_id'],
    columns: {
      recording_url: c(
        'media',
        'legal',
        'declared expiry NOT enforced: nothing writes recording_expires_at, so the sweep never nulls it',
      ),
      decision_notes: UGC_LEGAL,
      booking_url: PII_LEGAL,
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: 'R2 (legal-gated) — biometric recording retention (DPIA)',
  },
  verification_access_log: {
    class: 'legal',
    memberLink: ['accessed_by_user_id'],
    columns: { access_type: STRUCT, metadata: DERIVED_LEGAL },
    mutability: 'append_only',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  verifier_grants: {
    class: 'restricted',
    memberLink: ['user_id', 'granted_by_user_id'],
    columns: { note: c('ugc', 'restricted', 'admin-written') },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  advisor_grants: {
    class: 'restricted',
    memberLink: ['user_id', 'granted_by_user_id'],
    columns: { note: c('ugc', 'restricted', 'admin-written') },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  mentor_residencies: {
    class: 'restricted',
    memberLink: ['advisor_user_id', 'created_by_user_id'],
    columns: { period: STRUCT, focus: UGC_RESTRICTED, hours_note: UGC_RESTRICTED },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
  },
  mentor_slots: {
    class: 'restricted',
    memberLink: ['booked_by_user_id'],
    columns: {},
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'owner',
    memberReadable: true,
  },
  invites: {
    class: 'restricted',
    memberLink: ['created_by_user_id', 'redeemed_by_user_id'],
    columns: { code: SECRET, note: UGC_RESTRICTED },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },
  term_suggestions: {
    class: 'restricted',
    memberLink: ['suggested_by', 'resolved_by'],
    columns: { term: UGC_RESTRICTED, note: UGC_RESTRICTED },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'aligned',
  },

  // --- Moderation, audit, security (C4) ----------------------------------------
  reports: {
    class: 'legal',
    memberLink: ['reporter_user_id', 'assigned_to_user_id', 'resolved_by_user_id'],
    columns: { details: UGC_LEGAL, resolution: UGC_LEGAL },
    mutability: 'mutable',
    anchor: 'dispute_closed',
    status: 'aligned',
    note: 'Safety/dispute record; the day-365 step and legal hold are missing.',
  },
  report_snapshots: {
    class: 'legal',
    memberLink: [],
    linkedVia: 'reports',
    columns: {
      captured_body: c(
        'derived',
        'legal',
        'full bodies: the justified restricted exception while a safety/dispute purpose exists',
      ),
      captured_context: DERIVED_LEGAL,
    },
    mutability: 'no_update',
    anchor: 'dispute_closed',
    status: 'conflict',
    plan: R1B_SNAPSHOTS,
    note: 'Mod-readable raw over PostgREST; service-role DELETE unguarded; new reports of a deleted member’s content mint new copies.',
  },
  moderation_reviews: {
    class: 'legal',
    memberLink: ['author_user_id', 'reviewed_by_user_id'],
    columns: {
      language: STRUCT,
      content_excerpt: c('derived', 'legal', '≤500 chars of a post, comment or event body'),
      ai_verdict: DERIVED_LEGAL,
      review_note: UGC_LEGAL,
    },
    mutability: 'mutable',
    anchor: 'dispute_closed',
    status: 'conflict',
    plan: R1B_SNAPSHOTS,
  },
  mod_actions: {
    class: 'legal',
    memberLink: ['actor_user_id'],
    columns: { reason: UGC_LEGAL, metadata: DERIVED_LEGAL },
    mutability: 'append_only',
    anchor: 'dispute_closed',
    status: 'aligned',
  },
  appeals: {
    class: 'legal',
    memberLink: ['appellant_user_id', 'reviewed_by_user_id'],
    columns: { body: UGC_LEGAL, decision_notes: UGC_LEGAL },
    mutability: 'mutable',
    anchor: 'dispute_closed',
    status: 'aligned',
  },
  audit_logs: {
    class: 'legal',
    memberLink: ['actor_user_id'],
    columns: {
      action: STRUCT,
      metadata: c(
        'derived',
        'legal',
        'plaintext email in email-suppression rows: forward-only hashing (R1b §3.6), overlay for existing rows (R2)',
      ),
    },
    mutability: 'append_only',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_SNAPSHOTS,
  },

  // --- Media, digests, derived copies ------------------------------------------
  media_uploads: {
    class: 'restricted',
    memberLink: ['owner_user_id'],
    columns: {
      bucket: STRUCT,
      storage_path: c('media', 'restricted', 'see MEDIA_KINDS for which objects are purged'),
      mime_type: STRUCT,
      scan_verdict: DERIVED_RESTRICTED,
      kind: STRUCT,
      alt_text: c('ugc', 'remove', 'cleared for avatar/cover only; other kinds kept until R2'),
      blurhash: c('media', 'restricted'),
      thumb_path: c('media', 'restricted'),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: 'A5b / R2',
  },
  digest_editions: {
    class: 'restricted',
    memberLink: ['created_by'],
    columns: {
      period_key: STRUCT,
      status: STRUCT,
      payload: c(
        'derived',
        'restricted',
        'holds member titles; admin-only rollback source for the digest re-render',
      ),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R1B_DIGESTS,
    note: 'Its pinned xidig_ai post bakes deleted members’ titles into a directly readable body.',
  },
  digest_email_sends: {
    class: 'restricted',
    memberLink: ['user_id'],
    columns: {
      email: c('pii', 'restricted', 'plaintext recipient address; hash in R2'),
      status: STRUCT,
      error: c('derived', 'restricted', 'raw provider error text; may echo the recipient'),
    },
    mutability: 'mutable',
    anchor: 'anonymised_at',
    status: 'conflict',
    plan: R2,
  },
  seed_runs: {
    class: 'platform',
    memberLink: ['actor_user_id'],
    columns: {
      label: c('structural', 'platform', 'admin-authored run label'),
      description: c('structural', 'platform', 'admin-authored run description'),
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },
  seed_entities: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },

  // --- Platform config & taxonomy (no member data) ------------------------------
  app_settings: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },
  feature_flags: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },
  membership_tiers: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },
  tier_capabilities: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
  },
  badge_definitions: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  award_cycles: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  block_types: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  event_categories: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  listing_categories: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  media_kinds: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  open_to_kinds: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  profile_module_kinds: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  skills: {
    class: 'platform',
    memberLink: [],
    allColumns: 'platform',
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
    note: 'Shared vocabulary with no member link; a zero-count term is not attributable to anyone.',
  },
  lanes: {
    class: 'platform',
    memberLink: ['created_by'],
    columns: {
      slug: c('structural', 'platform'),
      name_en: c('structural', 'platform'),
      name_so: c('structural', 'platform'),
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'n/a',
    memberReadable: true,
  },
  tags: {
    class: 'review',
    memberLink: ['created_by_user_id'],
    columns: {
      name: c(
        'ugc',
        'review',
        'members instant-create tags; a term coined by a deleted member outlives them',
      ),
      description: UGC_REVIEW,
    },
    mutability: 'mutable',
    anchor: 'none',
    status: 'owner',
    memberReadable: true,
  },
} as const satisfies Record<string, TableRule>;

export type RetentionTable = keyof typeof RETENTION_CLASS_MAP;

// ---------------------------------------------------------------------------
/**
 * Every retention-like window in the product, and what enforces it. A window
 * is either enforced (by a named consumer) or explicitly declared-not-enforced,
 * so a constant can never pass for a policy it does not apply.
 */
export const RETENTION_WINDOWS = {
  restrictedMetadata: {
    days: RETENTION_WINDOW_DAYS,
    enforcedBy: 'declared_not_enforced',
    note: 'No day-365 step exists; R2, gated on LEGAL_HOLD and legal review.',
  },
  deletionGrace: {
    days: 30,
    enforcedBy: 'apps/web lifecycle sweep (DELETION_GRACE_DAYS)',
  },
  dmRequestTtl: {
    days: 30,
    enforcedBy: 'apps/web DM request sweep (DM_REQUEST_TTL_DAYS)',
  },
  authEmailTokens: {
    days: 1,
    enforcedBy: 'opportunistic purge on the next token write (not scheduled)',
  },
  verificationRecordings: {
    days: 24 * 30,
    enforcedBy: 'declared_not_enforced',
    note: 'RECORDING_RETENTION_MONTHS exists but nothing writes recording_expires_at.',
  },
} as const satisfies Record<string, { days: number; enforcedBy: string; note?: string }>;

/**
 * Every media kind (media_kinds rows), where its objects live, and whether
 * final deletion purges them. The contract test keeps this in step with the
 * database; an apps/web test keeps `purgedOnDeletion` in step with the
 * lifecycle purge scope.
 */
export const MEDIA_KINDS = {
  avatar: { bucket: 'post-media', public: true, purgedOnDeletion: true },
  cover: { bucket: 'post-media', public: true, purgedOnDeletion: true },
  post: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  listing_photo: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  event_cover: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  space_icon: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  space_cover: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  candidate_logo: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  candidate_cover: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  block: { bucket: 'post-media', public: true, purgedOnDeletion: false },
  voice: { bucket: 'dm-media', public: false, purgedOnDeletion: false },
} as const satisfies Record<
  string,
  { bucket: 'post-media' | 'dm-media'; public: boolean; purgedOnDeletion: boolean }
>;

/**
 * KNOWN RESIDUAL LEAK (owner ruling, 12 Sep): a deleted member's objects of
 * every kind below stay reachable at their raw public URLs (which embed the
 * uploader's id) until the media purge / storage access change (A5b/R2).
 * First reversible step: remove or suppress normal UI/API references and stop
 * new surfacing. This state is NOT deletion-compliant.
 */
export const PUBLIC_MEDIA_RESIDUAL = (
  Object.entries(MEDIA_KINDS) as Array<[string, { public: boolean; purgedOnDeletion: boolean }]>
)
  .filter(([, k]) => k.public && !k.purgedOnDeletion)
  .map(([kind]) => kind);

/** Restricted metadata held by providers, outside our database. */
export const PROVIDER_METADATA = {
  gotruePhone: {
    class: 'restricted',
    windowDays: RETENTION_WINDOW_DAYS,
    providerErasure: 'unavailable',
    enforcedBy: 'declared_not_enforced',
    complianceClaim: false,
    note: 'Owner ruling 12 Sep: the GoTrue phone is restricted provider/auth metadata for up to 1 year while supported erasure is unavailable. Classification only — not a compliance claim.',
  },
  gotrueEmail: {
    class: 'restricted',
    windowDays: RETENTION_WINDOW_DAYS,
    providerErasure: 'pseudonymised at final deletion (deleted-<uuid>@deleted.invalid)',
    enforcedBy: 'declared_not_enforced',
    complianceClaim: false,
    note: 'Kept indefinitely today; no 1-year step (doctrine §3 conflict).',
  },
} as const;

/**
 * Member data outside the public schema. The contract test enumerates only
 * `public`; these are registered here so they are never silently ignored.
 * All are conflicts until an R2 step exists.
 */
export const NON_PUBLIC_REGISTER = {
  'auth.users': {
    class: 'restricted',
    note: 'GoTrue identity: banned + email pseudonymised at deletion; the phone cannot be cleared (PROVIDER_METADATA).',
  },
  'auth.identities': { class: 'restricted', note: 'provider identity rows; no 1-year step' },
  'auth.sessions': { class: 'restricted', note: 'device/session indicators; no 1-year step' },
  'auth.refresh_tokens': { class: 'restricted', note: 'revoked by the ban; rows kept' },
  'auth.audit_log_entries': {
    class: 'restricted',
    note: 'GoTrue auth audit trail; no 1-year step',
  },
  'storage.objects': {
    class: 'suppress',
    note: 'owner = the member id, paths embed it; public-bucket objects are the KNOWN RESIDUAL LEAK (MEDIA_KINDS)',
  },
} as const satisfies Record<string, { class: RetentionClass; note: string }>;

/** Copies that leave our control and cannot be recalled. */
export const EXTERNAL_COPIES = [
  'AI moderation provider requests (post, comment and event text sent for scanning; provider retention applies)',
  'PostHog analytics events (distinct_id = the member UUID; consented members only; no deletion call at anonymise)',
  'Sentry events (server init attaches local variables; no beforeSend scrubbing)',
  'email provider logs (suppressions, deliveries)',
  'delivered digest and DM-request emails',
  'CDN copies of public media until they expire',
] as const;
