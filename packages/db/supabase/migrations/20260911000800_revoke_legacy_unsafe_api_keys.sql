-- ============================================================================
-- Revoke legacy unsafe API keys outright.
--
-- Owner ruling (11 Sep): since a8cb98c the write scopes (plaza:write,
-- listings:write, labs:write — they publish as the platform) and `admin` are
-- OPERATIONAL: only an active admin may mint or use them, and the app narrows
-- anyone else's key to `read` on every request. A live key that still lists
-- those scopes but only behaves as read-only is misleading, so it is revoked.
--
-- 1. revoke_unsafe_api_keys(p_owner, p_reason) — revokes every live key that
--    holds an unsafe scope and whose owner is LIVE (active or the deletion
--    grace) but not an ACTIVE ADMIN; one owner or all. Writes one audit_logs
--    row per revoked key (actor null = system, action 'api_key.revoked',
--    target the key; metadata: reason, owner id/status/role, the unsafe
--    scopes — never key material). audit_logs is immutable
--    (20260708100000), so the record cannot be edited away. Idempotent.
-- 2. The migration runs it once over every owner, reason
--    'legacy_non_admin_write_scope_revoked'.
-- 3. A users trigger re-runs it for one owner, reason
--    'owner_no_longer_active_admin', whenever a role/status change leaves
--    them live but not an active admin (demotion, entering the grace,
--    reinstatement as a non-admin) — so the invariant cannot re-open.
--
-- Deliberately NOT revoked: suspended / deactivated owners (ruling: blocked
-- on use, reinstatement restores them; the trigger re-checks on
-- reinstatement); deleted owners (already revoked by 20260911000700);
-- read-only keys; an active admin's operational keys. api_keys has no reason
-- column — the reason lives in the audit row. Rows are never deleted.
--
-- Contract-tested: packages/db/src/api-key-legacy-cleanup.test.ts.
-- Fix-forward only.
-- ============================================================================

create function public.revoke_unsafe_api_keys(
  p_owner uuid default null,
  p_reason text default 'legacy_non_admin_write_scope_revoked'
)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_unsafe constant text[] := array['plaza:write', 'listings:write', 'labs:write', 'admin'];
  v_count integer;
begin
  with revoked as (
    update public.api_keys k
       set revoked_at = now()
      from public.users u
     where u.id = k.owner_user_id
       and (p_owner is null or k.owner_user_id = p_owner)
       and k.revoked_at is null
       and k.scopes && v_unsafe
       and u.status in ('active', 'pending_deletion')
       and not (u.role = 'admin' and u.status = 'active')
    returning k.id, k.owner_user_id, k.scopes, u.status, u.role
  )
  insert into public.audit_logs (actor_user_id, api_key_id, action, target_type, target_id, metadata)
  select null, r.id, 'api_key.revoked', 'api_key', r.id,
         jsonb_build_object(
           'reason', p_reason,
           'owner_user_id', r.owner_user_id,
           'owner_status', r.status,
           'owner_role', r.role,
           'unsafe_scopes', to_jsonb(array(select s from unnest(r.scopes) s where s = any (v_unsafe)))
         )
    from revoked r;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.revoke_unsafe_api_keys(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_unsafe_api_keys(uuid, text) to service_role;

comment on function public.revoke_unsafe_api_keys(uuid, text) is
  'Revokes live API keys holding plaza:write / listings:write / labs:write / admin whose owner is live (active or deletion grace) but not an active admin; one audit_logs row per key (reason in metadata, no key material). Idempotent. Service role only.';

create function public.tg_users_revoke_unsafe_api_keys()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.revoke_unsafe_api_keys(new.id, 'owner_no_longer_active_admin');
  return null;
end;
$$;

revoke all on function public.tg_users_revoke_unsafe_api_keys() from public, anon, authenticated;

create trigger users_revoke_unsafe_api_keys
  after update of role, status on public.users
  for each row
  when (
    (old.role is distinct from new.role or old.status is distinct from new.status)
    and new.status in ('active', 'pending_deletion')
    and not (new.role = 'admin' and new.status = 'active')
  )
  execute function public.tg_users_revoke_unsafe_api_keys();

-- The one-shot cleanup of keys minted before the operational-scope rule.
select public.revoke_unsafe_api_keys(null, 'legacy_non_admin_write_scope_revoked');
