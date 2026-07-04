-- ============================================================================
-- Xidig v1.0 — Phase 1: API surface (RLS policies + grants for the API layer)
-- ============================================================================
-- Companion to 20260704200000_phase1_auth.sql, which enabled RLS everywhere
-- (default deny) and opened the auth-adjacent tables. This migration opens the
-- remaining tables the Phase 1 API serves — profiles directory, follows,
-- business listings + claims, vouches, endorsements, badges, and the lookup
-- taxonomies — following the same conventions:
--
--   * Policies are written for `authenticated` only; `anon` gets nothing.
--     Pre-auth reads (public listing/profile pages, §28) go through the API
--     layer's service-role client with explicit safe-column projections.
--   * auth.uid() is wrapped in (select ...) so the planner evaluates it once
--     per statement, not per row.
--   * Column-level grants restrict every client write to the self-service
--     columns; moderated/derived columns (status, verification_status,
--     source, export_readiness_score) are only writable by the service role.
--   * Tables whose writes have side effects the DB cannot express (vouch →
--     community-verified transition, claim approval → ownership transfer)
--     get NO insert/update policy: those flows are API-only, same as invites.
--   * verifications, waitlist_entries, signup_grants, auth_email_tokens,
--     app_settings, membership_tiers, tier_capabilities stay locked
--     (service-role only / SECURITY DEFINER functions), unchanged.
-- ============================================================================

-- ============================================================================
-- 1. FOLLOWS (§13 — one-way follow of people, Labs, Ventures, tags)
-- ============================================================================
-- A member manages and reads their own follow edges. Follower counts and
-- "who follows X" aggregates are served by the API (service role) so a
-- member's full following graph is never directly enumerable by others.
-- Polymorphic target_id integrity (user/lab/candidate/tag) is an app-layer
-- obligation (Phase 0 notes) — the API validates the target exists before
-- inserting.

create policy follows_select_own on follows
  for select to authenticated
  using (follower_user_id = (select auth.uid()));

create policy follows_insert_own on follows
  for insert to authenticated
  with check (follower_user_id = (select auth.uid()));

create policy follows_delete_own on follows
  for delete to authenticated
  using (follower_user_id = (select auth.uid()));

revoke insert, update, delete on public.follows from anon, authenticated;
grant insert (follower_user_id, target_type, target_id)
  on public.follows to authenticated;
grant delete on public.follows to authenticated;

-- ============================================================================
-- 2. BUSINESS LISTINGS (§18 — directory & map)
-- ============================================================================
-- Published listings are member-visible; owners see their own regardless of
-- moderation state; mods see everything (reports queue, §19). Owners write
-- content columns only: status (moderation), verification_status (§14 badge),
-- source (member/seed/ai provenance) and export_readiness_score (computed
-- server-side from the checklist, §18) are never client-writable.

create policy listings_select_published on business_listings
  for select to authenticated
  using (
    status = 'published'
    or owner_user_id = (select auth.uid())
    or public.is_mod()
  );

create policy listings_insert_own on business_listings
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy listings_update_own on business_listings
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

revoke insert, update, delete on public.business_listings from anon, authenticated;
grant insert (owner_user_id, business_name, category_id, short_description,
              address, landmark, latitude, longitude, city, country,
              contact_links, export_checklist)
  on public.business_listings to authenticated;
grant update (business_name, category_id, short_description,
              address, landmark, latitude, longitude, city, country,
              contact_links, export_checklist)
  on public.business_listings to authenticated;

-- --- listing_tags --------------------------------------------------------
-- Tag chips render on every listing card; owners curate their own listing's
-- tags. Tag existence is FK-enforced.

create policy listing_tags_select_authenticated on listing_tags
  for select to authenticated
  using (true);

create policy listing_tags_insert_own_listing on listing_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from business_listings l
      where l.id = listing_id and l.owner_user_id = (select auth.uid())
    )
  );

create policy listing_tags_delete_own_listing on listing_tags
  for delete to authenticated
  using (
    exists (
      select 1 from business_listings l
      where l.id = listing_id and l.owner_user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.listing_tags from anon, authenticated;
grant insert (listing_id, tag_id) on public.listing_tags to authenticated;
grant delete on public.listing_tags to authenticated;

-- --- listing_claims (§18 "Claim this listing") ---------------------------
-- A member may claim an unclaimed listing and read their own claims. Review
-- (approve → ownership transfer + audit row) is a mod flow through the API
-- (service role), so there is no client update policy.

create policy listing_claims_select_own on listing_claims
  for select to authenticated
  using (claimant_user_id = (select auth.uid()));

create policy listing_claims_insert_own on listing_claims
  for insert to authenticated
  with check (
    claimant_user_id = (select auth.uid())
    and exists (
      select 1 from business_listings l
      where l.id = listing_id and l.owner_user_id is null
    )
  );

revoke insert, update, delete on public.listing_claims from anon, authenticated;
grant insert (listing_id, claimant_user_id, evidence)
  on public.listing_claims to authenticated;

-- ============================================================================
-- 3. VOUCHES & SKILL ENDORSEMENTS (§14)
-- ============================================================================
-- Vouches: members see vouches they gave or received. Creation is API-only
-- (no insert policy, same pattern as invites): the vouch flow enforces
-- "3 verified members vouch" eligibility, performs the community_verified
-- transition + badge award atomically, and writes the audit trail — none of
-- which a bare PostgREST insert would do.

create policy vouches_select_involved on vouches
  for select to authenticated
  using (
    voucher_user_id = (select auth.uid())
    or vouchee_user_id = (select auth.uid())
  );

revoke insert, update, delete on public.vouches from anon, authenticated;

-- Skill endorsements are side-effect-free peer signals shown on profiles
-- (§14), so members manage their own directly.

create policy skill_endorsements_select_authenticated on skill_endorsements
  for select to authenticated
  using (true);

create policy skill_endorsements_insert_own on skill_endorsements
  for insert to authenticated
  with check (endorser_user_id = (select auth.uid()));

create policy skill_endorsements_delete_own on skill_endorsements
  for delete to authenticated
  using (endorser_user_id = (select auth.uid()));

revoke insert, update, delete on public.skill_endorsements from anon, authenticated;
grant insert (endorser_user_id, endorsee_user_id, skill)
  on public.skill_endorsements to authenticated;
grant delete on public.skill_endorsements to authenticated;

-- ============================================================================
-- 4. BADGES (§14, §20)
-- ============================================================================
-- Badge definitions are a public catalog; awards are visible credentials.
-- A revoked badge disappears for everyone except its holder (revoke →
-- re-verify path, §14). Awards/revocations are service-role writes only.

create policy badge_definitions_select_authenticated on badge_definitions
  for select to authenticated
  using (true);

create policy user_badges_select_active on user_badges
  for select to authenticated
  using (revoked_at is null or user_id = (select auth.uid()));

revoke insert, update, delete on public.badge_definitions from anon, authenticated;
revoke insert, update, delete on public.user_badges from anon, authenticated;

-- ============================================================================
-- 5. LOOKUP TAXONOMIES (§18, §26)
-- ============================================================================
-- Approved constants seeded in Phase 0. Member-suggested tags arrive with
-- Plaza (Phase 2) through the API; category management is admin-side.

create policy tags_select_authenticated on tags
  for select to authenticated
  using (true);

create policy listing_categories_select_authenticated on listing_categories
  for select to authenticated
  using (true);

revoke insert, update, delete on public.tags from anon, authenticated;
revoke insert, update, delete on public.listing_categories from anon, authenticated;
