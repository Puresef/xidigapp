-- ============================================================================
-- Paid entitlements continue through the §19 deletion grace; governance and
-- capital stay active-only.
--
-- Owner ruling (11 Sep): a member in 'pending_deletion' — the cancellable
-- 30-day grace — is an ordinary member until final deletion, so existing paid
-- resource/convenience entitlements continue while the tier still grants
-- them. Governance, capital and consequential powers stay blocked during the
-- grace. No purchase, upgrade, billing, renewal or entitlement-expansion
-- behaviour is added; tiers and tier_capabilities rows are untouched.
--
-- What was wrong: 20260911000500 made the grace ordinary membership but left
-- is_supporter() and has_capability() active-only, because both kinds of
-- capability rode them together — a grace Supporter fell back to free
-- quotas and lost Supporter-only Spaces along with the governance vote.
--
-- Change (a semantic split, not a widening of has_capability):
--   1. has_entitlement(cap) — NEW. The tier grants cap, the account is live
--      (active or pending_deletion — the lifecycle gate's own set), AND cap is
--      an ORDINARY entitlement. For any other capability it answers false,
--      even for an active Supporter, so it cannot stand in for
--      has_capability. ORDINARY = elevated_limits, supporter_spaces,
--      join_unlimited_labs, intelligence_updates (the last two are granted but
--      enforced nowhere yet; classified so future enforcement lands right).
--   2. is_supporter() (supporter_spaces; the can_read_lab gate for
--      Supporter-only Spaces) becomes has_entitlement('supporter_spaces').
--      Signature and grants unchanged, so can_read_lab follows.
--   3. has_capability() is UNCHANGED and stays active-only. It remains the
--      check for vote_candidate, governance_rights, builder_path,
--      investor_path and create_lab (Lab mode is the only rung from which a
--      Space hands off to a Candidate or becomes a Venture — held active-only
--      pending an owner ruling).
--
-- suspended, deactivated and deleted Supporters hold nothing: the status
-- predicate refuses them here, and the client lifecycle gate still refuses
-- them everywhere. The profile freeze trigger, the lifecycle gate and the
-- privileged route guards are untouched.
--
-- Correction to 20260911000500's header: is_venture_lead() is NOT
-- active-only. Its 'active' is the lab membership, not the account, so a
-- grace lead keeps venture-ledger reach. Left unchanged here (the ledger is
-- not a tier entitlement; its grace classification is an open owner
-- question) and pinned in grace-entitlements.test.ts.
--
-- Classification is shared with the app (packages/db/src/entitlements.ts) and
-- contract-tested (packages/db/src/grace-entitlements.test.ts): a new enum
-- value fails the suite until it is classified. Fix-forward only.
-- ============================================================================

create function public.has_entitlement(cap public.membership_capability)
returns boolean
language sql stable security definer set search_path = ''
as $$
  -- lower(): same citext-under-empty-search_path guard as has_capability().
  select cap in ('elevated_limits', 'supporter_spaces', 'join_unlimited_labs', 'intelligence_updates')
     and exists (
       select 1
       from public.profiles p
       join public.tier_capabilities tc
         on lower(tc.tier_id::text) = lower(p.membership_tier_id::text)
       join public.users u on u.id = p.user_id
       where p.user_id = auth.uid()
         and tc.capability = cap
         and u.status in ('active', 'pending_deletion')
     );
$$;

revoke all on function public.has_entitlement(public.membership_capability) from public, anon;
grant execute on function public.has_entitlement(public.membership_capability) to authenticated, service_role;

comment on function public.has_entitlement(public.membership_capability) is
  'Ordinary paid entitlement check for the caller: true when the tier grants cap, the account is active or in the §19 deletion grace, and cap is an ordinary resource/convenience entitlement (elevated_limits, supporter_spaces, join_unlimited_labs, intelligence_updates). False for every governance/capital capability — use has_capability(), which is active-only.';

create or replace function public.is_supporter()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_entitlement('supporter_spaces'::public.membership_capability);
$$;

comment on function public.is_supporter() is
  'Holder of the supporter_spaces entitlement (reads Supporter-only Spaces via can_read_lab). An ordinary entitlement: continues through the §19 deletion grace.';

comment on function public.has_capability(public.membership_capability) is
  'Active-only capability check for the caller: true when the tier grants cap and the account status is active. The check for governance/capital capabilities (vote_candidate, governance_rights, builder_path, investor_path, create_lab); ordinary entitlements use has_entitlement().';
