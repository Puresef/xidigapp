-- ============================================================================
-- Xidig v1.0 — Phase 4.5: experience expansion (media identity, listings depth,
-- settings, social features, page-blocks groundwork, search support)
-- ============================================================================
-- Additive companion to the Phase 0–4 chain. Covers the Phase 4.5 spec §1:
--
--   1. Media generalization: media_kinds lookup + kind/alt/blurhash/thumb
--      columns on media_uploads (every upload kind flows through the same
--      transcode + AI pre-scan pipeline).
--   2. Profiles: avatar/cover media columns (§13/§22 — attached by the API
--      after ownership + scan validation, never client-writable),
--      open_to_kinds lookup + profile_open_to chips, profile_pins (up to 3
--      pinned posts/labs/listings; cap enforced by PK + CHECK).
--   3. Listings (§18): opening_hours / price_range / primary-photo denorms on
--      business_listings, listing_photos (≤5, alt required) and
--      listing_services (≤20) — caps are API-layer rules.
--   4. Spaces + Candidates: icon/logo/cover media columns (groundwork;
--      Candidate UI is Phase 5).
--   5. Settings: user_settings (typed privacy/digest columns + preferences
--      jsonb for Lite/appearance prefs) and notification_prefs (overrides of
--      the §26 default matrix — absent row = default).
--   6. Social: bookmarks, post_drafts (cap 10/user at API), post_revisions
--      (edit history: author-or-mod readable), mutes.
--   7. Page-blocks groundwork (block_types + page_blocks) — schema + RLS
--      only, no UI this phase.
--   8. Search support: trigram indexes on posts.title and labs.name
--      (pg_trgm already installed by 20260705010000_member_search.sql).
--
-- Write model (same reasoning as Plaza / DMs / Labs): EVERY new table is
-- API-only at the DB layer — no client insert/update/delete grants or
-- policies. Writes carry API-side obligations the database cannot express
-- (media ownership + scan validation, pin target visibility checks, draft
-- caps, revision snapshots on PATCH, settings deep-merge + cookie mirroring,
-- notification-matrix validation). SELECT policies follow each surface's
-- visibility; `anon` matches no policy (house convention — pre-auth reads go
-- through the server's service-role projections).
--
-- Conventions: policies named <table>_<action>_<target>, written for
-- `authenticated` with auth.uid() wrapped in (select ...); citext slug PKs for
-- extensible lookups (new kind = one INSERT, zero migration); explicit
-- set_updated_at triggers on tables with updated_at (the Phase 0 loop only ran
-- once); every new table gets an explicit `enable row level security` (the
-- Phase 1 blanket loop only ran once too).
-- ============================================================================

-- ============================================================================
-- 1. MEDIA GENERALIZATION (spec §1a)
-- ============================================================================

-- Upload-kind lookup: drives per-kind transcode sizes + storage semantics in
-- the media API. Slug-keyed (same rationale as membership_tiers): a future
-- kind is one INSERT here + API handling, no migration.
create table media_kinds (
  id           citext primary key,
  description  text,
  created_at   timestamptz not null default now(),
  -- cast to text so the lowercase rule is enforced (citext ~ is case-insensitive)
  constraint media_kinds_id_format check (id::text ~ '^[a-z][a-z0-9_]{0,29}$')
);

alter table media_kinds enable row level security;

create policy media_kinds_select_authenticated on media_kinds
  for select to authenticated
  using (true);

revoke insert, update, delete on public.media_kinds from anon, authenticated;

insert into media_kinds (id, description) values
  ('post',            'Plaza post image (2048 inside, 480 thumb)'),
  ('avatar',          'Profile avatar (512 square, 96 thumb)'),
  ('cover',           'Profile/space/candidate cover strip (1600x600 inside, 480 thumb)'),
  ('listing_photo',   'Business listing photo (2048 inside, 480 thumb; alt required)'),
  ('space_icon',      'Space icon (512 square, 96 thumb)'),
  ('space_cover',     'Space cover strip (1600x600 inside, 480 thumb)'),
  ('candidate_logo',  'Venture Candidate logo (512 square, 96 thumb)'),
  ('candidate_cover', 'Venture Candidate cover strip (1600x600 inside, 480 thumb)'),
  ('block',           'Page-block image/gallery asset')
on conflict (id) do nothing;

-- Every stored object now carries its kind + Lite-mode metadata: alt text
-- (accessibility + Lite placeholder label), blurhash (0-byte placeholder,
-- encoded at upload) and the small WebP thumb variant's path.
alter table media_uploads
  add column kind citext not null default 'post' references media_kinds (id),
  add column alt_text text,
  add column blurhash text,
  add column thumb_path text;

-- ============================================================================
-- 2. PROFILES — MEDIA IDENTITY + CUSTOMIZATION (spec §1b)
-- ============================================================================

-- Avatar/cover are attached by the API after validating the media_uploads row
-- belongs to the user and passed the scan — deliberately NO client write
-- grants (profiles writes are column-granted, so omission = denied).
alter table profiles
  add column avatar_path text,
  add column avatar_blurhash text,
  add column cover_path text,
  add column cover_blurhash text;

-- profiles SELECT is column-granted (phase1_auth revoked table-wide select);
-- the new columns join the authenticated whitelist — avatar/cover are public
-- identity, same visibility class as display_name (§13 directory).
grant select (avatar_path, avatar_blurhash, cover_path, cover_blurhash)
  on public.profiles to authenticated;

-- "Open to" chips lookup (§13 profile customization): cofounding / hiring /
-- hire_me / investing / mentoring / collaborating. Slug-keyed, extensible.
create table open_to_kinds (
  id          citext primary key,
  sort_order  smallint not null,
  created_at  timestamptz not null default now(),
  constraint open_to_kinds_id_format check (id::text ~ '^[a-z][a-z0-9_]{0,29}$')
);

alter table open_to_kinds enable row level security;

create policy open_to_kinds_select_authenticated on open_to_kinds
  for select to authenticated
  using (true);

revoke insert, update, delete on public.open_to_kinds from anon, authenticated;

insert into open_to_kinds (id, sort_order) values
  ('cofounding',    1),
  ('hiring',        2),
  ('hire_me',       3),
  ('investing',     4),
  ('mentoring',     5),
  ('collaborating', 6)
on conflict (id) do nothing;

-- A member's selected chips. Readable wherever the profile is readable —
-- profiles are member-visible (directory), so any authenticated member reads.
-- Writes API-only: PATCH /api/me/profile validates the slugs and replaces the
-- set atomically.
create table profile_open_to (
  user_id     uuid not null references users (id) on delete cascade,
  open_to_id  citext not null references open_to_kinds (id),
  created_at  timestamptz not null default now(),
  primary key (user_id, open_to_id)
);

create index profile_open_to_kind_idx on profile_open_to (open_to_id);

alter table profile_open_to enable row level security;

create policy profile_open_to_select_authenticated on profile_open_to
  for select to authenticated
  using (true);

revoke insert, update, delete on public.profile_open_to from anon, authenticated;

-- Pinned items on a profile (up to 3 posts/labs/listings). The 3-item cap is
-- declarative: position 1..3 + PK(user_id, position). Target existence and
-- visibility are validated by PUT /api/me/profile/pins before writing;
-- hydration re-checks visibility at read time (a pin row only exposes a bare
-- (type, uuid) pair, same class as follows.target_id).
create table profile_pins (
  user_id      uuid not null references users (id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  position     smallint not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, position),
  constraint profile_pins_entity_type check (entity_type in ('post', 'lab', 'listing')),
  constraint profile_pins_position_range check (position between 1 and 3),
  constraint profile_pins_unique_entity unique (user_id, entity_type, entity_id)
);

alter table profile_pins enable row level security;

create policy profile_pins_select_authenticated on profile_pins
  for select to authenticated
  using (true);

revoke insert, update, delete on public.profile_pins from anon, authenticated;

-- ============================================================================
-- 3. LISTINGS (spec §1c)
-- ============================================================================

-- opening_hours shape: { "mon": [{"open":"09:00","close":"17:00"}], ... "sun": [] }
-- (null = not provided). price_range: 1..4 rendered as $–$$$$. The primary_*
-- columns + photo_count are DENORMALIZED by the photos API on every photo
-- change (card/OG rendering without a join) — service-role only, like every
-- moderated/derived listing column.
alter table business_listings
  add column opening_hours jsonb,
  add column price_range smallint,
  add column primary_photo_path text,
  add column primary_photo_blurhash text,
  add column primary_photo_alt text,
  add column photo_count smallint not null default 0,
  add constraint listings_price_range check (price_range is null or price_range between 1 and 4);

-- opening_hours / price_range are owner-edited content columns (same class as
-- short_description): the existing PATCH /api/listings/[id] writes with the
-- user-scoped client under RLS + column grants, so they join the whitelist.
grant insert (opening_hours, price_range) on public.business_listings to authenticated;
grant update (opening_hours, price_range) on public.business_listings to authenticated;

-- Listing photo gallery (≤5 per listing — API-layer cap). Rows are created by
-- PUT /api/listings/[id]/photos after validating the media_uploads row (kind
-- 'listing_photo', owned by the caller, scan passed/uncertain), so writes are
-- API-only. alt_text is NOT NULL — required at upload (§22 accessibility +
-- Lite placeholder label).
create table listing_photos (
  id               uuid primary key default gen_random_uuid(),
  listing_id       uuid not null references business_listings (id) on delete cascade,
  media_upload_id  uuid references media_uploads (id) on delete set null,
  storage_path     text not null,
  thumb_path       text,
  alt_text         text not null,
  blurhash         text,
  width            integer,
  height           integer,
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now()
);

create index listing_photos_listing_idx on listing_photos (listing_id, sort_order);

alter table listing_photos enable row level security;

-- Mirrors listings_select_published: photos are visible wherever the parent
-- listing is (published to members; owner/mod regardless of moderation state).
create policy listing_photos_select_visible on listing_photos
  for select to authenticated
  using (
    exists (
      select 1 from business_listings l
      where l.id = listing_photos.listing_id
        and (
          l.status = 'published'
          or l.owner_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

revoke insert, update, delete on public.listing_photos from anon, authenticated;

-- Services/menu lines on a listing (≤20 — API-layer cap; replace-all writes
-- via PATCH /api/listings/[id], so API-only).
create table listing_services (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references business_listings (id) on delete cascade,
  name         text not null,
  price_label  text,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index listing_services_listing_idx on listing_services (listing_id, sort_order);

alter table listing_services enable row level security;

create policy listing_services_select_visible on listing_services
  for select to authenticated
  using (
    exists (
      select 1 from business_listings l
      where l.id = listing_services.listing_id
        and (
          l.status = 'published'
          or l.owner_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

revoke insert, update, delete on public.listing_services from anon, authenticated;

-- ============================================================================
-- 4. SPACES + CANDIDATES — MEDIA COLUMNS (spec §1d; Candidate UI is Phase 5)
-- ============================================================================
-- Attached by the API (manager-only, kind space_icon/space_cover etc.) — all
-- labs / venture_candidates writes are already API-only, so no grant changes.

alter table labs
  add column icon_path text,
  add column icon_blurhash text,
  add column cover_path text,
  add column cover_blurhash text;

alter table venture_candidates
  add column logo_path text,
  add column logo_blurhash text,
  add column cover_path text,
  add column cover_blurhash text;

-- ============================================================================
-- 5. SETTINGS (spec §1e)
-- ============================================================================

-- One row per user, created lazily by the API (upsert on PATCH; GET returns
-- defaults when absent). Typed columns for everything RLS/enforcement reads
-- (dm_privacy gates DM requests, discoverable_* gate directory/SEO surfaces,
-- quiet hours gate push); `preferences` jsonb holds client-shaped prefs only
-- (lite / appearance / liteBundle) — never enforcement inputs.
create table user_settings (
  user_id                      uuid primary key references users (id) on delete cascade,
  dm_privacy                   text not null default 'everyone',
  discoverable_directory       boolean not null default true,
  discoverable_search_engines  boolean not null default true,
  location_granularity         text not null default 'city',
  quiet_hours_start            smallint,
  quiet_hours_end              smallint,
  digest_frequency             text not null default 'weekly',
  preferences                  jsonb not null default '{}'::jsonb,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint user_settings_dm_privacy
    check (dm_privacy in ('everyone', 'verified', 'none')),
  constraint user_settings_location_granularity
    check (location_granularity in ('exact', 'city', 'region', 'hidden')),
  constraint user_settings_quiet_start_range
    check (quiet_hours_start is null or quiet_hours_start between 0 and 23),
  constraint user_settings_quiet_end_range
    check (quiet_hours_end is null or quiet_hours_end between 0 and 23),
  constraint user_settings_digest_frequency
    check (digest_frequency in ('weekly', 'off'))
);

create trigger user_settings_set_updated_at
  before update on user_settings
  for each row execute function set_updated_at();

alter table user_settings enable row level security;

create policy user_settings_select_own on user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_settings from anon, authenticated;

-- Per-(type, channel) OVERRIDES of the §26 default notification matrix: an
-- absent row means "use the default". notification_type is TEXT (app-level
-- constants, same reasoning as notifications.type). GET merges defaults +
-- overrides; PUT replaces the full matrix — both API-side.
create table notification_prefs (
  user_id            uuid not null references users (id) on delete cascade,
  notification_type  text not null,
  channel            text not null,
  enabled            boolean not null,
  updated_at         timestamptz not null default now(),
  primary key (user_id, notification_type, channel),
  constraint notification_prefs_channel check (channel in ('inapp', 'email', 'push'))
);

create trigger notification_prefs_set_updated_at
  before update on notification_prefs
  for each row execute function set_updated_at();

alter table notification_prefs enable row level security;

create policy notification_prefs_select_own on notification_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.notification_prefs from anon, authenticated;

-- ============================================================================
-- 6. SOCIAL FEATURES (spec §1f)
-- ============================================================================

-- Bookmarks (Saved): strictly private — nobody can enumerate what a member
-- saved. Polymorphic target integrity is an API obligation (same as follows).
create table bookmarks (
  user_id      uuid not null references users (id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint bookmarks_entity_type
    check (entity_type in ('post', 'listing', 'lab', 'candidate'))
);

-- Keyset pagination for GET /api/me/bookmarks.
create index bookmarks_user_created_idx on bookmarks (user_id, created_at desc);

alter table bookmarks enable row level security;

create policy bookmarks_select_own on bookmarks
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.bookmarks from anon, authenticated;

-- Post drafts (composer autosave; cap 10/user at the API layer). payload is
-- the composer's zod-validated shape {type,title?,body?,linkUrl?,tagIds?,labId?}.
-- lab_id is denormalized for scoping; SET NULL on lab deletion degrades the
-- draft to a global-Plaza draft instead of silently destroying member text.
create table post_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  lab_id      uuid references labs (id) on delete set null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index post_drafts_user_idx on post_drafts (user_id, updated_at desc);

create trigger post_drafts_set_updated_at
  before update on post_drafts
  for each row execute function set_updated_at();

alter table post_drafts enable row level security;

create policy post_drafts_select_own on post_drafts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.post_drafts from anon, authenticated;

-- Edit history: one row per PATCH /api/posts/[id], written BEFORE the edit is
-- applied (previous_* snapshot). had_replies records whether comments existed
-- at edit time (context for "edited after replies" trust cues). Readable by
-- the post's author and mods only.
create table post_revisions (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references posts (id) on delete cascade,
  editor_user_id     uuid not null references users (id),
  previous_title     text,
  previous_body      text,
  previous_link_url  text,
  had_replies        boolean not null default false,
  created_at         timestamptz not null default now()
);

create index post_revisions_post_idx on post_revisions (post_id, created_at desc);

alter table post_revisions enable row level security;

create policy post_revisions_select_author_or_mod on post_revisions
  for select to authenticated
  using (
    public.is_mod()
    or exists (
      select 1 from posts p
      where p.id = post_revisions.post_id
        and p.author_user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.post_revisions from anon, authenticated;

-- Mutes: private feed filters (user / tag / lab). Like bookmarks: own-rows
-- read, API-only writes, target integrity validated at the API layer.
create table mutes (
  user_id      uuid not null references users (id) on delete cascade,
  entity_type  text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint mutes_entity_type check (entity_type in ('user', 'tag', 'lab'))
);

alter table mutes enable row level security;

create policy mutes_select_own on mutes
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.mutes from anon, authenticated;

-- ============================================================================
-- 7. PAGE BLOCKS GROUNDWORK (spec §1g — schema + RLS only, NO UI this phase)
-- ============================================================================

create table block_types (
  id           citext primary key,
  description  text,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  constraint block_types_id_format check (id::text ~ '^[a-z][a-z0-9_]{0,29}$')
);

alter table block_types enable row level security;

create policy block_types_select_authenticated on block_types
  for select to authenticated
  using (true);

revoke insert, update, delete on public.block_types from anon, authenticated;

insert into block_types (id, description, sort_order) values
  ('text',         'Rich text block',                     1),
  ('image',        'Single image',                        2),
  ('gallery',      'Image gallery',                       3),
  ('embed',        'Embedded link/video',                 4),
  ('links',        'Link list',                           5),
  ('pinned_items', 'Pinned posts/labs/listings carousel', 6)
on conflict (id) do nothing;

-- Block-style page layout for profiles / Spaces / Candidates (future UI).
-- Polymorphic owner (owner_type + owner_id) — integrity is an API obligation,
-- same as follows/reports.
create table page_blocks (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null,
  owner_id    uuid not null,
  block_type  citext not null references block_types (id),
  position    smallint not null,
  span        text not null default 'full',
  config      jsonb not null default '{}'::jsonb,
  visibility  text not null default 'public',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint page_blocks_owner_type check (owner_type in ('profile', 'lab', 'candidate')),
  constraint page_blocks_span check (span in ('full', 'half', 'third')),
  constraint page_blocks_visibility check (visibility in ('public', 'members', 'private')),
  constraint page_blocks_position_uq unique (owner_type, owner_id, position)
);

create trigger page_blocks_set_updated_at
  before update on page_blocks
  for each row execute function set_updated_at();

alter table page_blocks enable row level security;

-- Visibility: a block is readable when its OWNER surface is readable AND the
-- block's own visibility admits the caller.
--   * profile — profiles are member-visible: 'public'/'members' blocks read by
--     any authenticated member; 'private' by the owner (and mods). Anon gets
--     the SSR service projection of PUBLIC blocks only (house convention).
--   * lab — 'public'/'members' blocks follow can_read_lab (the Space's own
--     §16 visibility model already distinguishes public/members/private
--     Spaces); 'private' blocks are the lead's drafts (lead + mods).
--   * candidate — Candidate RLS ships in Phase 5; candidate-owned blocks stay
--     mod-only until then (same parking pattern as Phase 2's lab_id guard).
create policy page_blocks_select_visible on page_blocks
  for select to authenticated
  using (
    public.is_mod()
    or (
      owner_type = 'profile'
      and (
        owner_id = (select auth.uid())
        or visibility in ('public', 'members')
      )
    )
    or (
      owner_type = 'lab'
      and (
        (visibility in ('public', 'members') and public.can_read_lab(owner_id))
        or exists (
          select 1 from labs l
          where l.id = page_blocks.owner_id
            and l.lead_user_id = (select auth.uid())
        )
      )
    )
  );

revoke insert, update, delete on public.page_blocks from anon, authenticated;

-- ============================================================================
-- 8. SEARCH SUPPORT (spec §1h)
-- ============================================================================
-- pg_trgm is already installed (20260705010000_member_search.sql); guard
-- anyway so this migration stands alone on a fresh database.

create extension if not exists pg_trgm;

-- /api/search substring matching over post titles and Space names (people and
-- listings already have search_norm trgm indexes from member_search).
create index posts_title_trgm_idx on posts using gin (title gin_trgm_ops);
create index labs_name_trgm_idx on labs using gin (name gin_trgm_ops);
