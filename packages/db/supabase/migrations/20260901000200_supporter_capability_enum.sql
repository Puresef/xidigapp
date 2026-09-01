-- ============================================================================
-- Two tier-neutral membership capabilities (enum ADD VALUE is the documented
-- growth path; the values are USED — seeded + wired into is_supporter() — in
-- the next migration, because a new enum value cannot be referenced in the
-- transaction that adds it).
--
--   supporter_spaces  reading is_supporter_only Spaces (§16)
--   elevated_limits   the §26 Supporter daily post/comment quotas
--
-- Why: is_supporter() and the app-layer isSupporter() were "any tier that is
-- not literally 'free'" — routing AROUND the tier_capabilities join and
-- breaking the schema's own promise (schema.sql §membership: "a new tier is
-- one INSERT (+ capability rows), zero migration ... RLS gates via a join,
-- never a hard-coded tier name"). Under the literal, ANY future third tier —
-- e.g. a cheaper tier without Lab rights — would silently inherit every
-- Supporter gate. With these capabilities, a new tier gets exactly the rows
-- it is granted.
-- ============================================================================

-- DEPLOY ORDER (hard requirement): this migration and 20260901000300 must be
-- applied BEFORE deploying app code that references 'elevated_limits' —
-- has_capability() rejects an unknown enum value, which would 500 every
-- post/comment create for every tier. (The old tier-slug check had no schema
-- dependency; the new one does.)

alter type membership_capability add value if not exists 'supporter_spaces';
alter type membership_capability add value if not exists 'elevated_limits';
