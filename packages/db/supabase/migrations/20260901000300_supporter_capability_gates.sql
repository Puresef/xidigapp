-- ============================================================================
-- Route the "Supporter" gates through tier_capabilities (see 20260901000200
-- for the why). Seeds the two new capabilities to the supporter tier —
-- behavior today is IDENTICAL (free lacks them, supporter holds them) — and
-- reimplements is_supporter() as a capability join, so a future tier holds a
-- Supporter gate only when granted the row. Function name, signature, grants
-- and every calling RLS policy (can_read_lab) are unchanged.
-- ============================================================================

insert into tier_capabilities (tier_id, capability) values
  ('supporter', 'supporter_spaces'),
  ('supporter', 'elevated_limits')
on conflict (tier_id, capability) do nothing;

-- Holder of the supporter_spaces capability? (Gates is_supporter_only Space
-- reads via can_read_lab.) No longer "any non-free tier": the capability row
-- is the grant.
--
-- Status note (RULED 1 Sep 2026): every capability gate — this one,
-- has_capability(), and the app routes that moved off the tier-slug literal —
-- uniformly requires u.status = 'active'. Deletion-grace (pending_deletion)
-- accounts do NOT keep capability-gated features. The retired app-layer
-- isSupporter() skipped the status check, so the layers used to disagree;
-- active-only is now the doctrine. (Reversing it would mean widening the
-- status predicate here and in has_capability() together.)
create or replace function public.is_supporter()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.users u on u.id = p.user_id
    -- lower() on both sides: with search_path = '' the public-schema citext
    -- '=' is invisible and a bare '=' silently degrades to case-SENSITIVE
    -- text equality; the FK validates case-insensitively, so a case-variant
    -- tier id can legally exist — the join must match it (same guard as
    -- has_capability() / list_visible_tiers in phase1).
    join public.tier_capabilities tc
      on lower(tc.tier_id::text) = lower(p.membership_tier_id::text)
    where p.user_id = auth.uid()
      and u.status = 'active'
      and tc.capability = 'supporter_spaces'
  );
$$;
