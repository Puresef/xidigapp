-- ============================================================================
-- A deleted account's API keys are revoked in the data.
--
-- Owner ruling (11 Sep): API keys must not bypass the account lifecycle. The
-- enforcing check is in the app, on EVERY external request
-- (apps/web/src/lib/api-keys/guard.ts): it re-reads the key owner's standing,
-- refuses a suspended / deactivated / deleted owner outright, and narrows the
-- grace to `read`. That check needs no migration.
--
-- This migration adds the durable half for the one TERMINAL state: when an
-- account becomes 'deleted' (anonymise_user today, or any future path), every
-- key it still holds is revoked (revoked_at = now()). Revocation is the
-- schema's existing key-death semantics (the verify path already refuses a
-- revoked key), so a deleted member's key stays dead even if the use-time
-- check were ever bypassed or regressed. Already-revoked keys keep their
-- original revoked_at; the update is a no-op on re-runs.
--
-- Deliberately NOT here: the grace, suspension and deactivation are
-- reversible, so they never revoke — the use-time check covers them and a
-- reinstated member keeps working keys. Rows are not deleted and key names
-- are not scrubbed (retained-content is a separate lane).
--
-- Contract-tested: packages/db/src/api-key-lifecycle.test.ts. Fix-forward only.
-- ============================================================================

create function public.tg_users_revoke_api_keys_on_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.api_keys
     set revoked_at = now()
   where owner_user_id = new.id
     and revoked_at is null;
  return null;
end;
$$;

revoke all on function public.tg_users_revoke_api_keys_on_delete() from public, anon, authenticated;

create trigger users_revoke_api_keys_on_delete
  after update of status on public.users
  for each row
  when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.tg_users_revoke_api_keys_on_delete();

comment on function public.tg_users_revoke_api_keys_on_delete() is
  'Revokes every still-live API key of an account the moment it becomes deleted (terminal). Suspension, deactivation and the deletion grace never revoke — the app''s per-request owner check covers those reversible states.';
