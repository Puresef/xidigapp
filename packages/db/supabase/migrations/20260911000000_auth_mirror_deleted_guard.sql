-- ============================================================================
-- Auth→public mirror must not repopulate an anonymised account.
--
-- handle_auth_user_updated() (20260704200000) copies auth.users.email/phone
-- into public.users whenever the auth row's email or phone changes. The §19
-- scrub writes ONLY public.users (auth.users is never touched — it is not a
-- member path and is not authorised here), so after anonymisation the auth row
-- still holds the member's address and any later auth-side email/phone change
-- would silently write it back into the scrubbed public row. The
-- users_contact_method CHECK cannot stop that: `status = 'deleted' OR …` is
-- satisfied by the status alone.
--
-- Fix: the mirror skips rows whose lifecycle state is 'deleted'. Every other
-- state keeps syncing — active accounts' email-change confirmations and phone
-- linking are unchanged, and pending_deletion keeps its contact so a cancel
-- within the grace period restores the account intact.
--
-- Deliberately NOT done here: tightening users_contact_method to REQUIRE null
-- contact on deleted rows. That would make any re-population fail loudly for
-- every writer, but adding a CHECK validates existing rows at migration time
-- and production could not be censused from this session — a pre-existing
-- re-mirrored row would fail the deploy. Revisit after a production census.
--
-- Fix-forward only: reverting re-opens the re-population path.
-- ============================================================================

create or replace function public.handle_auth_user_updated()
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
     and u.status <> 'deleted'
     and (u.email is distinct from v_email or u.phone is distinct from v_phone);
  return new;
end;
$$;
