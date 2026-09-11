-- Retained content (PRD Relook §24 / D-13/D-14 owner ruling, 11 Sep):
-- a deleted member's Space history stays Space history.
--
-- Before this migration a Space's updates, decisions and artifacts were
-- readable only while their author was live (author_is_active: active or
-- pending_deletion). Deleting an account therefore SHRANK every Space's
-- record for its own members — the lead and core members lost the deleted
-- member's updates and decisions — while the signed-out public Space page
-- (a service-role projection with no author clause) kept showing them. The
-- ruling: Space updates remain as Space history with tombstone attribution
-- and an unchanged audience; deletion must not widen or shrink it silently.
--
-- The change is one predicate on three tables:
--   author_is_retained(author) = the author is live OR deleted.
-- Deleted is terminal: the profile is a scrubbed tombstone ("Deleted
-- member", deleted_<hex>), so attribution carries no personal data.
-- SUSPENDED and DEACTIVATED stay hidden exactly as before — both are
-- reversible states (moderation / the member's own pause), and this slice
-- does not change them.
--
-- The audience is untouched: can_read_lab(lab_id) still gates every row, and
-- the author's own branch and the mod branch are unchanged. Posts and
-- comments (the Plaza, including posts inside Spaces) keep author_is_active —
-- no ruling covers them; they are reported, not changed.
--
-- No row is written. Fix-forward only.

create or replace function public.author_is_retained(author_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = author_id and u.status in ('active', 'pending_deletion', 'deleted')
  );
$$;

comment on function public.author_is_retained(uuid) is
  'Space history visibility: true when the author is live (active, pending_deletion) or deleted (a terminal tombstone). Suspended/deactivated authors stay hidden, as under author_is_active.';

revoke all on function public.author_is_retained(uuid) from public, anon;
grant execute on function public.author_is_retained(uuid) to authenticated, service_role;

-- lab_updates (latest def: 20260708100000_phase6_moderation) ----------------
drop policy if exists lab_updates_select_readable on lab_updates;
create policy lab_updates_select_readable on lab_updates
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (author_user_id is null or public.author_is_retained(author_user_id)))
      or author_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

-- lab_artifacts (latest def: 20260708100000_phase6_moderation) --------------
drop policy if exists lab_artifacts_select_readable on lab_artifacts;
create policy lab_artifacts_select_readable on lab_artifacts
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (added_by_user_id is null or public.author_is_retained(added_by_user_id)))
      or added_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

-- lab_decisions (latest def: 20260708100000_phase6_moderation) --------------
drop policy if exists lab_decisions_select_readable on lab_decisions;
create policy lab_decisions_select_readable on lab_decisions
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      (status = 'published' and (created_by_user_id is null or public.author_is_retained(created_by_user_id)))
      or created_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );
