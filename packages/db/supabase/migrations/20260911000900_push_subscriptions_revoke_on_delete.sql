-- ============================================================================
-- A deleted account keeps no live push subscription.
--
-- Owner ruling (11 Sep): deleted accounts must not keep live push
-- subscriptions. anonymise_user (20260911000100) scrubs the account but never
-- touched push_subscriptions, and the sender did not check the recipient, so
-- a deleted member's device endpoint stayed deliverable.
--
-- When an account becomes 'deleted' (anonymise_user today, or any future
-- path), every live subscription it holds is revoked (revoked_at = now()) —
-- the schema's existing push key-death semantics: the sender only reads
-- revoked_at is null rows, and its 404/410 prune path writes the same column.
-- Already-revoked rows keep their original time; the update is a no-op on
-- re-runs. A one-shot below does the same for accounts already deleted.
--
-- Deliberately NOT here: the grace, suspension and deactivation are
-- reversible, so they never revoke — the app's send-time recipient check
-- (apps/web/src/lib/push/send.ts) refuses non-live recipients instead, and a
-- reinstated member keeps their devices. Rows are not deleted and endpoint /
-- key material is not scrubbed (retained-content lane); revocation also frees
-- the endpoint to be re-registered by whoever uses that device next.
--
-- Same shape as 20260911000700 (API keys). Contract-tested:
-- packages/db/src/push-subscription-lifecycle.test.ts. Fix-forward only.
-- ============================================================================

create function public.tg_users_revoke_push_on_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.push_subscriptions
     set revoked_at = now()
   where user_id = new.id
     and revoked_at is null;
  return null;
end;
$$;

revoke all on function public.tg_users_revoke_push_on_delete() from public, anon, authenticated;

create trigger users_revoke_push_on_delete
  after update of status on public.users
  for each row
  when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.tg_users_revoke_push_on_delete();

comment on function public.tg_users_revoke_push_on_delete() is
  'Revokes every still-live push subscription of an account the moment it becomes deleted (terminal). The grace, suspension and deactivation never revoke — the sender refuses non-live recipients at send time.';

-- One-shot: accounts deleted before this migration.
update public.push_subscriptions ps
   set revoked_at = now()
  from public.users u
 where u.id = ps.user_id
   and u.status = 'deleted'
   and ps.revoked_at is null;
