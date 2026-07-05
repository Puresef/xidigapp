-- ============================================================================
-- Xidig v1.0 — Phase 1: auth foundation (RLS, beta gate, RBAC helpers)
-- ============================================================================
-- Companion to 20260704000000_schema.sql (Phase 0). This migration makes the
-- database safe to expose through PostgREST/Supabase for the first time:
--
--   1. Row Level Security is enabled on EVERY public table (default deny).
--      Tables owned by later phases get no policies yet — they are locked
--      until their phase ships policies.
--   2. Beta signup gate: signups are only possible when the server has issued
--      a signup_grant (after invite/waitlist validation). A trigger on
--      auth.users enforces this at the DB boundary, so hitting the Supabase
--      auth API directly with the publishable key cannot bypass beta gating.
--      ("Allow new users to sign up" is ALSO disabled in the dashboard; the
--      trigger is defense-in-depth.)
--   3. public.users is provisioned + mirrored from auth.users by triggers
--      (email/phone stay queryable app-side; GoTrue stores phone without the
--      leading '+', the mirror normalises to E.164 with '+').
--   4. RBAC + membership helpers (is_admin / is_mod / has_capability /
--      list_visible_tiers / has_password / get_signup_mode) as SECURITY
--      DEFINER functions with search_path = '' — the exact design the Phase 0
--      notes lock in (docs/phase-0-schema-notes.md).
--   5. Column-level grants so a member can UPDATE their own row without ever
--      being able to write role/status/tier/verification columns.
--   6. auth_email_tokens: issued-at records for self-sent auth emails so the
--      app can enforce the PRD's 10-minute magic-link/signup expiry while
--      GoTrue's single global email-OTP expiry is set to 60 minutes for
--      password-recovery links (§26/§27: magic link 10 min, reset 60 min).
-- ============================================================================

-- ============================================================================
-- 1. NEW TABLES
-- ============================================================================

-- Platform-level settings (beta gating toggle now; more later). Locked table:
-- no RLS policies — reads go through get_signup_mode(), writes through the
-- admin API (service role) which also writes an audit_logs row.
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- A server-issued permission to create ONE account for ONE identifier.
-- Issued by the API after validating an invite code or approving a waitlist
-- entry; consumed exactly once by the auth.users insert trigger. Locked table
-- (service role only).
create table signup_grants (
  id                   uuid primary key default gen_random_uuid(),
  email                citext,
  phone                text,
  invite_id            uuid references invites (id) on delete set null,
  waitlist_entry_id    uuid references waitlist_entries (id) on delete set null,
  expires_at           timestamptz not null,
  consumed_at          timestamptz,
  consumed_by_user_id  uuid references users (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint signup_grants_one_identifier check (num_nonnulls(email, phone) = 1),
  -- same E.164 shape as users.phone so trigger matching works
  constraint signup_grants_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- at most one open grant per identifier (re-requesting replaces via upsert)
create unique index signup_grants_email_active_uq
  on signup_grants (email) where email is not null and consumed_at is null;
create unique index signup_grants_phone_active_uq
  on signup_grants (phone) where phone is not null and consumed_at is null;
-- …and at most one open grant per INVITE: a single-use code must not be able
-- to hold seats for two different identifiers at once (the trigger's
-- redemption re-check is the second lock on this door).
create unique index signup_grants_invite_open_uq
  on signup_grants (invite_id) where invite_id is not null and consumed_at is null;
create index signup_grants_invite_idx on signup_grants (invite_id) where invite_id is not null;

-- Issued-at ledger for self-sent auth emails (magic link / signup confirm /
-- recovery / email change). The app sends these emails itself via
-- auth.admin.generateLink() + the email provider, records the hashed token
-- here, and /auth/confirm enforces the 10-minute expiry for magiclink/signup
-- before calling verifyOtp. Locked table (service role only).
create table auth_email_tokens (
  token_hash   text primary key,
  user_id      uuid references users (id) on delete cascade,
  email        citext not null,
  type         text not null, -- signup | magiclink | recovery | email_change
  created_at   timestamptz not null default now(),
  consumed_at  timestamptz
);

create index auth_email_tokens_created_idx on auth_email_tokens (created_at);

-- ============================================================================
-- 2. RBAC / MEMBERSHIP / AUTH HELPERS
-- ============================================================================
-- All SECURITY DEFINER with search_path = '' (excludes pg_temp — the stronger
-- hijack defense) and every object schema-qualified. None of them accept a
-- uid parameter: they only ever answer for auth.uid(), so an authenticated
-- caller can never probe another member's role/tier/password state.

-- Role of the calling user, or NULL when signed out / no app row yet.
create function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid();
$$;

-- Admin check used by RLS policies and API guards. A suspended or deleted
-- admin has no admin powers.
create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'
  );
$$;

-- Mod-or-admin check (admin inherits every mod power, §26).
create function public.is_mod()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('mod', 'admin') and u.status = 'active'
  );
$$;

-- Membership capability gate (docs/phase-0-schema-notes.md, validated design).
-- Deliberately NOT filtered on membership_tiers.is_active: a member left on a
-- retired tier keeps its capabilities until actively migrated (Seq 3
-- grandfathering). Additionally requires an active account — a suspended
-- Supporter must not pass Supporter gates.
create function public.has_capability(cap public.membership_capability)
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- lower(): with search_path = '' the public-schema citext '=' operator is
  -- invisible and a bare '=' silently degrades to case-SENSITIVE text
  -- equality (same hazard as the trigger's grant lookup below). The FK
  -- validates case-insensitively, so a case-variant tier id can legally
  -- exist — the join must match it.
  select exists (
    select 1
    from public.profiles p
    join public.tier_capabilities tc
      on lower(tc.tier_id::text) = lower(p.membership_tier_id::text)
    join public.users u on u.id = p.user_id
    where p.user_id = auth.uid()
      and tc.capability = cap
      and u.status = 'active'
  );
$$;

-- Public membership catalog (pricing/upgrade page). Filters is_active — the
-- grandfathering asymmetry: retired tiers keep working via has_capability()
-- but never appear here. Projects ONLY pricing-page-safe columns so a future
-- internal column (e.g. a Paddle plan id) cannot leak through a select *.
create function public.list_visible_tiers()
returns table (
  id                text,
  name              text,
  monthly_price_usd numeric,
  "position"        smallint,
  capabilities      public.membership_capability[]
)
language sql stable security definer set search_path = ''
as $$
  select
    t.id::text,
    t.name,
    t.monthly_price_usd,
    t.position,
    coalesce(
      -- lower(): same citext-under-empty-search_path hazard as has_capability
      (select array_agg(tc.capability order by tc.capability)
         from public.tier_capabilities tc
        where lower(tc.tier_id::text) = lower(t.id::text)),
      '{}'::public.membership_capability[]
    )
  from public.membership_tiers t
  where t.is_active
  order by t.position;
$$;

-- Does the calling user have a password set? Drives the §20 set-a-password
-- nudge (magic-link/OTP signups). Reads Supabase-managed auth.users — the
-- source of truth — so there is no app-side column to drift. GoTrue stores
-- '' (not NULL) for passwordless users in some versions; treat both as unset.
create function public.has_password()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users au
    where au.id = auth.uid() and coalesce(au.encrypted_password, '') <> ''
  );
$$;

-- Current beta signup mode: 'invite_only' or 'waitlist'. Readable pre-auth
-- (the landing/waitlist page branches on it) via function, so app_settings
-- itself stays locked.
create function public.get_signup_mode()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select s.value #>> '{}' from public.app_settings s where s.key = 'signup_mode'),
    'invite_only'
  );
$$;

-- Supabase's default privileges grant EXECUTE on new functions to anon,
-- authenticated AND service_role — revoking from PUBLIC alone is not enough,
-- anon must be revoked explicitly on the authenticated-only helpers.
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_mod() from public, anon;
revoke all on function public.has_capability(public.membership_capability) from public, anon;
revoke all on function public.list_visible_tiers() from public;
revoke all on function public.has_password() from public, anon;
revoke all on function public.get_signup_mode() from public;

grant execute on function public.current_user_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_mod() to authenticated, service_role;
grant execute on function public.has_capability(public.membership_capability) to authenticated, service_role;
grant execute on function public.list_visible_tiers() to anon, authenticated, service_role;
grant execute on function public.has_password() to authenticated, service_role;
grant execute on function public.get_signup_mode() to anon, authenticated, service_role;

-- ============================================================================
-- 3. AUTH TRIGGERS (beta gate + public.users provisioning/mirroring)
-- ============================================================================

-- GoTrue stores phone without the leading '+'; app tables require E.164 with
-- '+'. NULL-safe.
create function public.normalize_auth_phone(p text)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when p is null or p = '' then null
    when left(p, 1) = '+' then p
    else '+' || p
  end;
$$;

-- The beta gate + account provisioning. AFTER INSERT on auth.users:
--   * a matching open signup_grant is required, otherwise the whole signup
--     transaction is aborted (this is what blocks direct-API signups);
--   * the grant is consumed, its invite marked redeemed (tracked referrals)
--     and its waitlist entry marked joined;
--   * the public.users shadow row is created.
-- Ops escape hatch: an admin-API-created user whose app_metadata carries
-- xidig_gate_bypass = 'true' skips the grant check (app_metadata is only
-- writable with the service key — never by end users).
create function public.handle_auth_user_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email public.citext := nullif(new.email, '')::public.citext;
  v_phone text          := public.normalize_auth_phone(new.phone);
  v_grant public.signup_grants%rowtype;
begin
  if coalesce(new.raw_app_meta_data ->> 'xidig_gate_bypass', '') = 'true' then
    insert into public.users (id, email, phone) values (new.id, v_email, v_phone);
    return new;
  end if;

  -- NOTE: with search_path = '' the citext '=' operator (which lives in the
  -- public schema) does not resolve, and Postgres would silently fall back to
  -- case-SENSITIVE text equality. Compare via lower() to keep the citext
  -- semantics regardless of operator resolution.
  select * into v_grant
  from public.signup_grants g
  where g.consumed_at is null
    and g.expires_at > now()
    and ((v_email is not null and lower(g.email::text) = lower(v_email::text))
      or (v_phone is not null and g.phone = v_phone))
  order by g.created_at desc
  limit 1
  for update;

  if not found then
    -- Aborts the signup. The API layer never lets a user hit this (it issues
    -- the grant first); anyone who does hit it went around the app.
    raise exception 'XIDIG_SIGNUP_NOT_ALLOWED'
      using hint = 'Signup requires a valid invite or waitlist approval.';
  end if;

  insert into public.users (id, email, phone) values (new.id, v_email, v_phone);

  update public.signup_grants
     set consumed_at = now(), consumed_by_user_id = new.id
   where id = v_grant.id;

  if v_grant.invite_id is not null then
    -- Authoritative single-use enforcement: the redemption UPDATE re-checks
    -- the invite's live state under this transaction's lock. Two concurrent
    -- signups holding grants for the same code cannot both pass — the loser
    -- sees redeemed_at already set and the whole signup aborts.
    update public.invites
       set redeemed_by_user_id = new.id, redeemed_at = now()
     where id = v_grant.invite_id
       and redeemed_at is null
       and revoked_at is null
       and (expires_at is null or expires_at > now());
    if not found then
      raise exception 'XIDIG_SIGNUP_NOT_ALLOWED'
        using hint = 'This invite code has already been used, revoked, or expired.';
    end if;

    -- If this invite was issued to a waitlist entry (admin invite flow sets
    -- waitlist_entries.invite_id), joining completes that entry's lifecycle
    -- even though the grant itself only carries the invite.
    update public.waitlist_entries
       set status = 'joined'
     where invite_id = v_grant.invite_id and status <> 'joined';
  end if;

  if v_grant.waitlist_entry_id is not null then
    update public.waitlist_entries
       set status = 'joined'
     where id = v_grant.waitlist_entry_id;
  end if;

  -- Founding Member moment (§20): the first 500 accounts carry the badge for
  -- life. Cap mirrored in apps/web (FOUNDING_MEMBER_CAP).
  if (select count(*) from public.users) <= 500 then
    insert into public.user_badges (user_id, badge_id)
    select new.id, bd.id from public.badge_definitions bd
    where bd.slug = 'founding-member'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();

-- Keep the public.users mirror in sync when auth.users changes (email/phone
-- linking, email change confirmation, anonymisation scrubs).
create function public.handle_auth_user_updated()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email public.citext := nullif(new.email, '')::public.citext;
  v_phone text          := public.normalize_auth_phone(new.phone);
begin
  update public.users u
     set email = v_email, phone = v_phone
   where u.id = new.id
     and (u.email is distinct from v_email or u.phone is distinct from v_phone);
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, phone on auth.users
  for each row execute function public.handle_auth_user_updated();

-- ============================================================================
-- 4. ROW LEVEL SECURITY — enable everywhere (default deny)
-- ============================================================================
-- Every table in public gets RLS enabled. Tables without policies below are
-- fully locked for anon/authenticated (service role bypasses RLS): later
-- phases add their own policies when they ship their API surface. This is the
-- safe default — nothing in the schema is reachable through PostgREST until a
-- phase explicitly opens it.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ============================================================================
-- 5. PHASE 1 POLICIES
-- ============================================================================
-- Conventions: policies are written for the `authenticated` role; `anon` gets
-- nothing (pre-auth reads go through SECURITY DEFINER functions). auth.uid()
-- is wrapped in (select ...) so the planner evaluates it once per statement.

-- --- users -------------------------------------------------------------
-- Self: read own row (role/status included — the client needs them for UI
-- gating; the API re-checks server-side). Update own row, but ONLY the
-- self-service columns (enforced by column grants in §6 — role, status,
-- email, phone, is_ai are never client-writable). No insert/delete: rows are
-- created by the auth trigger and removed never (anonymise policy, §19).
create policy users_select_own on users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_select_admin on users
  for select to authenticated
  using (public.is_admin());

create policy users_update_own on users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --- profiles ----------------------------------------------------------
-- Profiles are the member-visible identity layer (directory, mentions), so
-- any signed-in member can read them. Insert/update own only; the gated
-- columns (verification_status, membership_tier_id, subscription_status,
-- region_verified) are excluded via column grants in §6.
create policy profiles_select_authenticated on profiles
  for select to authenticated
  using (true);

create policy profiles_insert_own on profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update_own on profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- invites -----------------------------------------------------------
-- Members see invites they created (tracked referrals) or redeemed. Creation
-- and redemption go through the API (rate limits + audit), so no insert
-- policy — a direct PostgREST insert with the publishable key must fail.
create policy invites_select_own on invites
  for select to authenticated
  using (
    created_by_user_id = (select auth.uid())
    or redeemed_by_user_id = (select auth.uid())
    or public.is_admin()
  );

-- --- consent_records ---------------------------------------------------
-- Read + record own consent. Withdrawal (update) is limited to the
-- withdrawable document types; ToS/Privacy acceptance is never "un-accepted"
-- in place (a new version is a new row). Column grants in §6 restrict the
-- update to withdrawn_at.
create policy consent_select_own on consent_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consent_insert_own on consent_records
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy consent_withdraw_own on consent_records
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and consent_type in ('cookies', 'analytics')
  )
  with check (user_id = (select auth.uid()));

-- --- audit_logs --------------------------------------------------------
-- Admins can read the audit trail (§26: audit log access). Writes are
-- service-role only (immutable, append-only; UPDATE/DELETE are revoked for
-- every client role in §6).
create policy audit_logs_select_admin on audit_logs
  for select to authenticated
  using (public.is_admin());

-- membership_tiers / tier_capabilities: RLS on, deliberately NO policies —
-- reads go through has_capability() / list_visible_tiers() only (Phase 0
-- notes: never world-readable).
-- app_settings / signup_grants / auth_email_tokens / waitlist_entries:
-- locked — service role only.

-- ============================================================================
-- 6. COLUMN-LEVEL GRANTS (self-service columns only)
-- ============================================================================
-- Supabase's default privileges grant broad table rights to anon and
-- authenticated; RLS restricts rows but not columns. Revoke writes and
-- re-grant only the columns a member may set on their own rows, so even an
-- own-row UPDATE can never touch role/status/tier/verification columns.

revoke insert, update, delete on public.users from anon, authenticated;
grant update (preferred_language, low_bandwidth_enabled, onboarding_state)
  on public.users to authenticated;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant insert (user_id, display_name, handle, bio, location_city, location_country,
              latitude, longitude, timezone, skills, lanes, links, contact_options)
  on public.profiles to authenticated;
grant update (display_name, handle, bio, location_city, location_country,
              latitude, longitude, timezone, skills, lanes, links, contact_options,
              region_attested_at)
  on public.profiles to authenticated;

-- READ columns are restricted too: profiles are member-visible (directory)
-- but subscription_status is the raw payment-processor state (who is
-- past_due/cancelled) and region_verified/region_attested_at are Capital
-- compliance state — none of that is a member-visible credential. Owners get
-- their own billing/tier state through auth-scoped functions/API when the
-- membership UI ships, never through the directory read.
revoke select on public.profiles from anon, authenticated;
grant select (user_id, display_name, handle, bio, location_city, location_country,
              latitude, longitude, timezone, skills, lanes, links, contact_options,
              verification_status, membership_tier_id, created_at, updated_at)
  on public.profiles to authenticated;

revoke insert, update, delete on public.invites from anon, authenticated;

revoke insert, update, delete on public.consent_records from anon, authenticated;
grant insert (user_id, consent_type, version, method, document_url)
  on public.consent_records to authenticated;
grant update (withdrawn_at) on public.consent_records to authenticated;

-- audit_logs immutability: no client role may ever update or delete; even
-- service_role writes are insert-only at the API layer.
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke update, delete on public.audit_logs from service_role;

-- ============================================================================
-- 7. SEED
-- ============================================================================

insert into app_settings (key, value)
values ('signup_mode', to_jsonb('invite_only'::text))
on conflict (key) do nothing;
