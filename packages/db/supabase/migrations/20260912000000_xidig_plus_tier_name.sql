-- Paid tier display name: "Supporter" → "Xidig Plus" (owner-edited PRD Relook
-- §24, 12 Sep). membership_tiers.name is returned to ANYONE by the
-- anon-executable list_visible_tiers() config RPC, so it is public copy.
--
-- Display name only. The tier id 'supporter' is an internal identifier (FKs,
-- tier_capabilities, is_supporter(), the 'supporter_spaces' capability, the
-- 'not_supporter' error code) and is deliberately NOT renamed. No price, quota,
-- capability or billing change.
--
-- Xidig Plus is paid patronage plus resource/convenience allowances; it does
-- not buy trust, verification, ranking, governance or capital access. The
-- current tier_capabilities rows that DO gate the candidate vote, candidate
-- submission and Lab creation conflict with that doctrine; that is recorded
-- as a separate gated issue and is not changed here.
--
-- Guarded so a re-run, or a deliberately different name, is left alone.
update public.membership_tiers
   set name = 'Xidig Plus'
 where id = 'supporter' and name = 'Supporter';
