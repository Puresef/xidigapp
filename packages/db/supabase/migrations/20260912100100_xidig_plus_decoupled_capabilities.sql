-- Xidig Plus doctrine, P1 step 5 (owner rulings, 12 Sep): Xidig Plus is
-- patronage, resource and convenience ONLY. It must not gate governance,
-- candidate votes, candidate submission, Lab/project creation, capital paths,
-- verification, ranking, trust or professional credibility.
--
-- DEPLOY ORDER (hard requirement, owner ruling): apply this ONLY AFTER the app
-- from claude/integration-plus-retention is deployed. That app no longer
-- consults any of these five capabilities: Lab creation and promotion,
-- candidate creation and submission, and the candidate vote are PAUSED for
-- everyone and never call has_capability. Applying it early is still
-- non-broadening: the older app's gates would simply refuse everyone. But the
-- ordering is the owner's rule, so follow it. It is NOT applied to the Dev
-- project by the dispatch that wrote it.
--
-- What it does: removes the paid tier's five doctrine-forbidden rows. They
-- were seeded at 20260704000000_schema.sql:1277,1279-1282.
--   create_lab, vote_candidate, governance_rights, builder_path, investor_path
-- Effect:
--   * has_capability(...) answers false for EVERY account for these five, and
--     no other tier holds them ('free' never did), so nobody gains anything;
--   * list_visible_tiers(), callable by anon, stops advertising them as Xidig
--     Plus capabilities in its public `capabilities` array.
--
-- What it deliberately does NOT do:
--   * no enum value is dropped: has_capability() rejects an unknown enum
--     value (20260901000200). The @xidig/db entitlements.ts classification
--     still lists all five as ACTIVE_ONLY, held by no tier;
--   * no function is re-created: has_capability, is_supporter,
--     has_entitlement and can_read_lab keep the deletion branch's bodies;
--   * the ordinary allowances stay on the paid tier: elevated_limits,
--     supporter_spaces (owner question Q4), join_unlimited_labs,
--     intelligence_updates;
--   * no Lab, candidate, ballot, Venture or membership row is touched.
--
-- Rollback (fix-forward, owner call): a new migration re-inserting the five
-- rows with `on conflict (tier_id, capability) do nothing` (the
-- 20260901000300:10-13 pattern). A rollback can never give more than the
-- pre-slice access.

delete from public.tier_capabilities
 where lower(tier_id::text) = 'supporter'
   and capability in (
     'create_lab',
     'vote_candidate',
     'governance_rights',
     'builder_path',
     'investor_path'
   );
