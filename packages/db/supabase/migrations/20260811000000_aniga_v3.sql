-- ============================================================================
-- Aniga v3 — modular profile (F2 §3 dispatch, 11 Aug 2026)
--
-- The header (avatar/cover/name/headline/badges/actions/bio) stays fixed
-- chrome. Everything below the bio becomes a MODULE the owner orders and
-- toggles. Visitors get published modules in stored order; a hidden module is
-- ABSENT from the DOM, never dimmed — so the registry has to be readable
-- per-viewer, and "hidden" has to mean "no row survives the read", not "a row
-- with a flag the client is trusted to honour".
--
-- Three things here are load-bearing beyond ordinary CRUD:
--
--  1. FLAG-GATED MODULES (ruling 7). The metrics module is built and globally
--     OFF. The flag is a PLATFORM decision, not an owner setting: the owner
--     toggle must be *rejected*, not merely hidden. Enforced by trigger, so no
--     API path — present or future — can talk a module into visibility.
--
--  2. LINK-BACK VERIFICATION (tier 3 of the Xaqiiq ladder). The orange check on
--     an external link is granted ONLY by a completed link-back check. The
--     token lives server-side; verification_status is client-readable but
--     client-UNWRITABLE, so "verified" can never be self-asserted.
--
--  3. BADGE PROVENANCE (ruling 10 / acceptance: "no event, no badge"). Earned
--     badges now record the event that earned them. badge_class also moves the
--     orange/neutral decision OUT of the view layer: roles are neutral by data,
--     not by a CSS class someone can mistype.
--
-- Deliberately NOT touched: profiles.links stays the label+url+order store
-- (profile_link_meta is a sidecar keyed by normalized URL), profile_pins keeps
-- its cap of 3 (PRD §20 pinned content), and page_blocks/block_types are left
-- alone — that is the generic block-layout system on its own v1.0.x/v1.1
-- rollout (docs/page-blocks.md), a different concept from a named-module
-- registry. See docs/aniga-modules.md for why they stay separate.
-- ============================================================================


-- ============================================================================
-- 1. PROFESSION SUBTITLE (ruling 23)
-- ============================================================================
-- Plain text, bilingual, member-authored. Renders on the Aniga header and on
-- Fariimo request cards. Deliberately NOT a lookup: this is prose ("Injineer
-- software"), not a taxonomy — the taxonomy is `lanes`.
alter table profiles add column headline text;
alter table profiles add constraint profiles_headline_length
  check (headline is null or char_length(headline) between 1 and 80);

grant insert (headline) on public.profiles to authenticated;
grant update (headline) on public.profiles to authenticated;
grant select (headline) on public.profiles to anon, authenticated;


-- ============================================================================
-- 2. GLOBAL FEATURE FLAGS
-- ============================================================================
-- app_settings already exists but is a locked service-role key/value store with
-- one bespoke reader (get_signup_mode). Flags need a typed, member-READABLE
-- answer without exposing the table, so: own table, RLS on with zero policies,
-- one SECURITY DEFINER reader. Flipping a flag is a service-role/admin act.
create table feature_flags (
  key          citext primary key
                 constraint feature_flags_key_format
                 check (key::text ~ '^[a-z][a-z0-9_]{0,63}$'),
  enabled      boolean not null default false,
  description  text,
  updated_at   timestamptz not null default now()
);

alter table feature_flags enable row level security;
-- No policies, by design: nobody reads this table directly. Reads go through
-- is_feature_enabled() so the answer is a boolean, never the roster.
revoke all on public.feature_flags from anon, authenticated;

create function public.is_feature_enabled(p_key citext)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.feature_flags f where f.key = p_key),
    false
  );
$$;

revoke all on function public.is_feature_enabled(citext) from public;
grant execute on function public.is_feature_enabled(citext) to anon, authenticated, service_role;

-- Default OFF. "Capability exists, strategy decides" — the Maal-capital pattern.
insert into feature_flags (key, enabled, description) values
  ('profile_metrics_module', false,
   'Aniga Tirakoobka module. Built and visitor-facing-capable; OFF as a platform decision (ruling 7). Owner toggle is rejected while this is false.')
on conflict (key) do nothing;


-- ============================================================================
-- 3. MODULE REGISTRY
-- ============================================================================
-- Lookup table, not an enum: modules are an extensible taxonomy and new ones
-- must be addable without an enum migration + type churn (see the membership
-- tier / lane precedent).
create table profile_module_kinds (
  id             citext primary key
                   constraint profile_module_kinds_id_format
                   check (id::text ~ '^[a-z][a-z0-9_]{0,29}$'),
  -- Default slot for members who have never opened the manager.
  default_position  smallint not null,
  -- Default visibility for a brand-new profile.
  default_visible   boolean not null default true,
  -- When set, the module cannot be made visible unless this flag is enabled.
  -- The owner does not own this decision (ruling 7).
  requires_flag     citext,
  description       text,
  created_at        timestamptz not null default now(),
  constraint profile_module_kinds_position_uq unique (default_position)
);

-- Order below the bio, per the module manager frame (10e).
insert into profile_module_kinds (id, default_position, default_visible, requires_flag, description) values
  ('showcase',    1, true,  null, 'Bandhig — member-pinned refs to Guul / Warshad / War media'),
  ('skills',      2, true,  null, 'Xirfadaha — skills sized by distinct-endorser count (§14)'),
  ('links',       3, true,  null, 'Bogagga dibadda — external links: chip -> OG preview -> link-back verified'),
  ('looking_for', 4, true,  null, 'Waxaan raadinayaa — open-to chips + matches, each carrying its reason string'),
  ('spaces',      5, true,  null, 'Warshadaha aan doortay — pinned spaces (profile_pins, cap 3)'),
  ('helper',      6, true,  null, 'Caawimo — asker-credited resolved Codsiyo only (§14 helper score)'),
  ('suuq',        7, true,  null, 'Suuq — business listing with verified-customer testimonial'),
  ('metrics',     8, false, 'profile_metrics_module',
                                  'Tirakoobka — visitor-facing counts. Flag-gated OFF platform-wide (ruling 7)')
on conflict (id) do nothing;

alter table profile_module_kinds enable row level security;
create policy profile_module_kinds_select_authenticated on profile_module_kinds
  for select to authenticated using (true);
revoke insert, update, delete on public.profile_module_kinds from anon, authenticated;

-- Per-member overrides. A member with NO rows renders the defaults above, so a
-- profile that predates this migration keeps working untouched.
create table profile_modules (
  user_id     uuid not null references users (id) on delete cascade,
  module_id   citext not null references profile_module_kinds (id),
  position    smallint not null check (position between 1 and 64),
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (user_id, module_id),
  -- Deferred so a whole-set reorder can swap positions inside one statement.
  constraint profile_modules_position_uq unique (user_id, position)
    deferrable initially deferred
);

create index profile_modules_user_idx on profile_modules (user_id, position);

alter table profile_modules enable row level security;

-- Readable by any member: the VISITOR read is what drives render order, and the
-- "hidden module is absent" guarantee is enforced in the projection (the server
-- never emits a node), not by hiding the preference row.
create policy profile_modules_select_authenticated on profile_modules
  for select to authenticated using (true);

-- Writes are API-only (service role), like every other profile-adjacent table.
revoke insert, update, delete on public.profile_modules from anon, authenticated;

-- --- Flag enforcement -------------------------------------------------------
-- The one rule that must survive every future code path: a flag-gated module
-- cannot be switched on while its flag is off. Raising here (rather than
-- silently coercing to false) makes the owner toggle a REJECTED action, which
-- is what ruling 7 asks for — the UI shows a locked row, and an API that tries
-- anyway gets an error instead of a lie.
create function public.enforce_profile_module_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Schema-qualified: with `set search_path = ''` the plpgsql validator resolves
  -- DECLARE types at CREATE time and would not find the public-schema citext.
  v_flag public.citext;
begin
  if not new.visible then
    return new;
  end if;

  select k.requires_flag into v_flag
  from public.profile_module_kinds k
  where k.id = new.module_id;

  if v_flag is not null and not public.is_feature_enabled(v_flag) then
    raise exception 'module_flag_disabled'
      using errcode = '42501',
            detail = 'Module ' || new.module_id || ' requires feature flag ' || v_flag;
  end if;

  return new;
end;
$$;

create trigger profile_modules_flag_guard
  before insert or update on profile_modules
  for each row execute function public.enforce_profile_module_flag();

-- --- Atomic whole-set save --------------------------------------------------
-- supabase-js cannot open a transaction, and a delete-then-insert over HTTP can
-- strand a member with no modules if the second call fails. One RPC instead.
-- p_modules: [{"module_id":"showcase","position":1,"visible":true}, ...]
create function public.set_profile_modules(p_user_id uuid, p_modules jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_modules) <> 'array' then
    raise exception 'modules_payload_invalid' using errcode = '22023';
  end if;

  delete from public.profile_modules where user_id = p_user_id;

  insert into public.profile_modules (user_id, module_id, position, visible, updated_at)
  select
    p_user_id,
    -- public.citext for the same search_path = '' reason as above; here the
    -- cast is resolved when the statement is first prepared, i.e. at runtime.
    (elem ->> 'module_id')::public.citext,
    (elem ->> 'position')::smallint,
    coalesce((elem ->> 'visible')::boolean, true),
    now()
  from jsonb_array_elements(p_modules) as elem;
end;
$$;

revoke all on function public.set_profile_modules(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_profile_modules(uuid, jsonb) to service_role;


-- ============================================================================
-- 4. SHOWCASE (Bandhig)
-- ============================================================================
-- Member-pinned ONLY — nothing engagement-sourced ever lands here. Distinct
-- from profile_pins: pins are the PRD §20 "pinned content" feature (cap 3,
-- list presentation, Warshado/spaces module); Bandhig is a media grid whose
-- tiles carry a source-kind chip and route through MediaSlot. Sharing one table
-- would force one cap on two features with different caps.
create table profile_showcase (
  user_id      uuid not null references users (id) on delete cascade,
  position     smallint not null,
  entity_type  text not null,
  entity_id    uuid not null,
  -- The image actually shown. Nullable: a pinned Guul with no media still
  -- renders its tile (label + chip), it just has nothing to defer.
  media_id     uuid references media_uploads (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (user_id, position),
  constraint profile_showcase_entity_type check (entity_type in ('post', 'lab', 'listing')),
  -- Five, not six. Frames 10a/10c draw five media tiles plus an owner-only
  -- "+ Ku dar" tile; that sixth cell is UI chrome, not stored content, and
  -- counting it would have let a full grid hide its own add affordance.
  constraint profile_showcase_position_range check (position between 1 and 5),
  constraint profile_showcase_unique_entity unique (user_id, entity_type, entity_id)
);

create index profile_showcase_user_idx on profile_showcase (user_id, position);

alter table profile_showcase enable row level security;
create policy profile_showcase_select_authenticated on profile_showcase
  for select to authenticated using (true);
revoke insert, update, delete on public.profile_showcase from anon, authenticated;

create function public.set_profile_showcase(p_user_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'showcase_payload_invalid' using errcode = '22023';
  end if;

  delete from public.profile_showcase where user_id = p_user_id;

  insert into public.profile_showcase (user_id, position, entity_type, entity_id, media_id)
  select
    p_user_id,
    (elem ->> 'position')::smallint,
    elem ->> 'entity_type',
    (elem ->> 'entity_id')::uuid,
    nullif(elem ->> 'media_id', '')::uuid
  from jsonb_array_elements(p_items) as elem;
end;
$$;

revoke all on function public.set_profile_showcase(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_profile_showcase(uuid, jsonb) to service_role;


-- ============================================================================
-- 5. EXTERNAL LINK METADATA — OG cache + link-back verification ladder
-- ============================================================================
-- Sidecar, not a replacement: profiles.links stays the member-ordered
-- label+url store that the profile form, the public projection and the OG
-- image already read. This table hangs server-owned facts off a normalized URL
-- so nothing here can be self-asserted.
--
-- url_key is the normalized form (scheme-less, host lowercased, no trailing
-- slash) so http/https and casing variants cannot mint two verification states
-- for one destination.
create table profile_link_meta (
  user_id              uuid not null references users (id) on delete cascade,
  url_key              text not null,
  -- Tier 3 of the Xaqiiq ladder. Client-readable, client-UNWRITABLE: the only
  -- path to 'verified' is the checker confirming the page links back.
  verification_status  text not null default 'unverified',
  -- Nonce the member places on their page. Never leaves the server except to
  -- the owner (the API projects it for the owner only).
  -- Built from gen_random_uuid() rather than pgcrypto's gen_random_bytes:
  -- same 128 bits, but gen_random_uuid is in pg_catalog while pgcrypto lives
  -- in the `extensions` schema here — an unqualified call in a stored DEFAULT
  -- would resolve only while `extensions` happens to be on the search_path.
  verification_token   text not null default replace(gen_random_uuid()::text, '-', ''),
  verification_checked_at timestamptz,
  verified_at          timestamptz,
  -- Tier 2. og_status drives the degrade-to-chip path; 'failed' must render
  -- exactly like a bare chip, with no reserved space (no layout shift).
  og_status            text not null default 'pending',
  og_title             text,
  og_site_name         text,
  og_image_path        text,
  og_fetched_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (user_id, url_key),
  constraint profile_link_meta_verification_status check (
    verification_status in ('unverified', 'pending', 'verified', 'failed')),
  constraint profile_link_meta_og_status check (
    og_status in ('pending', 'ok', 'failed')),
  -- A verified row must carry its moment; an unverified one must not claim one.
  constraint profile_link_meta_verified_at_consistent check (
    (verification_status = 'verified') = (verified_at is not null))
);

create index profile_link_meta_user_idx on profile_link_meta (user_id);

alter table profile_link_meta enable row level security;
-- Members read link metadata for any profile they can see (that is the whole
-- point of the badge). The TOKEN column is withheld by column grant, so a
-- visitor can see "verified" but never the nonce that would let them forge it.
create policy profile_link_meta_select_authenticated on profile_link_meta
  for select to authenticated using (true);

revoke select, insert, update, delete on public.profile_link_meta from anon, authenticated;
grant select (
  user_id, url_key, verification_status, verification_checked_at, verified_at,
  og_status, og_title, og_site_name, og_image_path, og_fetched_at, created_at, updated_at
) on public.profile_link_meta to authenticated;


-- ============================================================================
-- 6. BADGE CLASS + EARNING PROVENANCE (ruling 10, acceptance "no event, no badge")
-- ============================================================================
-- badge_class moves the orange decision into the data. The view layer asks the
-- badge what class it is; it never pattern-matches a slug. 'role' is the class
-- that must never render orange — encoding it here means a new role badge is
-- neutral by default instead of neutral by remembering.
alter table badge_definitions add column badge_class text not null default 'earned';
alter table badge_definitions add constraint badge_definitions_class
  check (badge_class in ('identity', 'earned', 'tenure', 'role'));

update badge_definitions set badge_class = 'identity'
  where slug in ('identity-verified', 'community-verified', 'verified-business');
update badge_definitions set badge_class = 'tenure'
  where slug in ('founding-member');
update badge_definitions set badge_class = 'role'
  where slug in ('lab-lead', 'mentor-in-residence');
-- top-helper, early-backer stay 'earned'.

-- Garab milestones (×5/×25/×100) ride ONE definition with the threshold in
-- user_badges.tier. Deliberately not three definitions: three rows invite three
-- treatments, and ruling 10c requires every tier to render identically.
insert into badge_definitions (slug, name, description, badge_class) values
  ('garab-milestone', 'Garab',
   'Verified thanks from the askers whose Codsiyo this member resolved. Crossed once, never a live counter.',
   'earned')
on conflict (slug) do nothing;

-- Provenance. Nullable because identity/tenure/role badges are granted by a
-- human decision or a date, not a reputation event — the NOT-NULL rule applies
-- to the 'earned' class and is enforced in award_badge below.
alter table user_badges add column reputation_event_id uuid references reputation_events (id) on delete set null;
alter table user_badges add column source_entity_type entity_type;
alter table user_badges add column source_entity_id uuid;

create index user_badges_event_idx on user_badges (reputation_event_id)
  where reputation_event_id is not null;

-- Replace the 3-arg primitive with a provenance-carrying one. Dropping rather
-- than overloading: two live signatures would let a caller silently pick the
-- one without provenance, which is exactly the failure this closes.
drop function if exists public.award_badge(uuid, text, text);

create function public.award_badge(
  p_user_id  uuid,
  p_slug     text,
  p_context  text default null,
  p_event_id uuid default null,
  p_tier     text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_badge_id uuid;
  v_class    text;
  v_entity_type public.entity_type;
  v_entity_id   uuid;
begin
  select bd.id, bd.badge_class into v_badge_id, v_class
  from public.badge_definitions bd
  where bd.slug = p_slug and bd.is_active;
  if v_badge_id is null then
    return false;
  end if;

  -- No event, no badge: an earned badge without the moment that earned it is
  -- an unfalsifiable claim, which is the one thing this profile must not ship.
  if v_class = 'earned' and p_event_id is null then
    raise exception 'badge_requires_earning_event'
      using errcode = '23514',
            detail = 'Badge ' || p_slug || ' is class=earned and needs a reputation_events id';
  end if;

  if p_event_id is not null then
    select re.entity_type, re.entity_id into v_entity_type, v_entity_id
    from public.reputation_events re
    where re.id = p_event_id;
  end if;

  insert into public.user_badges (
    user_id, badge_id, context, tier, reputation_event_id, source_entity_type, source_entity_id
  )
  values (
    p_user_id, v_badge_id, p_context, p_tier, p_event_id, v_entity_type, v_entity_id
  )
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.award_badge(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.award_badge(uuid, text, text, uuid, text) to service_role;


-- ============================================================================
-- 7. ENDORSEMENT READ PATH (§14)
-- ============================================================================
-- The unique(endorser, endorsee, skill) constraint already makes "distinct
-- endorsers" structurally true — one member cannot inflate a count by
-- endorsing twice. What was missing is an index that makes the per-profile
-- grouped read cheap enough to run on every profile view.
create index if not exists skill_endorsements_endorsee_skill_idx
  on skill_endorsements (endorsee_user_id, skill);


-- ============================================================================
-- 8. BACKFILL
-- ============================================================================
-- Nothing to backfill for modules/showcase: absence means "defaults", which is
-- exactly the pre-migration rendering. Link metadata is created lazily by the
-- OG fetcher the first time a link is rendered.
