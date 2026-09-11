-- ============================================================================
-- Account anonymisation as ONE transaction, with a complete scrub and a
-- frozen profile afterwards (§19 anonymise-not-erase, done properly).
--
-- Before this migration the final deletion transition was two PostgREST
-- statements from the app (users flip, then a best-effort profiles scrub) plus
-- an unconditional audit row. Consequences, all static-verified: a scrub
-- failure left status='deleted' with an intact profile and an audit row
-- claiming completion, and the row was never reselected (the sweep looks for
-- pending_deletion only); the scrub covered 12 of profiles' 27 columns and
-- missed avatar/cover paths + blurhashes, headline, verification_status and
-- the region attestation — exactly what the logged-out projection serves; the
-- profile-presentation satellites and media_uploads.alt_text (auto-filled with
-- the display name for avatars) were untouched; nothing stopped a later write
-- from repopulating any of it.
--
-- This migration provides:
--   1. public.anonymise_user(uuid) — SECURITY DEFINER, service-role-only.
--      Locks the users row, refuses anything but pending_deletion (a cancel
--      that committed first wins; an active account can never be anonymised
--      by a caller bug), is idempotent on an already-deleted row (no second
--      audit row), scrubs profiles + satellites + avatar/cover alt text, flips
--      the users row, and writes the audit row — all in the caller's single
--      transaction, so partial state cannot exist.
--   2. tg_profiles_freeze_deleted — BEFORE UPDATE on profiles: once the
--      account is 'deleted', any UPDATE to its profile row raises. This is the
--      profiles analogue of the auth-mirror guard: the vouch auto-upgrade, a
--      stale verification decision, or any future writer cannot repopulate
--      scrubbed presentation. The function scrubs BEFORE flipping status, so
--      its own writes pass.
--
-- Storage objects (avatar/cover files in the public bucket) are NOT touched:
-- the DB paths are cleared, but the objects stay fetchable at their raw URLs
-- until the owner approves a storage mechanism. The function reports how
-- many such uploads remain (media_pending) so no caller can claim media
-- cleanup is complete.
--
-- Column coverage is contract-tested: packages/db/src/account-deletion-
-- privacy.test.ts enumerates profiles/users columns from information_schema
-- and fails on any column not explicitly classified, so a new column cannot
-- silently escape the scrub.
--
-- Fix-forward only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Profile freeze: no UPDATE on a deleted account's profile row.
-- ---------------------------------------------------------------------------
create or replace function public.tg_profiles_freeze_deleted()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.users u where u.id = old.user_id and u.status = 'deleted'
  ) then
    raise exception 'profile_frozen: account % is anonymised; its profile cannot be updated', old.user_id
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

revoke all on function public.tg_profiles_freeze_deleted() from public, anon, authenticated;

drop trigger if exists profiles_freeze_deleted on public.profiles;
create trigger profiles_freeze_deleted
  before update on public.profiles
  for each row execute function public.tg_profiles_freeze_deleted();

-- ---------------------------------------------------------------------------
-- 2. The transaction.
-- ---------------------------------------------------------------------------
create or replace function public.anonymise_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_status        public.account_status;
  v_handle        text := 'deleted_' || substr(replace(p_user_id::text, '-', ''), 1, 12);
  v_media_pending integer;
begin
  -- Row lock serialises against a concurrent cancel_deletion and against a
  -- duplicate/overlapping sweep invocation (Vercel documents both).
  select u.status into v_status
    from public.users u
   where u.id = p_user_id
     for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_status = 'deleted' then
    -- Idempotent: nothing to do, nothing to audit twice.
    return jsonb_build_object('outcome', 'already_deleted');
  end if;

  if v_status <> 'pending_deletion' then
    -- Grace was cancelled (or the caller is confused). Never anonymise a live
    -- account; report and leave it alone.
    return jsonb_build_object('outcome', 'skipped', 'status', v_status::text);
  end if;

  -- (a) Profile presentation → neutral tombstone. Runs while status is still
  --     pending_deletion so the freeze trigger lets it through. Every column
  --     classified CLEAR/TOMBSTONE/SET by the coverage contract is here;
  --     location_country_code and search_norm are derived and recompute.
  update public.profiles
     set display_name          = 'Deleted member',
         handle                = v_handle,
         headline              = null,
         bio                   = null,
         avatar_path           = null,
         avatar_blurhash       = null,
         cover_path            = null,
         cover_blurhash        = null,
         location_city         = null,
         location_country      = null,
         latitude              = null,
         longitude             = null,
         timezone              = null,
         skills                = '{}',
         lanes                 = '{}',
         links                 = '[]'::jsonb,
         contact_options       = '{}'::jsonb,
         verification_status   = 'unverified',
         region_verified       = false,
         region_attested_at    = null
   where user_id = p_user_id;

  -- (b) Presentation satellites: the member's own page configuration and
  --     link metadata (which keeps og_title/og_site_name/og_image_path of the
  --     links profiles.links no longer lists). Not content, not records.
  delete from public.profile_open_to      where user_id = p_user_id;
  delete from public.profile_pins         where user_id = p_user_id;
  delete from public.profile_pinned_labs  where user_id = p_user_id;
  delete from public.profile_modules      where user_id = p_user_id;
  delete from public.profile_showcase     where user_id = p_user_id;
  delete from public.profile_link_meta    where user_id = p_user_id;

  -- (c) Identity that leaked into media rows: /api/media auto-fills alt_text
  --     with the display name for avatars. Rows and objects stay (the object
  --     cleanup is a separately gated storage decision); the name goes.
  update public.media_uploads
     set alt_text = null
   where owner_user_id = p_user_id
     and kind in ('avatar', 'cover')
     and alt_text is not null;

  -- (d) The lifecycle flip. deletion_requested_at is kept as history.
  update public.users
     set status        = 'deleted',
         email         = null,
         phone         = null,
         anonymised_at = now()
   where id = p_user_id;

  -- (e) Audit — inside the transaction, so it exists iff the scrub committed.
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (null, 'user.anonymised', 'user', p_user_id, '{}'::jsonb);

  -- (f) Honest completion signal for the caller: avatar/cover uploads whose
  --     storage objects are still in the public bucket.
  select count(*)::integer into v_media_pending
    from public.media_uploads m
   where m.owner_user_id = p_user_id
     and m.kind in ('avatar', 'cover');

  return jsonb_build_object('outcome', 'anonymised', 'media_pending', v_media_pending);
end
$$;

revoke all on function public.anonymise_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_user(uuid) to service_role;
