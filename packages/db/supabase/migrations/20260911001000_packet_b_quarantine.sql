-- Packet B follow-up (PRD Relook §24 / D-10): two quarantines, no data change.
--
-- 1. candidate_interest_counts(uuid) — server-only.
--    The function is SECURITY DEFINER and carries no candidate-visibility
--    check, and EXECUTE was granted to `authenticated`. Any signed-in member
--    could therefore call it over PostgREST for ANY candidate id — including
--    drafts they cannot read — and receive help / cosign / invest counts. The
--    app never calls it as a member: lib/capital/views.ts and the interests
--    route both use the service-role client, and project {help, cosign} only
--    (lib/capital/interest-counts.ts). So the grant is revoked; service_role
--    keeps it.
--
--    Deliberately a GRANT change only: the body is untouched, so this composes
--    with any later `create or replace` of the same function (the deletion
--    branch's 20260911000400 re-states the body with a lifecycle guard —
--    `create or replace` keeps existing ACLs; its explicit re-grant sorts
--    BEFORE this file, so this revoke is the last word). No interest row is
--    read, changed or deleted; retention stays the separate Q2 ruling.
--
-- 2. garab-milestone — retired, and no longer grantable.
--    Named "Garab" (the non-financial support signal) but defined as "verified
--    thanks from askers" (resolved-Ask helper credit). No production path ever
--    granted it and the profile no longer displays it (RETIRED_BADGE_SLUGS in
--    apps/web/src/lib/aniga/badges.ts). Here the definition is marked
--    inactive — award_badge() already returns false for an inactive slug —
--    and a trigger refuses ANY new user_badges row (or re-pointing an existing
--    row) at an inactive definition, which also covers the direct-insert
--    paths that bypass award_badge(). Existing rows, revocation and history
--    are untouched: the trigger fires only on INSERT and on UPDATE OF badge_id.
--
--    Explicit override for a migration or test that must write a retired
--    badge on purpose: `set local xidig.allow_retired_badge = 'on'` inside the
--    transaction. Clients cannot reach this path at all (user_badges writes
--    are revoked from anon/authenticated).

-- ---------------------------------------------------------------------------
-- 1. candidate_interest_counts: server-only
-- ---------------------------------------------------------------------------
revoke execute on function public.candidate_interest_counts(uuid) from public, anon, authenticated;
grant execute on function public.candidate_interest_counts(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. retired badges cannot be newly granted
-- ---------------------------------------------------------------------------
update public.badge_definitions set is_active = false where slug = 'garab-milestone';

-- SECURITY INVOKER on purpose: every writer of user_badges (service_role,
-- and the SECURITY DEFINER award/sign-up functions owned by the migration
-- role) can already read badge_definitions, so the check needs no elevation.
create function public.user_badges_refuse_retired()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if coalesce(current_setting('xidig.allow_retired_badge', true), '') = 'on' then
    return new;
  end if;
  if not exists (
    select 1 from public.badge_definitions bd
    where bd.id = new.badge_id and bd.is_active
  ) then
    raise exception 'badge_retired'
      using errcode = '23514',
            detail = 'Badge definition ' || new.badge_id || ' is retired and cannot be granted';
  end if;
  return new;
end;
$$;

revoke all on function public.user_badges_refuse_retired() from public, anon, authenticated;

create trigger user_badges_refuse_retired
  before insert or update of badge_id on public.user_badges
  for each row execute function public.user_badges_refuse_retired();
