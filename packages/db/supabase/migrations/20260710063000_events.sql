-- ============================================================================
-- Xidig v1.0 — Extras item 8: Events + RSVP (design locked 10 Jul)
-- ============================================================================
-- Standalone spine, embedded surfaces (docs/social-app-extras-plan.md item 8):
-- an `events` table with its own shareable page, a REQUIRED accountable host
-- (a member) and an OPTIONAL container link (Lab/Club, business listing, or
-- venture candidate — at most one). Discovery is merged, not siloed (host
-- profile / Lab page / listing page sections, digest slot, Plaza auto-post).
--
-- Locked privacy defaults (load-bearing, not polish):
--   * attendee list is HOST-only; per-RSVP opt-in "show me as attending";
--   * public sees an aggregate count only above the N>=5 floor (app-enforced —
--     counts are aggregates served by the API, same stance as follower counts);
--   * venue address granularity is a host toggle (everyone vs confirmed
--     attendees), default attendees-only for physical venues;
--   * online_url reveals to confirmed attendees + host only (app-enforced);
--   * the login-free public projection NEVER carries venue_address/online_url.
--
-- Taxonomy: category is a slug-PK LOOKUP table (house rule — extensible
-- taxonomies are lookup tables; membership_tiers precedent). Mode / lifecycle
-- status / visibility / address visibility / RSVP status are closed state
-- machines → enums. Moderation mirrors posts: a separate moderation_status
-- content_status column ('published'/'hidden'/'removed') driven by the §15 AI
-- pre-scan + HITL queue and Phase 6 mod actions, so the lifecycle machine
-- (draft/published/cancelled) never collides with moderation state.
--
-- Write model (same reasoning as Plaza posts / Labs): NO client
-- insert/update/delete policies. Creation rights (Lab organizers / verified
-- businesses / mods+admins), slug allocation, capacity checks, the moderation
-- pre-scan, the Plaza auto-post and RSVP capacity floors are API obligations
-- the database cannot express — the API (service role, after explicit authz)
-- is the only writer.
-- ============================================================================

-- ============================================================================
-- 1. ENUMS (closed state machines) + entity_type extension
-- ============================================================================

create type event_mode as enum ('online', 'in_person', 'hybrid');

-- Lifecycle only; moderation state lives in moderation_status (content_status).
create type event_status as enum ('draft', 'published', 'cancelled');

-- public     = renders on the login-free /events surface + homepage block;
-- members    = any signed-in member;
-- space_only = active members of the linked Lab/Club (requires lab_id).
create type event_visibility as enum ('public', 'members', 'space_only');

-- Host toggle for venue_address granularity (§ locked privacy defaults).
create type event_address_visibility as enum ('everyone', 'attendees');

-- going / interested only — absence means "no" (locked; no 'declined' state).
create type event_rsvp_status as enum ('going', 'interested');

-- Events are reportable / moderatable / notifiable content. (Value not
-- referenced elsewhere in THIS migration — a value added by ALTER TYPE cannot
-- be used in the same transaction; the app layer uses it.)
alter type entity_type add value if not exists 'event';

-- ============================================================================
-- 2. EVENT CATEGORIES (slug-PK lookup — extensible taxonomy, house rule)
-- ============================================================================
-- Celebration-vs-serious is a FILTER, never an access rule (locked design).

create table event_categories (
  slug        text primary key,
  name_en     text not null,
  name_so     text, -- bilingual UI (§22); Somali strings are a human input
  position    smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint event_categories_slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{0,48}$')
);

alter table event_categories enable row level security;

create policy event_categories_select_authenticated on event_categories
  for select to authenticated
  using (true);

revoke insert, update, delete on public.event_categories from anon, authenticated;

insert into event_categories (slug, name_en, name_so, position) values
  ('community', 'Community / meetup', 'Bulsho / kulan', 1),
  ('talk',      'Talk / AMA',         'Hadal / su’aal-jawaab', 2),
  ('demo_day',  'Demo day',           'Maalinta bandhigga', 3),
  ('workshop',  'Workshop',           'Tababar', 4),
  ('business',  'Business',           'Ganacsi', 5)
on conflict (slug) do nothing;

-- ============================================================================
-- 3. EVENTS
-- ============================================================================

create table events (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  description         text not null default '',
  category_id         text not null references event_categories (slug),
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  -- IANA zone the host scheduled in (starts_at stays UTC; this drives display
  -- + the ICS output so "7pm in Hargeisa" renders as the host meant it).
  timezone            text not null default 'UTC',
  mode                event_mode not null,
  venue_name          text,
  venue_address       text,
  address_visibility  event_address_visibility not null default 'attendees',
  online_url          text, -- confirmed-attendees-only reveal (app-enforced)
  host_user_id        uuid not null references users (id),
  -- Optional container: at most ONE of Lab/Club, business listing, candidate.
  lab_id              uuid references labs (id) on delete set null,
  listing_id          uuid references business_listings (id) on delete set null,
  candidate_id        uuid references venture_candidates (id) on delete set null,
  visibility          event_visibility not null default 'members',
  capacity            integer,
  featured_at         timestamptz, -- admin curation → homepage "next up" card
  -- T-24h reminder idempotency (locked design): the hourly cron claims events
  -- entering the 24h window by setting this, so RSVPed members are reminded
  -- exactly once per event no matter how often the cron re-runs.
  reminded_at         timestamptz,
  status              event_status not null default 'published',
  moderation_status   content_status not null default 'published',
  source              content_source not null default 'member',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint events_slug_format check (slug ~ '^[a-z0-9]([a-z0-9-]{0,79}[a-z0-9])?$'),
  constraint events_one_container check (num_nonnulls(lab_id, listing_id, candidate_id) <= 1),
  constraint events_space_only_needs_lab check (visibility <> 'space_only' or lab_id is not null),
  constraint events_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint events_capacity_positive check (capacity is null or capacity > 0)
);

-- Upcoming listings (member index + public projection + homepage block).
create index events_upcoming_idx on events (starts_at)
  where status = 'published' and moderation_status = 'published';
create index events_host_idx on events (host_user_id, starts_at desc);
create index events_lab_idx on events (lab_id) where lab_id is not null;
create index events_listing_idx on events (listing_id) where listing_id is not null;
create index events_candidate_idx on events (candidate_id) where candidate_id is not null;
create index events_featured_idx on events (featured_at desc) where featured_at is not null;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

alter table events enable row level security;

-- Members read published events per visibility; hosts always see their own
-- rows in any state (draft preview, cancelled banner, awaiting-review banner);
-- mods see everything (moderation reach). Anonymous readers get NOTHING via
-- RLS — the login-free surface is the service-role narrow projection
-- (src/lib/events/views.ts), house convention.
create policy events_select_visible on events
  for select to authenticated
  using (
    host_user_id = (select auth.uid())
    or public.is_mod()
    or (
      status in ('published', 'cancelled') -- cancelled stays readable (banner) for members who saw it
      and moderation_status = 'published'
      and (
        visibility in ('public', 'members')
        or (visibility = 'space_only' and lab_id is not null and public.is_lab_member(lab_id))
      )
    )
  );

revoke insert, update, delete on public.events from anon, authenticated;

-- Column scoping (profiles precedent, 20260704200000): venue_address and
-- online_url must NOT be member-readable through PostgREST — RLS is row-level
-- and cannot express "address for confirmed attendees only". Members read
-- every safe column; the two reveal-gated columns are served exclusively by
-- the API (service role) after the lib/events/views.ts privacy fold.
revoke select on public.events from anon, authenticated;
grant select (id, slug, title, description, category_id, starts_at, ends_at,
  timezone, mode, venue_name, address_visibility, host_user_id, lab_id,
  listing_id, candidate_id, visibility, capacity, featured_at, status,
  moderation_status, source, created_at, updated_at)
  on public.events to authenticated;

-- ============================================================================
-- 4. EVENT RSVPS
-- ============================================================================
-- One row per (event, member); status is going/interested. show_publicly is
-- the member's opt-in to appear by name to other members — default OFF.

create table event_rsvps (
  event_id       uuid not null references events (id) on delete cascade,
  user_id        uuid not null references users (id) on delete cascade,
  status         event_rsvp_status not null,
  show_publicly  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_rsvps_event_idx on event_rsvps (event_id, status);

create trigger event_rsvps_set_updated_at
  before update on event_rsvps
  for each row execute function set_updated_at();

alter table event_rsvps enable row level security;

-- Own rows + the event's host (their attendee list) + mods. Deliberately NOT
-- "anyone who can read the event": attendance is sensitive — other members
-- only ever see opted-in names / floor-gated aggregate counts, both served by
-- the API (service role), never by row enumeration.
create policy event_rsvps_select_own_or_host on event_rsvps
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_mod()
    or exists (
      select 1 from events e
      where e.id = event_rsvps.event_id
        and e.host_user_id = (select auth.uid())
    )
  );

-- Writes are API-only: the capacity check ("full" blocks new 'going',
-- interested keeps working), event visibility/status gates and the RSVP
-- notification are API obligations.
revoke insert, update, delete on public.event_rsvps from anon, authenticated;
