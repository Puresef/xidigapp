-- ============================================================================
-- The §19 deletion grace is ordinary membership until the final transition.
--
-- Owner ruling (11 Sep): an account in 'pending_deletion' — the cancellable
-- 30-day grace — is treated like an ordinary member for normal product use;
-- its content stays visible under the same audience rules as an active
-- member's; privileged powers stay blocked during the grace.
--
-- What was wrong: the app admits a grace member (requireUser) and the
-- client-API lifecycle gate admits them (20260911000400), but three older
-- mechanisms built for SUSPENSION enforcement (docs/rls-phase6-moderation.md)
-- used active-only predicates and caught the grace as a side effect:
--   * participation writes — profiles_update_own, reactions_insert_own,
--     skill_endorsements_insert_own, term_suggestions_insert_own,
--     poll_votes_insert_own / _update_own carried `is_active_account()` in
--     their WITH CHECK. Observed on Dev: profile save → 500, reaction → 404,
--     endorsement / term suggestion → 500 (each 500 paged Sentry);
--   * member reach — the members-visibility branch of can_read_lab and the
--     community branch of can_read_candidate required status = 'active';
--   * content visibility — author_is_active() hid every post, comment, Space
--     update/artifact/decision and listing by a grace member from all readers.
--
-- Change (smallest coherent):
--   1. The six participation policies now call the ordinary-member helper
--      current_account_can_use_client_api() (active + pending_deletion; the
--      same one the lifecycle gate uses) instead of is_active_account().
--      Only that conjunct changes; each WITH CHECK is otherwise identical.
--      is_active_account() keeps its strict meaning (status = 'active') for
--      anything that genuinely needs full activity; no policy uses it now.
--   2. author_is_active(), can_read_lab() and can_read_candidate() treat
--      'pending_deletion' as live. Bodies otherwise unchanged; signatures and
--      grants unchanged, so every policy that calls them follows.
--
-- Deliberately UNCHANGED (still active-only): is_mod, is_admin, is_verifier,
-- is_advisor, is_venture_lead, can_review_candidate — moderation, admin,
-- verification, advisory and review powers; and is_supporter / has_capability
-- — the supporter tier mixes paid features with governance (vote_candidate,
-- governance_rights), which this slice does not decide. suspended,
-- deactivated and deleted stay refused by the client lifecycle gate and by
-- every rule above. The profile freeze trigger, the own-row users SELECT
-- exemption and the service role are untouched.
--
-- Contract-tested: packages/db/src/grace-period-inventory.test.ts.
-- Fix-forward only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Participation writes: ordinary members, not only 'active'.
-- ---------------------------------------------------------------------------
alter policy profiles_update_own on public.profiles
  with check (
    user_id = (select auth.uid())
    and (select public.current_account_can_use_client_api())
  );

alter policy reactions_insert_own on public.reactions
  with check (
    user_id = (select auth.uid())
    and (select public.current_account_can_use_client_api())
    and (
      (
        post_id is not null
        and exists (
          select 1 from public.posts p
          where p.id = reactions.post_id
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
      or (
        comment_id is not null
        and exists (
          select 1
          from public.comments c
          join public.posts p on p.id = c.post_id
          where c.id = reactions.comment_id
            and c.status = 'published'
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
    )
  );

alter policy skill_endorsements_insert_own on public.skill_endorsements
  with check (
    endorser_user_id = (select auth.uid())
    and (select public.current_account_can_use_client_api())
  );

alter policy term_suggestions_insert_own on public.term_suggestions
  with check (
    suggested_by = (select auth.uid())
    and (select public.current_account_can_use_client_api())
  );

alter policy poll_votes_insert_own on public.poll_votes
  with check (
    voter_user_id = (select auth.uid())
    and (select public.current_account_can_use_client_api())
    and exists (
      select 1 from public.posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

alter policy poll_votes_update_own on public.poll_votes
  with check (
    voter_user_id = (select auth.uid())
    and (select public.current_account_can_use_client_api())
    and exists (
      select 1 from public.posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

comment on function public.is_active_account() is
  'Strictly status = ''active''. NOT the ordinary-member test — that is current_account_can_use_client_api() (active + the cancellable §19 deletion grace). No policy uses this since 20260911000500; reach for it only when full activity is genuinely required.';

-- ---------------------------------------------------------------------------
-- 2. Visibility and member reach: the grace is live.
-- ---------------------------------------------------------------------------

-- author_is_active: body of 20260708100000 with the grace counted as live.
create or replace function public.author_is_active(author_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = author_id and u.status in ('active', 'pending_deletion')
  );
$$;

comment on function public.author_is_active(uuid) is
  'Content visibility: true when the author''s account is live — active, or in the cancellable §19 deletion grace. A suspended, deactivated or deleted author''s content is hidden from other readers.';

-- can_read_lab: body of 20260706200000; the members branch admits the grace.
-- is_supporter() (supporter-only Spaces) is unchanged and stays active-only.
create or replace function public.can_read_lab(p_lab_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.labs l
    where l.id = p_lab_id
      and (
        l.lead_user_id = auth.uid()             -- lead always
        or public.is_mod()                      -- moderation reach
        or public.is_lab_member(p_lab_id)       -- active Space member (Private)
        or l.visibility = 'public'              -- build-in-public
        or (                                    -- Members only, supporter-gated
          l.visibility = 'members'
          and exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.status in ('active', 'pending_deletion')
          )
          and (l.is_supporter_only = false or public.is_supporter())
        )
      )
  );
$$;

-- can_read_candidate: body of 20260707000000; the community branch admits
-- the grace.
create or replace function public.can_read_candidate(cand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.venture_candidates c
    where c.id = cand
      and (
        public.is_admin()                               -- moderation/ops reach
        or public.is_mod()                              -- review + moderation reach
        or c.created_by_user_id = auth.uid()            -- the builder always
        or public.is_candidate_lab_member(cand)         -- Lab members (drafts too)
        or (
          -- Community visibility: only once it leaves draft, and only for
          -- logged-in members. reviewers_only never opens to the community.
          c.visibility = 'all_members'
          and c.status <> 'draft'
          and exists (
            select 1 from public.users u
            where u.id = auth.uid() and u.status in ('active', 'pending_deletion')
          )
        )
      )
  );
$$;
