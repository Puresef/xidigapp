-- ============================================================================
-- Xidig v1.0 — Phase 0: complete database schema
-- ============================================================================
-- Single migration covering ALL tables for the entire v1.0 build (Phases 0–8).
-- No RLS, no API, no UI in this migration (RLS ships as a separate rls.sql in
-- later phases, per the PRD prompt pack).
--
-- Conventions
--   * snake_case table/column names; PRD camelCase fields map 1:1
--     (subscriptionStatus -> subscription_status, etc.). Supabase type
--     generation re-exposes them to TypeScript.
--   * ENUMs for closed, code-driven state machines; lookup tables for
--     member/admin-extensible taxonomies (tags, listing categories, badges,
--     membership tiers).
--   * All PKs are UUID (gen_random_uuid()) except pure junction tables and
--     slug-keyed lookups (membership_tiers).
--   * TIMESTAMPTZ everywhere; created_at defaults to now().
--   * Auth: passwords/OTP live in Supabase-managed auth.users. public.users
--     shadows auth.users 1:1 and carries app-level account state.
--   * No circular FK dependencies: user<->invite is resolved by putting both
--     FKs on invites; Ask "credited answer" lives on comments (not posts);
--     conversations carry no last_message_id.
-- ============================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

-- RBAC (§26): member / mod / admin
create type user_role as enum ('member', 'mod', 'admin');

-- Account lifecycle (§19): deactivate / delete (30-day grace, then anonymise)
create type account_status as enum
  ('active', 'suspended', 'deactivated', 'pending_deletion', 'deleted');

-- Membership (§25/§26, Phase 0 requirement). Tiers are a LOOKUP TABLE keyed by
-- a citext slug ('free', 'supporter'), NOT an enum: launching a new tier
-- (§25's member-owned pricing review, future Builder/Investor packaging) is
-- one INSERT — zero migration. The Phase 0 acceptance criterion's intent
-- (tier on Profile, constrained to free/supporter) is enforced by the FK to
-- the seeded rows. Decided 4 Jul, supersedes the earlier enum design.

-- Gated capabilities per tier (§17, §26, §27). Enum (not TEXT) because RLS
-- predicates test membership against these fixed, code-driven gates — a new
-- capability needs new enforcement code anyway, unlike a new tier.
create type membership_capability as enum (
  'create_lab',            -- §27: creating a Lab requires Supporter
  'join_unlimited_labs',   -- §26: Supporter can create/join more Labs
  'vote_candidate',        -- §17: Supporter governance vote on Candidates
  'governance_rights',     -- §26: governance rights
  'builder_path',          -- §26: Builder Path (build Candidates, earn equity)
  'investor_path',         -- §26: Investor Path (deploy capital; +enhanced verification)
  'intelligence_updates'   -- §26: monthly intelligence updates
);

-- Verification ladder on profiles (§14): community tier upgradeable to identity
create type profile_verification_status as enum
  ('unverified', 'pending', 'community_verified', 'identity_verified');

create type listing_verification_status as enum ('unverified', 'pending', 'verified');

-- Verification call process (§14). Community verification is automatic via
-- vouches (3 required) and does not go through this pipeline.
create type verification_type as enum ('identity', 'business');
create type verification_request_status as enum
  ('pending', 'scheduled', 'approved', 'rejected', 'cancelled');

create type language_code as enum ('en', 'so');

-- Per-document consent (§12: ToS + Privacy Policy + cookie/analytics consent —
-- required before Phase 1 data collection). Split so analytics/cookie consent
-- can be withdrawn independently of the ToS/Privacy acceptance (UK GDPR).
create type consent_type as enum
  ('terms_of_service', 'privacy_policy', 'cookies', 'analytics');

-- Phase 8: seeded / AI-authored content must be distinguishable (§21)
create type content_source as enum ('member', 'seed', 'ai');

-- Moderation state shared by posts / comments / listings (§19)
create type content_status as enum ('published', 'hidden', 'removed');

-- Plaza (§15)
create type post_type as enum ('intro', 'ask', 'win', 'update', 'poll');
create type ask_status as enum ('open', 'answered', 'closed');
create type poll_status as enum ('open', 'closed'); -- manual early close OR auto-close at poll_closes_at
create type reaction_type as enum ('fire', 'strong', 'mashallah', 'idea', 'watching');

-- Spaces / Labs (§16, Phase 0 requirements)
create type space_mode as enum ('club', 'lab');
create type lab_visibility as enum ('private', 'members', 'public');
create type lab_join_mode as enum ('open', 'request', 'invite');
-- Stage values are not enumerated in the PRD; locked to this set (4 Jul).
-- 'graduated' is deliberately excluded: graduation is the promote-only ladder's
-- next rung (Lab -> Venture Candidate, §16), represented by venture_candidates,
-- not a lab stage.
create type lab_stage as enum ('idea', 'building', 'validating', 'launched');
create type lab_member_role as enum ('lead', 'core', 'member', 'observer');
create type lab_member_specialization as enum ('operator', 'researcher', 'advisor');
create type lab_member_status as enum
  ('invited', 'requested', 'active', 'declined', 'removed', 'left');
create type lab_collaboration_status as enum ('proposed', 'accepted', 'declined', 'ended');

-- Capital (§17)
create type candidate_status as enum
  ('draft', 'submitted', 'in_review', 'approved', 'parked', 'declined');
create type candidate_visibility as enum ('all_members', 'reviewers_only');
create type vote_choice as enum ('approve', 'reject');
-- 'help' = "I can help" · 'cosign' = Garab (never region-gated) ·
-- 'invest' = Maalgeli intent capture (Somalia-region gated at RLS/app layer)
create type interest_type as enum ('help', 'cosign', 'invest');

-- Social graph (§13): follow people, Labs, Ventures (candidates), tags
create type follow_target_type as enum ('user', 'lab', 'candidate', 'tag');

-- DMs (§13, §10)
create type conversation_status as enum ('pending', 'accepted', 'declined', 'blocked');

-- Shared vocabulary for polymorphic references
-- (reports, mod actions, notifications, audit log, award votes)
create type entity_type as enum
  ('user', 'profile', 'post', 'comment', 'tag', 'lab', 'lab_update',
   'lab_artifact', 'lab_decision', 'candidate', 'listing', 'conversation',
   'message', 'badge', 'vouch', 'report', 'invite', 'verification',
   'interest', 'api_key', 'governance_entry', 'appeal', 'mod_action',
   'listing_claim', 'waitlist_entry', 'lab_event', 'award_vote',
   'push_subscription', 'webhook_endpoint', 'membership_tier', 'consent_record',
   'capital_gate_evaluation');

-- Moderation (§19). Reason taxonomy is not enumerated in the PRD — assumed
-- set, flagged in the Phase 0 notes.
create type report_reason as enum
  ('spam', 'harassment', 'impersonation', 'fraud_or_scam',
   'inappropriate_content', 'misinformation', 'other');
create type report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type mod_action_type as enum
  ('remove_content', 'restore_content', 'hide_content', 'warn_user',
   'suspend_user', 'unsuspend_user', 'remove_listing', 'restore_listing',
   'verify_user', 'revoke_verification', 'dismiss_report', 'other');
create type appeal_status as enum ('pending', 'upheld', 'overturned');

create type claim_status as enum ('pending', 'approved', 'rejected');
create type waitlist_status as enum ('pending', 'invited', 'joined');

-- Community Awards (§20): quarterly, member-voted
create type award_category as enum
  ('best_lab', 'best_win', 'most_helpful', 'rising_builder');

-- ============================================================================
-- 2. HELPER FUNCTIONS
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 3. IDENTITY & ACCOUNTS
-- ============================================================================

-- App-level shadow of Supabase auth.users (1:1). Passwords/magic links/OTP are
-- Supabase-managed; email/phone are mirrored here for querying and the
-- "at least one contact method" invariant (§9 auth, Phase 0 addition).
-- NO ACTION (not CASCADE) on the auth.users FK enforces §19's anonymise-not-
-- delete policy at the DB boundary: an auth.users row cannot be hard-deleted
-- while its public.users row exists, so account deletion must anonymise in
-- place (scrub email/phone + PII on profiles) rather than cascade-wipe content
-- and counterparty data (DMs, governance ballots, vouches).
create table users (
  id                     uuid primary key references auth.users (id),
  email                  citext unique,
  phone                  text unique,
  role                   user_role not null default 'member',
  status                 account_status not null default 'active',
  is_ai                  boolean not null default false, -- badged AI assistant accounts (§21)
  preferred_language     language_code not null default 'en',
  low_bandwidth_enabled  boolean not null default false,
  onboarding_state       jsonb not null default '{}'::jsonb, -- first-session checklist (§20)
  -- ToS/Privacy/cookie/analytics consent is recorded per-document in
  -- consent_records (§12), not as a single flag here.
  suspended_at           timestamptz,
  suspension_reason      text,
  deletion_requested_at  timestamptz, -- 30-day grace before anonymisation (§19)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Live accounts need a contact method; a fully deleted/anonymised account may
  -- have both scrubbed. pending_deletion still requires contact (grace is cancellable).
  constraint users_contact_method
    check (status = 'deleted' or email is not null or phone is not null),
  constraint users_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

create index users_role_idx on users (role) where role <> 'member';
create index users_status_idx on users (status) where status <> 'active';

-- Membership tier lookup (§25/§26), slug-keyed: a new tier is one INSERT here
-- (+ capability rows), zero migration. Pricing/labels live as data
-- (member-owned pricing is reviewed, §25); capabilities are normalised in
-- tier_capabilities so RLS gates via a join, never a hard-coded tier name.
create table membership_tiers (
  id                 citext primary key, -- slug: 'free', 'supporter', ...
  name               text not null,
  monthly_price_usd  numeric(6, 2) not null default 0,
  position           smallint not null,
  is_active          boolean not null default true, -- retire a tier without deleting it
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint membership_tiers_id_format check (id::text ~ '^[a-z0-9]([a-z0-9-]{0,29}[a-z0-9])?$')
);

create table tier_capabilities (
  tier_id     citext not null references membership_tiers (id) on delete cascade,
  capability  membership_capability not null,
  created_at  timestamptz not null default now(),
  primary key (tier_id, capability)
);

create table profiles (
  user_id              uuid primary key references users (id) on delete cascade,
  display_name         text not null,
  handle               citext not null unique,
  bio                  text,
  location_city        text,
  location_country     text,
  -- Optional coordinates for proximity-based discovery (§18); manual, not geocoded
  latitude             double precision,
  longitude            double precision,
  timezone             text, -- IANA tz (e.g. 'Africa/Mogadishu'); Seq 15 timezone matching
  skills               text[] not null default '{}',
  lanes                text[] not null default '{}',
  links                jsonb not null default '[]'::jsonb, -- [{label, url}]
  contact_options      jsonb not null default '{}'::jsonb, -- member-chosen visibility: DM/email/WhatsApp/socials (§13)
  verification_status  profile_verification_status not null default 'unverified',
  membership_tier_id   citext not null default 'free'
                         references membership_tiers (id),             -- Phase 0 requirement (lookup FK; new tier = one INSERT)
  subscription_status  text,                                          -- Phase 0 requirement (raw Paddle/Lemon Squeezy status)
  region_verified      boolean not null default false,                -- Phase 0 requirement (Capital gating result, §17)
  region_attested_at   timestamptz,                                   -- self-attestation checkbox timestamp (§17)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- cast to text so the lowercase rule is enforced (citext ~ is case-insensitive)
  constraint profiles_handle_format check (handle::text ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_latitude_range check (latitude is null or (latitude between -90 and 90)),
  constraint profiles_longitude_range check (longitude is null or (longitude between -180 and 180))
);

create index profiles_location_idx on profiles (location_country, location_city);
create index profiles_skills_idx on profiles using gin (skills);
create index profiles_lanes_idx on profiles using gin (lanes);
create index profiles_membership_tier_idx on profiles (membership_tier_id);

-- Invite codes + tracked referrals (§20). Both user FKs live here so there is
-- no users -> invites FK (avoids a circular dependency). Single-use codes.
create table invites (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  created_by_user_id   uuid references users (id) on delete set null,
  note                 text,
  expires_at           timestamptz,
  revoked_at           timestamptz,
  redeemed_by_user_id  uuid references users (id) on delete set null,
  redeemed_at          timestamptz,
  created_at           timestamptz not null default now()
);

create index invites_created_by_idx on invites (created_by_user_id);
create index invites_redeemed_by_idx on invites (redeemed_by_user_id);

-- Beta waitlist (§9 signup gating: invite-only + waitlist)
create table waitlist_entries (
  id          uuid primary key default gen_random_uuid(),
  email       citext,
  phone       text,
  status      waitlist_status not null default 'pending',
  invite_id   uuid references invites (id) on delete set null,
  invited_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint waitlist_contact_method check (email is not null or phone is not null),
  -- same E.164 normalisation as users.phone so waitlist->signup matching works
  constraint waitlist_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

create unique index waitlist_entries_email_uq on waitlist_entries (email) where email is not null;
create unique index waitlist_entries_phone_uq on waitlist_entries (phone) where phone is not null;
create index waitlist_entries_status_idx on waitlist_entries (status, created_at);

-- Identity/business verification pipeline (§14): live video call, recorded
-- with consent, encrypted storage, 24-month retention, access-logged.
create table verifications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users (id) on delete cascade,
  -- Business verification (🏪 Verified Business) is a listing-level credential
  -- (§14), so it targets a specific listing. FK added after business_listings
  -- exists (see ALTER below) to keep table order acyclic.
  listing_id            uuid,
  type                  verification_type not null,
  status                verification_request_status not null default 'pending',
  scheduled_at          timestamptz,
  verifier_user_id      uuid references users (id) on delete set null,
  consent_given         boolean not null default false,
  consent_recorded_at   timestamptz,
  recording_url         text,        -- encrypted storage pointer, never public
  recording_expires_at  timestamptz, -- 24-month retention (§14)
  decision_notes        text,
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- business verification targets a listing; identity verification does not
  constraint verifications_business_listing check ((type = 'business') = (listing_id is not null))
);

create index verifications_user_idx on verifications (user_id);
create index verifications_queue_idx on verifications (status, created_at)
  where status in ('pending', 'scheduled');
create index verifications_verifier_idx on verifications (verifier_user_id);
create index verifications_listing_idx on verifications (listing_id) where listing_id is not null;

-- Community verification (§14): 3 verified members vouch
create table vouches (
  id               uuid primary key default gen_random_uuid(),
  voucher_user_id  uuid not null references users (id) on delete cascade,
  vouchee_user_id  uuid not null references users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  constraint vouches_no_self check (voucher_user_id <> vouchee_user_id),
  constraint vouches_unique unique (voucher_user_id, vouchee_user_id)
);

create index vouches_vouchee_idx on vouches (vouchee_user_id);

-- Skill endorsements (§14): peers endorse specific skills, shown on profile
create table skill_endorsements (
  id                uuid primary key default gen_random_uuid(),
  endorser_user_id  uuid not null references users (id) on delete cascade,
  endorsee_user_id  uuid not null references users (id) on delete cascade,
  skill             text not null,
  created_at        timestamptz not null default now(),
  constraint skill_endorsements_no_self check (endorser_user_id <> endorsee_user_id),
  constraint skill_endorsements_unique unique (endorser_user_id, endorsee_user_id, skill)
);

create index skill_endorsements_endorsee_idx on skill_endorsements (endorsee_user_id);

-- User-level blocks (§13: block inside DMs; also gates DM requests)
create table user_blocks (
  blocker_user_id  uuid not null references users (id) on delete cascade,
  blocked_user_id  uuid not null references users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

create index user_blocks_blocked_idx on user_blocks (blocked_user_id);

-- Per-document consent records (§9 "+ terms"; §12 ToS + Privacy + cookie/
-- analytics consent required before data collection). One row per affirmative
-- consent: granted_at is when it was given, withdrawn_at (nullable) when
-- revoked — so analytics/cookie consent is independently withdrawable and the
-- Cookie Notice's "consent record" promise is met (UK GDPR). A new document
-- version, or re-grant after withdrawal, is a new row; a decline is simply the
-- absence of an active record. ToS/Privacy rows are just never withdrawn.
create table consent_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  consent_type  consent_type not null,
  version       text not null,               -- version/hash of the document consented to
  method        text,                        -- how captured: 'signup', 'settings', 'cookie_banner'
  document_url  text,
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,                 -- null = active consent
  created_at    timestamptz not null default now()
);

-- at most one active consent per (user, document type)
create unique index consent_records_active_uq
  on consent_records (user_id, consent_type) where withdrawn_at is null;
create index consent_records_user_idx on consent_records (user_id, consent_type, granted_at desc);

-- ============================================================================
-- 4. TAXONOMY (lookup tables — member/admin extensible, §18)
-- ============================================================================

create table tags (
  id                  uuid primary key default gen_random_uuid(),
  name                citext not null unique,
  description         text,
  source              content_source not null default 'member',
  created_by_user_id  uuid references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint tags_name_format check (name ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$')
);

create table listing_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_en     text not null,
  name_so     text, -- bilingual UI (§22); Somali strings are a human input
  position    smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 5. PLAZA (§15)
-- ============================================================================

create table posts (
  id              uuid primary key default gen_random_uuid(),
  author_user_id  uuid not null references users (id),
  -- Lab-scoped post = a Space's discussion/activity surface. v1.0 has NO
  -- separate Space chat/messages table (§13 "no group DMs — same as a space"):
  -- a Space's conversation IS its lab-scoped Plaza posts. NULL = global Plaza.
  -- FK added via ALTER after labs is defined (see below).
  lab_id          uuid,
  type            post_type not null,
  title           text,
  body            text not null,
  link_url        text,          -- embed-first video/link (§15); previews resolved at app layer
  image_urls      text[] not null default '{}', -- Supabase Storage paths, WebP, EXIF-stripped
  ask_status      ask_status,    -- Ask lifecycle only (§15)
  ask_nudged_at   timestamptz,   -- set when the 7-day stale-Ask nudge fires (§15/§26)
  poll_status     poll_status,   -- Poll lifecycle only; open until closed
  poll_closes_at  timestamptz,   -- optional scheduled auto-close for polls
  status          content_status not null default 'published',
  source          content_source not null default 'member',
  pinned_at       timestamptz,   -- weekly highlights slot (§15)
  edited_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint posts_ask_status_only_for_asks check ((type = 'ask') = (ask_status is not null)),
  constraint posts_poll_status_only_for_polls check ((type = 'poll') = (poll_status is not null)),
  constraint posts_poll_closes_requires_poll check (poll_closes_at is null or type = 'poll'),
  -- FK target so poll_options can be pinned to a poll-type post declaratively
  constraint posts_id_type_unique unique (id, type)
);

create index posts_feed_idx on posts (created_at desc) where status = 'published';
create index posts_type_feed_idx on posts (type, created_at desc) where status = 'published';
create index posts_author_idx on posts (author_user_id, created_at desc);
create index posts_open_asks_idx on posts (created_at)
  where type = 'ask' and ask_status = 'open' and ask_nudged_at is null; -- 7-day stale-Ask nudge (un-nudged only)
create index posts_polls_closing_idx on posts (poll_closes_at)
  where type = 'poll' and poll_status = 'open' and poll_closes_at is not null; -- poll auto-close sweep
create index posts_pinned_idx on posts (pinned_at desc) where pinned_at is not null;

-- Comments attach to EITHER a Plaza post OR a Venture Candidate ("open member
-- comments below", §12 Capital decision). Exactly one target per row.
create table comments (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid references posts (id) on delete cascade,
  candidate_id        uuid, -- FK to venture_candidates added via ALTER below (defined later)
  author_user_id      uuid not null references users (id),
  body                text not null,
  -- Ask lifecycle: the asker credits ONE answer; its author earns Helper score
  -- (§15). Lives here (not on posts) to avoid a posts<->comments FK cycle.
  -- Only meaningful on Ask posts (Helper-score jobs must join posts.type='ask').
  is_credited_answer  boolean not null default false,
  status              content_status not null default 'published',
  source              content_source not null default 'member',
  edited_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint comments_exactly_one_target check (num_nonnulls(post_id, candidate_id) = 1),
  constraint comments_credit_only_on_posts check (is_credited_answer = false or post_id is not null)
);

create index comments_post_idx on comments (post_id, created_at) where post_id is not null;
create index comments_candidate_idx on comments (candidate_id, created_at) where candidate_id is not null;
create index comments_author_idx on comments (author_user_id);
create unique index comments_one_credited_answer_per_post
  on comments (post_id) where is_credited_answer;

create table post_tags (
  post_id     uuid not null references posts (id) on delete cascade,
  tag_id      uuid not null references tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, tag_id)
);

create index post_tags_tag_idx on post_tags (tag_id);

-- Poll mechanics (locked in Build Tracker; single-choice assumed — flagged)
create table poll_options (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null,
  post_type   post_type not null default 'poll', -- guarantees the parent post is a poll
  label       text not null,
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  -- Seq 14: 2–6 options. Upper bound (max 6) enforced here via position 0..5;
  -- the 2-option minimum is a row-count rule enforced at the app layer.
  constraint poll_options_position_range check (position between 0 and 5),
  constraint poll_options_only_polls check (post_type = 'poll'),
  -- composite FK: parent post must exist AND be type='poll'
  constraint poll_options_post_is_poll
    foreign key (post_id, post_type) references posts (id, type) on delete cascade,
  constraint poll_options_unique_position unique (post_id, position),
  -- composite target for poll_votes so a vote's option always belongs to its poll
  constraint poll_options_id_post_unique unique (id, post_id)
);

-- One row per (poll, voter): a member re-casts by UPDATEing poll_option_id, or
-- INSERT ... ON CONFLICT (post_id, voter_user_id) DO UPDATE. The composite FK
-- guarantees the (possibly changed) option still belongs to this poll.
create table poll_votes (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts (id) on delete cascade,
  poll_option_id  uuid not null,
  voter_user_id   uuid not null references users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint poll_votes_option_belongs_to_poll
    foreign key (poll_option_id, post_id) references poll_options (id, post_id) on delete cascade,
  constraint poll_votes_one_per_poll unique (post_id, voter_user_id)
);

create index poll_votes_option_idx on poll_votes (poll_option_id);

-- Reaction taxonomy (§20): 🔥 fire · 💪 strong · 🤲 mashallah · 💡 idea · 👀 watching
create table reactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  post_id     uuid references posts (id) on delete cascade,
  comment_id  uuid references comments (id) on delete cascade,
  type        reaction_type not null,
  created_at  timestamptz not null default now(),
  constraint reactions_exactly_one_target check (num_nonnulls(post_id, comment_id) = 1)
);

create unique index reactions_post_unique on reactions (user_id, post_id, type) where post_id is not null;
create unique index reactions_comment_unique on reactions (user_id, comment_id, type) where comment_id is not null;
create index reactions_post_idx on reactions (post_id) where post_id is not null;
create index reactions_comment_idx on reactions (comment_id) where comment_id is not null;

-- ============================================================================
-- 6. DIRECTORY & MAP (§18)
-- ============================================================================

create table business_listings (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid references users (id), -- nullable: seeded/unclaimed listings
  business_name           text not null,
  category_id             uuid not null references listing_categories (id),
  short_description       text,
  address                 text,
  landmark                text, -- §18: landmark field, Somali addressing
  latitude                double precision, -- manual pin-drop is primary input (§18)
  longitude               double precision,
  city                    text,
  country                 text,
  contact_links           jsonb not null default '[]'::jsonb, -- [{type, label, value}]
  verification_status     listing_verification_status not null default 'unverified',
  status                  content_status not null default 'published',
  source                  content_source not null default 'member',
  export_checklist        jsonb, -- export readiness (§18): documentation/certifications/capacity/contacts
  export_readiness_score  smallint,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint listings_latitude_range check (latitude is null or (latitude between -90 and 90)),
  constraint listings_longitude_range check (longitude is null or (longitude between -180 and 180)),
  constraint listings_export_score_range
    check (export_readiness_score is null or (export_readiness_score between 0 and 100))
);

create index listings_owner_idx on business_listings (owner_user_id);
create index listings_category_idx on business_listings (category_id);
create index listings_city_idx on business_listings (country, city);
create index listings_map_idx on business_listings (latitude, longitude)
  where latitude is not null and status = 'published'; -- map bounding-box queries
create index listings_status_idx on business_listings (status) where status <> 'published';

create table listing_tags (
  listing_id  uuid not null references business_listings (id) on delete cascade,
  tag_id      uuid not null references tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (listing_id, tag_id)
);

create index listing_tags_tag_idx on listing_tags (tag_id);

-- "Claim this listing" flow (§18)
create table listing_claims (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references business_listings (id) on delete cascade,
  claimant_user_id     uuid not null references users (id) on delete cascade,
  evidence             text,
  status               claim_status not null default 'pending',
  reviewed_by_user_id  uuid references users (id) on delete set null,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index listing_claims_listing_idx on listing_claims (listing_id) where status = 'pending';
create index listing_claims_claimant_idx on listing_claims (claimant_user_id);

-- Deferred FK: business verifications target a listing (§14). Added here because
-- business_listings is defined after verifications.
alter table verifications
  add constraint verifications_listing_fk
  foreign key (listing_id) references business_listings (id) on delete set null;

-- ============================================================================
-- 7. SPACES / LABS (§16 — unified Spaces model: one entity + space_mode)
-- ============================================================================

-- Lab playbooks (§16): pre-built charter templates per venture type
create table lab_playbooks (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name                text not null,
  venture_type        text not null, -- e-commerce, import/export, services, SaaS, agri-food
  template            jsonb not null default '{}'::jsonb, -- AI-generated charter starter fields
  source              content_source not null default 'seed',
  is_active           boolean not null default true,
  created_by_user_id  uuid references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table labs (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  citext not null unique, -- public build-in-public pages are SEO-indexed (§16)
  space_mode            space_mode not null default 'club', -- Spaces start casual; promote-only ladder (§16)
  short_description     text,
  -- Charter fields (§10); completing the charter is the Club -> Lab quality gate
  problem_statement     text,
  hypothesis            text,
  sprint_length_weeks   smallint,
  sprint_deadline       timestamptz, -- Phase 0 requirement; public sprint countdown (§20)
  success_definition    text,
  charter_completed_at  timestamptz,
  promoted_at           timestamptz, -- Club -> Lab promotion (never demoted automatically)
  stage                 lab_stage not null default 'idea',
  -- RLS- and Discover-filtered Space settings are TYPED columns (not jsonb):
  visibility            lab_visibility not null default 'members', -- Phase 0 requirement (private/members/public)
  is_listed             boolean not null default true, -- listed in Discover vs unlisted-but-link-accessible
  is_supporter_only     boolean not null default false, -- Space gated to Supporter members (§26 membership)
  member_list_visibility lab_visibility not null default 'members', -- "member view" Space setting (§16)
  join_mode             lab_join_mode not null default 'request',
  lead_user_id          uuid not null references users (id),
  playbook_id           uuid references lab_playbooks (id) on delete set null,
  source                content_source not null default 'member',
  -- Open/low-cardinality Space settings only (post approval, slow mode, allowed
  -- post types, pinned posts) — never the RLS/Discover-filtered ones above.
  settings              jsonb not null default '{}'::jsonb, -- §16 "Posts & Content" Space settings
  last_activity_at      timestamptz not null default now(),
  dormant_since         timestamptz, -- set after 28 days of no activity (§16/§26); instantly revivable
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- cast to text so the lowercase rule is enforced (citext ~ is case-insensitive);
  -- no leading/trailing hyphen
  constraint labs_slug_format check (slug::text ~ '^[a-z0-9]([a-z0-9-]{0,59}[a-z0-9])?$'),
  constraint labs_sprint_length_range
    check (sprint_length_weeks is null or (sprint_length_weeks between 1 and 52))
);

create index labs_visibility_idx on labs (visibility);
create index labs_mode_idx on labs (space_mode);
create index labs_lead_idx on labs (lead_user_id);
create index labs_stage_idx on labs (stage);
-- Discover feed: listed, public Spaces sorted by activity
create index labs_discover_idx on labs (last_activity_at desc)
  where is_listed and visibility = 'public';
create index labs_activity_idx on labs (last_activity_at) where dormant_since is null; -- dormancy sweep
create index labs_dormant_idx on labs (dormant_since) where dormant_since is not null;

-- Deferred FK: posts can be scoped to a Lab (Space discussion surface). Added
-- here because posts is defined before labs.
alter table posts
  add constraint posts_lab_fk foreign key (lab_id) references labs (id) on delete cascade;
create index posts_lab_idx on posts (lab_id, created_at desc) where lab_id is not null;

create table lab_members (
  lab_id              uuid not null references labs (id) on delete cascade,
  user_id             uuid not null references users (id) on delete cascade,
  role                lab_member_role not null default 'member',
  specialization      lab_member_specialization, -- Operator / Researcher / Advisor (§26)
  status              lab_member_status not null default 'active',
  invited_by_user_id  uuid references users (id) on delete set null,
  requested_at        timestamptz,
  joined_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (lab_id, user_id)
);

create index lab_members_user_idx on lab_members (user_id);
create index lab_members_requests_idx on lab_members (lab_id) where status = 'requested';

create table lab_tags (
  lab_id      uuid not null references labs (id) on delete cascade,
  tag_id      uuid not null references tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (lab_id, tag_id)
);

create index lab_tags_tag_idx on lab_tags (tag_id);

-- Inter-Lab collaboration (§16): formal link, shared updates, co-owned Candidates
create table lab_collaborations (
  id                   uuid primary key default gen_random_uuid(),
  lab_a_id             uuid not null references labs (id) on delete cascade,
  lab_b_id             uuid not null references labs (id) on delete cascade,
  status               lab_collaboration_status not null default 'proposed',
  proposed_by_user_id  uuid references users (id) on delete set null,
  responded_at         timestamptz,
  ended_at             timestamptz,
  created_at           timestamptz not null default now(),
  constraint lab_collaborations_distinct check (lab_a_id <> lab_b_id)
);

create unique index lab_collaborations_pair_uq
  on lab_collaborations (least(lab_a_id, lab_b_id), greatest(lab_a_id, lab_b_id))
  where status in ('proposed', 'accepted');
create index lab_collaborations_a_idx on lab_collaborations (lab_a_id);
create index lab_collaborations_b_idx on lab_collaborations (lab_b_id);

create table lab_updates (
  id                uuid primary key default gen_random_uuid(),
  lab_id            uuid not null references labs (id) on delete cascade,
  author_user_id    uuid not null references users (id),
  title             text,
  body              text not null,
  -- When set, this update is cross-posted to both Labs in the collaboration (§16).
  -- The collaboration must involve this lab_id and be 'accepted' — enforced at
  -- the app layer (not declaratively expressible without a trigger).
  collaboration_id  uuid references lab_collaborations (id) on delete set null,
  status            content_status not null default 'published', -- moderatable (§19)
  source            content_source not null default 'member',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index lab_updates_lab_idx on lab_updates (lab_id, created_at desc);
create index lab_updates_author_idx on lab_updates (author_user_id);
create index lab_updates_collab_idx on lab_updates (collaboration_id) where collaboration_id is not null;

-- Artifacts are shared links ONLY in v1.0 (§3, §16 — no file uploads)
create table lab_artifacts (
  id                 uuid primary key default gen_random_uuid(),
  lab_id             uuid not null references labs (id) on delete cascade,
  added_by_user_id   uuid not null references users (id),
  title              text not null,
  url                text not null,
  description        text,
  status             content_status not null default 'published', -- moderatable (§19)
  created_at         timestamptz not null default now()
);

create index lab_artifacts_lab_idx on lab_artifacts (lab_id, created_at desc);

-- Decision log (§16)
create table lab_decisions (
  id                  uuid primary key default gen_random_uuid(),
  lab_id              uuid not null references labs (id) on delete cascade,
  created_by_user_id  uuid not null references users (id),
  title               text not null,
  context             text,
  decision            text not null,
  status              content_status not null default 'published', -- moderatable (§19)
  decided_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create index lab_decisions_lab_idx on lab_decisions (lab_id, decided_at desc);

-- Space History / activity log (§16): promotions, joins/exits, charter
-- completion, dormancy events, badge & reputation changes
create table lab_events (
  id             uuid primary key default gen_random_uuid(),
  lab_id         uuid not null references labs (id) on delete cascade,
  actor_user_id  uuid references users (id) on delete set null,
  event_type     text not null, -- app-level constants (promoted, member_joined, marked_dormant, ...)
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index lab_events_lab_idx on lab_events (lab_id, created_at desc);

-- "Looking for" skills (§16/§20): drives directory card + skills-gap alerts
create table lab_skill_needs (
  id                 uuid primary key default gen_random_uuid(),
  lab_id             uuid not null references labs (id) on delete cascade,
  skill              text not null,
  created_at         timestamptz not null default now(),
  alerted_at         timestamptz, -- skills-gap alert sent after 7 days unmatched (§16)
  filled_at          timestamptz,
  filled_by_user_id  uuid references users (id) on delete set null
);

create unique index lab_skill_needs_open_uq on lab_skill_needs (lab_id, skill) where filled_at is null;
create index lab_skill_needs_matching_idx on lab_skill_needs (skill) where filled_at is null;

-- Pinned Labs on profiles (§20): members feature 1–3 Labs on their profile
create table profile_pinned_labs (
  user_id     uuid not null references users (id) on delete cascade,
  lab_id      uuid not null references labs (id) on delete cascade,
  position    smallint not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, lab_id),
  constraint profile_pinned_labs_position_range check (position between 1 and 3),
  constraint profile_pinned_labs_position_uq unique (user_id, position)
);

create index profile_pinned_labs_lab_idx on profile_pinned_labs (lab_id);

-- ============================================================================
-- 8. CAPITAL (§17)
-- ============================================================================

create table venture_candidates (
  id                       uuid primary key default gen_random_uuid(),
  lab_id                   uuid not null references labs (id),
  co_lab_id                uuid references labs (id), -- co-owned via inter-Lab collaboration (§16)
  created_by_user_id       uuid not null references users (id),
  name                     text not null,
  one_liner                text,
  problem                  text,
  solution                 text,
  traction                 text,
  team                     text,
  ask                      text, -- funding ask; v1.0 is intent capture + manual ops (§17)
  status                   candidate_status not null default 'draft',
  status_reason            text, -- decline/park reasons are visible (§17)
  visibility               candidate_visibility not null default 'all_members',
  region_gated             boolean not null default true, -- §10; investment language gating (§17)
  -- Aggregate rubric scores (§10); per-reviewer scores live in candidate_reviews
  rubric_team_score        numeric(3, 2),
  rubric_traction_score    numeric(3, 2),
  rubric_feasibility_score numeric(3, 2),
  notes                    text,
  timeline_public          boolean not null default false, -- venture timeline needs Lab permission (§17)
  vote_opens_at            timestamptz, -- Supporter governance vote: 7-day window (§12)
  vote_closes_at           timestamptz,
  submitted_at             timestamptz,
  decided_at               timestamptz,
  funded_at                timestamptz, -- terminal timeline milestone (§17); display only, no financial flow
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint candidates_rubric_team_range
    check (rubric_team_score is null or (rubric_team_score between 1 and 5)),
  constraint candidates_rubric_traction_range
    check (rubric_traction_score is null or (rubric_traction_score between 1 and 5)),
  constraint candidates_rubric_feasibility_range
    check (rubric_feasibility_score is null or (rubric_feasibility_score between 1 and 5)),
  constraint candidates_co_lab_distinct check (co_lab_id is null or co_lab_id <> lab_id)
);

create index candidates_lab_idx on venture_candidates (lab_id);
create index candidates_co_lab_idx on venture_candidates (co_lab_id) where co_lab_id is not null;
create index candidates_status_idx on venture_candidates (status, created_at desc);
create index candidates_created_by_idx on venture_candidates (created_by_user_id);

-- Role-based reviews with recusal (§17); recusal enforced at RLS/app layer
create table candidate_reviews (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references venture_candidates (id) on delete cascade,
  reviewer_user_id   uuid not null references users (id),
  team_score         smallint,
  traction_score     smallint,
  feasibility_score  smallint,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint reviews_team_range check (team_score is null or (team_score between 1 and 5)),
  constraint reviews_traction_range check (traction_score is null or (traction_score between 1 and 5)),
  constraint reviews_feasibility_range check (feasibility_score is null or (feasibility_score between 1 and 5)),
  constraint reviews_one_per_reviewer unique (candidate_id, reviewer_user_id)
);

create index candidate_reviews_reviewer_idx on candidate_reviews (reviewer_user_id);

-- Deferred FK: comments can now target a Candidate (open member comments, §12).
-- Added here because venture_candidates is defined after comments.
alter table comments
  add constraint comments_candidate_fk
  foreign key (candidate_id) references venture_candidates (id) on delete cascade;

-- Supporter governance signal vote (§12/§17): quorum 5 or 20%, 60% approval,
-- 7-day window — tallying happens at app layer; this is the raw ballot.
create table candidate_votes (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references venture_candidates (id) on delete cascade,
  voter_user_id  uuid not null references users (id) on delete cascade,
  vote           vote_choice not null,
  created_at     timestamptz not null default now(),
  constraint candidate_votes_one_per_voter unique (candidate_id, voter_user_id)
);

-- Interest capture (§6/§17): "I can help" · Garab/Co-sign (never gated) ·
-- Maalgeli/Invest intent (Somalia-region gated at RLS/app layer).
-- candidate_id is nullable ONLY for fund-first invest intent: the Maalgeli CTA
-- routes to the Xidig Venture Fund first (§17), which is not candidate-specific.
create table interests (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid references venture_candidates (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  type          interest_type not null,
  message       text,
  created_at    timestamptz not null default now(),
  constraint interests_fund_intent_is_invest check (candidate_id is not null or type = 'invest'),
  constraint interests_one_per_type unique (candidate_id, user_id, type)
);

create index interests_candidate_idx on interests (candidate_id) where candidate_id is not null;
create index interests_user_idx on interests (user_id);
-- one standing fund-level invest intent per user (candidate_id is null)
create unique index interests_one_fund_invest_per_user
  on interests (user_id) where candidate_id is null and type = 'invest';

-- Capital-gate compliance log (Seq 6 / §17): every evaluation of the Somalia-
-- region gate is recorded server-side — the three inputs (profile country,
-- geo-IP-derived country, self-attestation) and the resulting decision — so the
-- Capital compliance spec is auditable. Per-session geo-IP is NOT stored beyond
-- its derived country. Append-only; the record persists through anonymisation.
create table capital_gate_evaluations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users (id),
  profile_country   text,
  geo_ip_country    text,          -- derived country only, never the raw IP
  attested          boolean not null default false,
  granted           boolean not null, -- final gate result (investment language / Maalgeli shown?)
  reason            text,          -- e.g. 'granted', 'country_mismatch', 'no_attestation'
  candidate_id      uuid references venture_candidates (id) on delete set null, -- context, if any
  created_at        timestamptz not null default now()
);

create index capital_gate_evaluations_user_idx on capital_gate_evaluations (user_id, created_at desc);

-- ============================================================================
-- 9. SOCIAL GRAPH & DMs (§13)
-- ============================================================================

-- Polymorphic follow target (§10): referential integrity for target_id is
-- enforced at the app layer (flagged in Phase 0 notes).
create table follows (
  id                uuid primary key default gen_random_uuid(),
  follower_user_id  uuid not null references users (id) on delete cascade,
  target_type       follow_target_type not null,
  target_id         uuid not null,
  created_at        timestamptz not null default now(),
  constraint follows_unique unique (follower_user_id, target_type, target_id),
  constraint follows_no_self check (not (target_type = 'user' and target_id = follower_user_id))
);

create index follows_target_idx on follows (target_type, target_id);

-- Strictly 1:1 in v1.0 (§13: "no group DMs"); two participant columns instead
-- of §10's participantIds[] so uniqueness + request-to-chat are enforceable.
-- No ON DELETE CASCADE on the participant FKs: a conversation (and its
-- messages) must survive the anonymisation of either participant so the other
-- keeps their DM history (§19 anonymise-not-delete).
create table conversations (
  id                      uuid primary key default gen_random_uuid(),
  initiator_user_id       uuid not null references users (id),
  recipient_user_id       uuid not null references users (id),
  status                  conversation_status not null default 'pending',
  initiator_last_read_at  timestamptz,
  recipient_last_read_at  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint conversations_distinct_participants check (initiator_user_id <> recipient_user_id)
);

create unique index conversations_pair_uq on conversations
  (least(initiator_user_id, recipient_user_id), greatest(initiator_user_id, recipient_user_id));
create index conversations_recipient_requests_idx on conversations (recipient_user_id)
  where status = 'pending';
create index conversations_initiator_idx on conversations (initiator_user_id);
create index conversations_recipient_idx on conversations (recipient_user_id); -- inbox list (both roles)

-- Supabase Realtime subscribes to this table filtered by conversation_id (Phase 3)
create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations (id) on delete cascade,
  sender_user_id   uuid not null references users (id),
  body             text not null,
  deleted_at       timestamptz, -- moderation removal; content anonymised, not erased (§19)
  created_at       timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);
create index messages_sender_idx on messages (sender_user_id);

-- ============================================================================
-- 10. BADGES, REPUTATION, AWARDS (§14, §20)
-- ============================================================================

-- Lookup (admin "badge management", §26) rather than enum: new badge types
-- must not require a migration.
create table badge_definitions (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table user_badges (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users (id) on delete cascade,
  badge_id            uuid not null references badge_definitions (id),
  tier                text, -- §10 Badge.tier; values not enumerated in PRD (flagged)
  context             text, -- disambiguates repeatable awards (e.g. '2026-Q3' for quarterly)
  awarded_by_user_id  uuid references users (id) on delete set null, -- null = system-awarded
  awarded_at          timestamptz not null default now(),
  revoked_at          timestamptz,
  metadata            jsonb not null default '{}'::jsonb
);

-- Partial on revoked_at IS NULL: a revoked badge (row kept for history) can be
-- re-awarded with the same context — the revoke -> re-verify path is real (§14).
create unique index user_badges_uq
  on user_badges (user_id, badge_id, coalesce(context, '')) where revoked_at is null;
create index user_badges_user_idx on user_badges (user_id);
create index user_badges_badge_idx on user_badges (badge_id);

-- Append-only ledger driving scores: 30 pt/day caps + 90-day decay (§12/§14)
-- are computed from this at the app/job layer.
create table reputation_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  event_type   text not null, -- app-level constants (post_created, ask_credited, ...)
  points       smallint not null,
  entity_type  entity_type,
  entity_id    uuid,
  created_at   timestamptz not null default now()
);

create index reputation_events_user_idx on reputation_events (user_id, created_at desc);

-- Materialized current scores (§6 "Reputation Score"); recomputed by jobs
create table reputation_scores (
  user_id              uuid primary key references users (id) on delete cascade,
  contribution_score   integer not null default 0,
  helper_score         integer not null default 0,
  current_streak_days  integer not null default 0, -- streaks are cosmetic-only in v1.0 (§12)
  longest_streak_days  integer not null default 0,
  last_active_on       date,
  updated_at           timestamptz not null default now()
);

-- Community Awards (§20): quarterly, member-voted; results posted to Plaza
create table award_votes (
  id             uuid primary key default gen_random_uuid(),
  quarter        text not null, -- e.g. '2026-Q3'
  category       award_category not null,
  voter_user_id  uuid not null references users (id) on delete cascade,
  target_type    entity_type not null,
  target_id      uuid not null,
  created_at     timestamptz not null default now(),
  constraint award_votes_quarter_format check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  constraint award_votes_one_per_category unique (quarter, category, voter_user_id)
);

create index award_votes_tally_idx on award_votes (quarter, category, target_type, target_id);

-- ============================================================================
-- 11. NOTIFICATIONS (§9, §22, §26)
-- ============================================================================

-- type is TEXT (app-level constants): notification kinds change every release
-- and must not require a migration. Bundling (§22) groups by (type, bundle_key)
-- at read time.
create table notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  actor_user_id  uuid references users (id) on delete set null,
  type           text not null, -- reply, mention, lab_update, candidate_status, dm_request, ...
  entity_type    entity_type,
  entity_id      uuid,
  payload        jsonb not null default '{}'::jsonb,
  bundle_key     text,
  read_at        timestamptz,
  emailed_at     timestamptz, -- email channel per notification matrix (§26)
  pushed_at      timestamptz, -- PWA push channel per notification matrix (§26)
  created_at     timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- Web Push subscriptions (§22 PWA push; §26 push matrix). notifications.pushed_at
-- records that a push was sent; this stores WHERE to send it (per device).
create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions (user_id) where revoked_at is null;

-- ============================================================================
-- 12. MODERATION & GOVERNANCE (§19)
-- ============================================================================

create table reports (
  id                   uuid primary key default gen_random_uuid(),
  reporter_user_id     uuid not null references users (id),
  target_type          entity_type not null,
  target_id            uuid not null,
  reason               report_reason not null,
  details              text,
  status               report_status not null default 'open',
  resolution           text, -- visible outcome (§19)
  resolved_by_user_id  uuid references users (id) on delete set null,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index reports_queue_idx on reports (status, created_at); -- mod queue + 48h SLA timer
create index reports_target_idx on reports (target_type, target_id);
create index reports_reporter_idx on reports (reporter_user_id);

create table mod_actions (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid not null references users (id),
  action         mod_action_type not null,
  target_type    entity_type not null,
  target_id      uuid not null,
  report_id      uuid references reports (id) on delete set null,
  reason         text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index mod_actions_target_idx on mod_actions (target_type, target_id);
create index mod_actions_actor_idx on mod_actions (actor_user_id, created_at desc);
create index mod_actions_report_idx on mod_actions (report_id);

-- One appeal per action, routed to a second mod/admin (§19)
create table appeals (
  id                   uuid primary key default gen_random_uuid(),
  mod_action_id        uuid not null references mod_actions (id) on delete cascade,
  appellant_user_id    uuid not null references users (id),
  body                 text not null,
  status               appeal_status not null default 'pending',
  reviewed_by_user_id  uuid references users (id) on delete set null,
  decision_notes       text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint appeals_one_per_action unique (mod_action_id)
);

create index appeals_pending_idx on appeals (created_at) where status = 'pending';

-- Transparent governance log (§19): platform-level decisions, public to members
create table governance_log_entries (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  body                text not null,
  category            text, -- rule_change, policy_update, feature_vote_result, ...
  created_by_user_id  uuid references users (id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index governance_log_published_idx on governance_log_entries (published_at desc)
  where published_at is not null;

-- ============================================================================
-- 13. PLATFORM: API KEYS & AUDIT LOG (§19, §21)
-- ============================================================================

-- Scoped, rate-limited, audited API keys for the REST/MCP layer (Phase 8).
-- owner_user_id is NO ACTION (revoke via revoked_at, never hard-delete) so
-- audit_logs.api_key_id references stay stable (§21 "audited").
create table api_keys (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users (id),
  name           text not null,
  key_hash       text not null unique, -- only a hash is stored, never the key
  key_prefix     text not null,        -- display prefix, e.g. 'xdg_live_ab12'
  scopes         text[] not null default '{}',
  last_used_at   timestamptz,
  expires_at     timestamptz, -- null = never expires; Phase 8 distinguishes expired keys (§27 403)
  revoked_at     timestamptz,
  created_at     timestamptz not null default now()
);

create index api_keys_owner_idx on api_keys (owner_user_id);
create index api_keys_active_idx on api_keys (key_prefix) where revoked_at is null; -- auth lookup

-- Outbound webhook subscriptions (§21: "REST API + webhooks + MCP server")
create table webhook_endpoints (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null references users (id),
  api_key_id       uuid references api_keys (id) on delete set null,
  url              text not null,
  secret           text not null, -- HMAC signing secret
  event_types      text[] not null default '{}',
  is_active        boolean not null default true,
  last_delivery_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index webhook_endpoints_owner_idx on webhook_endpoints (owner_user_id);

-- Immutable audit log (§19): every mod/admin action + API writes. Append-only;
-- UPDATE/DELETE revocation is enforced alongside RLS in a later phase.
-- actor_user_id is NO ACTION (not SET NULL) so attribution is never silently
-- rewritten; NULL still means "system" for rows inserted without an actor.
-- Convention for slug-keyed targets (e.g. membership tier changes):
-- target_type = 'membership_tier', target_id = NULL, metadata->>'tier_id' = slug.
create table audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid references users (id), -- null (at insert) = system
  api_key_id     uuid references api_keys (id) on delete set null,
  action         text not null,
  target_type    entity_type,
  target_id      uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index audit_logs_actor_idx on audit_logs (actor_user_id, created_at desc);
create index audit_logs_target_idx on audit_logs (target_type, target_id);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_api_key_idx on audit_logs (api_key_id) where api_key_id is not null;

-- ============================================================================
-- 14. updated_at TRIGGERS (every table that has an updated_at column)
-- ============================================================================

do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
  loop
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t.table_name || '_set_updated_at', t.table_name
    );
  end loop;
end;
$$;

-- ============================================================================
-- 15. REFERENCE DATA (approved constants, §26 — idempotent)
-- ============================================================================

insert into membership_tiers (id, name, monthly_price_usd, position) values
  ('free',      'Free Member', 0,    1),
  ('supporter', 'Supporter',   1.00, 2)
on conflict (id) do nothing;

-- Free members get only the universal (non-gated) surface, so no capability
-- rows. Supporter unlocks the gated actions (§26/§17); Builder/Investor are
-- paths under Supporter (Investor additionally needs enhanced verification).
-- A future tier is one INSERT above + rows here — no migration.
insert into tier_capabilities (tier_id, capability) values
  ('supporter', 'create_lab'),
  ('supporter', 'join_unlimited_labs'),
  ('supporter', 'vote_candidate'),
  ('supporter', 'governance_rights'),
  ('supporter', 'builder_path'),
  ('supporter', 'investor_path'),
  ('supporter', 'intelligence_updates')
on conflict (tier_id, capability) do nothing;

insert into listing_categories (slug, name_en, position) values
  ('restaurant-food',       'Restaurant & Food',      1),
  ('retail',                'Retail',                 2),
  ('professional-services', 'Professional Services',  3),
  ('tech-digital',          'Tech & Digital',         4),
  ('import-export',         'Import/Export',          5),
  ('transport-logistics',   'Transport & Logistics',  6),
  ('beauty-fashion',        'Beauty & Fashion',       7),
  ('construction',          'Construction',           8),
  ('agriculture',           'Agriculture',            9),
  ('education',             'Education',             10),
  ('health',                'Health',                11),
  ('media-creative',        'Media & Creative',      12),
  ('finance',               'Finance',               13),
  ('real-estate',           'Real Estate',           14),
  ('travel',                'Travel',                15)
on conflict (slug) do nothing;

insert into tags (name, source) values
  ('fintech', 'seed'), ('logistics', 'seed'), ('import-export', 'seed'),
  ('agri-food', 'seed'), ('e-commerce', 'seed'), ('real-estate', 'seed'),
  ('construction', 'seed'), ('education', 'seed'), ('health', 'seed'),
  ('media', 'seed'), ('fashion', 'seed'), ('travel', 'seed'),
  ('energy', 'seed'), ('halal-finance', 'seed'), ('diaspora', 'seed')
on conflict (name) do nothing;

insert into badge_definitions (slug, name, description) values
  ('founding-member',     'Founding Member',     'One of the first 500 members of Xidig'),
  ('lab-lead',            'Lab Lead',            'Leads a Lab'),
  ('top-helper',          'Top Helper',          'Credited for resolving member Asks'),
  ('early-backer',        'Early Backer',        'Backed a Venture Candidate early'),
  ('mentor-in-residence', 'Mentor in Residence', 'Rotating verified Advisor answering Asks weekly'),
  ('identity-verified',   'Identity Verified',   'Verified via live video call'),
  ('community-verified',  'Community Verified',  'Vouched for by 3 verified members'),
  ('verified-business',   'Verified Business',   'Business verified via premises video, documents, or admin call')
on conflict (slug) do nothing;
