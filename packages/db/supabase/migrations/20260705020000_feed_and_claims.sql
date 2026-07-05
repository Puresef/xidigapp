-- Phase 1 member UI hardening (adversarial-review fixes).
--
-- (1) Following feed source (§13). The route previously read the caller's
--     entire follow list and inlined every id into a PostgREST `in.(...)`
--     query string — it silently truncates at PostgREST's row cap and the
--     URL blows past proxy limits for members who follow a few hundred
--     people. A SECURITY INVOKER view lets the database do the join under the
--     CALLER's RLS (follows_select_own + listings_select_published both still
--     apply), so the route selects from it with normal keyset pagination and
--     no id list ever hits the wire.
create or replace view public.following_listings
with (security_invoker = true) as
  select bl.*
  from public.business_listings bl
  join public.follows f
    on f.target_type = 'user'
   and f.target_id = bl.owner_user_id
  where f.follower_user_id = (select auth.uid());

grant select on public.following_listings to authenticated;

comment on view public.following_listings is
  'Following feed source (§13): published listings from users the caller follows. security_invoker → the caller''s RLS on follows + business_listings applies. Consumed by GET /api/me/feed.';

-- (2) Claim idempotency (§18). listing_claims had no uniqueness on
--     (listing_id, claimant_user_id), so a double-submit (two tabs, or the
--     duplicates-panel claim plus the /l/[id] claim) created multiple pending
--     rows — and the page's pending-claim probe (.maybeSingle) then errored
--     and re-offered the form. One open claim per member per listing:
create unique index if not exists listing_claims_one_pending_per_member
  on public.listing_claims (listing_id, claimant_user_id)
  where status = 'pending';
