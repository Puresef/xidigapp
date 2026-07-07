-- ============================================================================
-- Xidig — PRD-alignment: unified Following feed source (§13, spec §1a)
-- ============================================================================
-- The Phase 1 Following feed only surfaced followed members' business listings
-- (following_listings, 20260705020000) because Plaza + Labs shipped later. The
-- PRD's Following feed is broader: posts + lab updates + listings from the
-- people and Spaces the caller follows. This migration replaces the single-
-- source view with one unified, keyset-pageable feed source.
--
-- SHAPE (what the API selects + keysets on)
--   following_feed(item_type text, item_id uuid, sort_ts timestamptz, lab_id uuid)
--     item_type : 'post' | 'lab_update' | 'listing'
--     item_id   : the row id in its own table (posts.id / lab_updates.id /
--                 business_listings.id) — the API hydrates by (item_type,item_id)
--     sort_ts   : created_at of the underlying row (feed ordering key)
--     lab_id    : source lab for lab_update rows (else null) — lets the API skip
--                 an extra lookup; NOT used for keyset.
--   Keyset: ORDER BY sort_ts DESC, item_id DESC; page with
--     (sort_ts, item_id) < (:before_ts, :before_id).
--
-- PRIVACY MODEL (why this is safe)
--   The view is SECURITY INVOKER, so every underlying table is read under the
--   CALLER's RLS — the same policies the app already trusts:
--     * posts_select_visible  → only published, non-lab-scoped posts (or the
--       caller's own / a Space the caller is a member of, via is_lab_member);
--       hidden/removed posts never appear.
--     * lab_updates_select_readable → can_read_lab(lab_id) AND published (or
--       author/mod). A PRIVATE lab's update is invisible to a non-member
--       follower because can_read_lab returns false for them — it can never
--       leak through this view, even though they follow the lab.
--     * following_listings (itself security_invoker) → published listings only.
--   The follows/mutes/user_blocks joins run under follows_select_own /
--   mutes_select_own — all own-rows, so no cross-user leakage there either.
--
--   EXCLUSIONS layered ON TOP of RLS (private-feed preferences, §4.5):
--     * muted users  (mutes.entity_type='user',  entity_id = author)      → out
--     * muted labs   (mutes.entity_type='lab',    entity_id = lab_id)      → out
--     * muted tags   (mutes.entity_type='tag')    → posts carrying the tag  → out
--     * blocked users(user_blocks.blocked_user_id = author)                → out
--   Blocks/mutes are the caller's own rows; the auth.uid() correlation is
--   evaluated per candidate row. RLS handles hidden/removed + private-lab
--   visibility; these NOT-EXISTS clauses handle the caller's personal filters.
--
-- Documented further in docs/rls-following-feed.md.
-- ============================================================================

create or replace view public.following_feed
with (security_invoker = true) as

  -- (1) POSTS by followed users. RLS (posts_select_visible) already drops
  --     hidden/removed + lab-scoped-private posts. We additionally require the
  --     author to be someone the caller follows, and apply the caller's
  --     personal mute/block filters.
  select
    'post'::text        as item_type,
    p.id                as item_id,
    p.created_at        as sort_ts,
    null::uuid          as lab_id
  from public.posts p
  join public.follows f
    on f.follower_user_id = (select auth.uid())
   and f.target_type = 'user'
   and f.target_id = p.author_user_id
  where p.author_user_id <> (select auth.uid())          -- own posts aren't "following"
    and not exists (                                      -- muted author
      select 1 from public.mutes m
      where m.user_id = (select auth.uid())
        and m.entity_type = 'user'
        and m.entity_id = p.author_user_id
    )
    and not exists (                                      -- blocked author
      select 1 from public.user_blocks ub
      where ub.blocker_user_id = (select auth.uid())
        and ub.blocked_user_id = p.author_user_id
    )
    and not exists (                                      -- post carries a muted tag
      select 1
      from public.post_tags pt
      join public.mutes m
        on m.user_id = (select auth.uid())
       and m.entity_type = 'tag'
       and m.entity_id = pt.tag_id
      where pt.post_id = p.id
    )

  union all

  -- (2) LAB UPDATES in labs the caller FOLLOWS or is a MEMBER of. RLS
  --     (lab_updates_select_readable → can_read_lab + status) guarantees a
  --     private lab's update never reaches a non-member, regardless of the
  --     follow row. Muted labs / muted-or-blocked authors are filtered out.
  select
    'lab_update'::text  as item_type,
    lu.id               as item_id,
    lu.created_at       as sort_ts,
    lu.lab_id           as lab_id
  from public.lab_updates lu
  where (
      exists (
        select 1 from public.follows f
        where f.follower_user_id = (select auth.uid())
          and f.target_type = 'lab'
          and f.target_id = lu.lab_id
      )
      or public.is_lab_member(lu.lab_id)
    )
    and not exists (                                      -- muted lab
      select 1 from public.mutes m
      where m.user_id = (select auth.uid())
        and m.entity_type = 'lab'
        and m.entity_id = lu.lab_id
    )
    and not exists (                                      -- muted update author
      select 1 from public.mutes m
      where m.user_id = (select auth.uid())
        and m.entity_type = 'user'
        and m.entity_id = lu.author_user_id
    )
    and not exists (                                      -- blocked update author
      select 1 from public.user_blocks ub
      where ub.blocker_user_id = (select auth.uid())
        and ub.blocked_user_id = lu.author_user_id
    )

  union all

  -- (3) LISTINGS from followed users — the existing following_listings logic
  --     (itself security_invoker, published-only). Filtered for muted/blocked
  --     owners so the exclusion model is consistent across all three sources.
  select
    'listing'::text     as item_type,
    fl.id               as item_id,
    fl.created_at       as sort_ts,
    null::uuid          as lab_id
  from public.following_listings fl
  where fl.owner_user_id is not null
    and not exists (                                      -- muted owner
      select 1 from public.mutes m
      where m.user_id = (select auth.uid())
        and m.entity_type = 'user'
        and m.entity_id = fl.owner_user_id
    )
    and not exists (                                      -- blocked owner
      select 1 from public.user_blocks ub
      where ub.blocker_user_id = (select auth.uid())
        and ub.blocked_user_id = fl.owner_user_id
    );

grant select on public.following_feed to authenticated;

comment on view public.following_feed is
  'Unified Following feed source (§13): posts + lab_updates + listings from the '
  'people/Spaces the caller follows (or is a member of). security_invoker → each '
  'source is read under the caller''s RLS, so hidden/removed content and private-'
  'lab updates never leak. Muted (user/tag/lab) + blocked sources are excluded on '
  'top. Columns: (item_type text, item_id uuid, sort_ts timestamptz, lab_id uuid); '
  'keyset on (sort_ts DESC, item_id DESC). Consumed by GET /api/me/feed.';
