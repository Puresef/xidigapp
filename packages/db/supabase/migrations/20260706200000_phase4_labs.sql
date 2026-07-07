-- ============================================================================
-- Xidig v1.0 — Phase 4: Labs as unified Spaces — RLS, helpers, activity, sweeps
-- ============================================================================
-- Phase 0 already shipped the ENTIRE Labs-as-Spaces domain fully locked (all
-- tables + enums + indexes + updated_at triggers; RLS enabled by the Phase 1
-- blanket loop, ZERO policies). Nothing about the domain model needs changing:
-- space_mode, visibility, member_list_visibility, charter fields, promoted_at,
-- sprint_deadline, last_activity_at, dormant_since, lab_collaborations,
-- lab_events, lab_skill_needs, profile_pinned_labs and venture_candidates all
-- already exist. So this migration adds ONLY the wiring Phase 4 owns:
--
--   1. visibility predicates (is_supporter / is_lab_member / can_read_lab /
--      can_read_lab_roster) — SECURITY DEFINER, same style as is_admin() /
--      has_capability();
--   2. a last_activity_at bump trigger on updates/artifacts/decisions/lab-posts
--      (mirrors touch_conversation_on_message) that ALSO clears dormant_since
--      so any new activity instantly revives a Space (§16 "instantly revivable");
--   3. SELECT policies for every lab_* table following the Phase 1/2/3
--      conventions (authenticated-only, (select auth.uid()), writes API-only
--      via the service role), implementing the §16 Private / Members / Public
--      visibility model;
--   4. relaxes the Phase-2 `lab_id is null` guards so Space-scoped posts /
--      comments / reactions / polls become visible to Space members (Phase 2
--      deliberately parked these "until Labs ship their own policy");
--   5. mark_dormant_labs() and flag_skill_gaps() — the 28-day dormancy and
--      7-day skills-gap sweeps, invoked by /api/cron/labs (service role). Both
--      are ENCOURAGEMENT-only: mark_dormant_labs NEVER changes space_mode,
--      stage or visibility — a stalled Space is never demoted (§16 no-demotion).
--
-- Visibility model (§16 Private / Members only / Public):
--   * Public  — visibility='public': any authenticated member reads it via RLS;
--     anon reads the SSR public projection (service role, narrow columns) — the
--     build-in-public / SEO surface. No anon RLS policy (house convention: anon
--     gets nothing through RLS; pre-auth reads go through the server).
--   * Members — visibility='members' (default): any ACTIVE member reads it,
--     subject to the is_supporter_only gate.
--   * Private — visibility='private': only active Space members + the lead
--     (mods retain moderation reach).
--
-- Write model (same reasoning as Plaza posts / DMs): every lab_* table gets NO
-- client insert/update/delete policy. Creation, promotion, membership
-- transitions, settings changes, cross-posts and pins all carry API-side
-- obligations the database cannot express — capability gates (create_lab),
-- charter completeness, role checks, lab_events history logging, notification /
-- cross-post side effects, loop/duplicate protection. A direct PostgREST write
-- would bypass all of them, so the API (service role, after explicit authz) is
-- the only writer.
-- ============================================================================

-- ============================================================================
-- 1. VISIBILITY PREDICATES (SECURITY DEFINER, empty search_path)
-- ============================================================================
-- Each takes no uid parameter — auth.uid() resolves internally so a caller can
-- never probe another member's access. SECURITY DEFINER runs as the table owner
-- (bypasses RLS), so can_read_lab reading public.labs does NOT recurse through
-- the labs SELECT policy. Same pattern proven by is_admin() / dm_unread_count().

-- Paying member? ("Supporter or above" — Builder/Investor are paths under
-- Supporter, so any non-free tier counts.) Gates is_supporter_only Spaces.
create function public.is_supporter()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.users u on u.id = p.user_id
    where p.user_id = auth.uid()
      and u.status = 'active'
      and lower(p.membership_tier_id::text) <> 'free'
  );
$$;

revoke all on function public.is_supporter() from public, anon;
grant execute on function public.is_supporter() to authenticated, service_role;

-- Active member of a specific Space? (Covers Private read + engagement gates.)
create function public.is_lab_member(p_lab_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.lab_members lm
    where lm.lab_id = p_lab_id
      and lm.user_id = auth.uid()
      and lm.status = 'active'
  );
$$;

revoke all on function public.is_lab_member(uuid) from public, anon;
grant execute on function public.is_lab_member(uuid) to authenticated, service_role;

-- Can the caller read this Space at all? Implements the §16 visibility model.
create function public.can_read_lab(p_lab_id uuid)
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
            where u.id = auth.uid() and u.status = 'active'
          )
          and (l.is_supporter_only = false or public.is_supporter())
        )
      )
  );
$$;

revoke all on function public.can_read_lab(uuid) from public, anon;
grant execute on function public.can_read_lab(uuid) to authenticated, service_role;

-- Can the caller read the MEMBER ROSTER? The "member view" Space setting
-- (member_list_visibility) narrows the roster independently of the Space body:
-- 'private' rosters are members+lead-only even in a Members/Public Space.
create function public.can_read_lab_roster(p_lab_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    public.can_read_lab(p_lab_id)
    and (
      public.is_lab_member(p_lab_id)
      or public.is_mod()
      or exists (
        select 1 from public.labs l
        where l.id = p_lab_id
          and (
            l.lead_user_id = auth.uid()
            or l.member_list_visibility in ('members', 'public')
          )
      )
    );
$$;

revoke all on function public.can_read_lab_roster(uuid) from public, anon;
grant execute on function public.can_read_lab_roster(uuid) to authenticated, service_role;

-- ============================================================================
-- 2. ACTIVITY BUMP + INSTANT REVIVE
-- ============================================================================
-- Meaningful activity (a new update / artifact / decision / Space-scoped post)
-- bumps labs.last_activity_at (drives the dormancy sweep + Discover ordering)
-- and clears dormant_since so a Dormant Space is revived the instant someone
-- posts (§16 "instantly revivable"; §27 "Revive it with a quick update"). Runs
-- as owner, so it fires on service-role inserts despite the API-only write model.

create function public.touch_lab_last_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.labs
     set last_activity_at = now(),
         dormant_since = null
   where id = new.lab_id;
  return new;
end;
$$;

create trigger lab_updates_touch_activity
  after insert on public.lab_updates
  for each row execute function public.touch_lab_last_activity();

create trigger lab_artifacts_touch_activity
  after insert on public.lab_artifacts
  for each row execute function public.touch_lab_last_activity();

create trigger lab_decisions_touch_activity
  after insert on public.lab_decisions
  for each row execute function public.touch_lab_last_activity();

-- Space-scoped Plaza posts count as activity too (posts.lab_id not null).
create trigger posts_touch_lab_activity
  after insert on public.posts
  for each row when (new.lab_id is not null)
  execute function public.touch_lab_last_activity();

-- ============================================================================
-- 3. RLS — LAB / SPACE TABLES (SELECT policies; writes revoked)
-- ============================================================================

-- --- labs -------------------------------------------------------------------
create policy labs_select_readable on labs
  for select to authenticated
  using (public.can_read_lab(id));

revoke insert, update, delete on public.labs from anon, authenticated;

-- --- lab_members (roster; member_list_visibility applies) -------------------
create policy lab_members_select_roster on lab_members
  for select to authenticated
  using (public.can_read_lab_roster(lab_id));

revoke insert, update, delete on public.lab_members from anon, authenticated;

-- --- lab_tags (chips follow the Space) --------------------------------------
create policy lab_tags_select_readable on lab_tags
  for select to authenticated
  using (public.can_read_lab(lab_id));

revoke insert, update, delete on public.lab_tags from anon, authenticated;

-- --- lab_updates (moderatable; author/mod see own/all) ----------------------
create policy lab_updates_select_readable on lab_updates
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      status = 'published'
      or author_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

revoke insert, update, delete on public.lab_updates from anon, authenticated;

-- --- lab_artifacts (links only in v1.0; moderatable) ------------------------
create policy lab_artifacts_select_readable on lab_artifacts
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      status = 'published'
      or added_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

revoke insert, update, delete on public.lab_artifacts from anon, authenticated;

-- --- lab_decisions (decision log; moderatable) ------------------------------
create policy lab_decisions_select_readable on lab_decisions
  for select to authenticated
  using (
    public.can_read_lab(lab_id)
    and (
      status = 'published'
      or created_by_user_id = (select auth.uid())
      or public.is_mod()
    )
  );

revoke insert, update, delete on public.lab_decisions from anon, authenticated;

-- --- lab_events (Space History / activity log) -----------------------------
-- Readable to anyone who can read the Space: promotions, joins/exits, charter
-- completion and dormancy events are part of the build-in-public timeline.
create policy lab_events_select_readable on lab_events
  for select to authenticated
  using (public.can_read_lab(lab_id));

revoke insert, update, delete on public.lab_events from anon, authenticated;

-- --- lab_skill_needs ("looking for" — drives directory card + gap alerts) ---
create policy lab_skill_needs_select_readable on lab_skill_needs
  for select to authenticated
  using (public.can_read_lab(lab_id));

revoke insert, update, delete on public.lab_skill_needs from anon, authenticated;

-- --- lab_collaborations (visible from either side of the link) --------------
create policy lab_collaborations_select_readable on lab_collaborations
  for select to authenticated
  using (
    public.can_read_lab(lab_a_id)
    or public.can_read_lab(lab_b_id)
  );

revoke insert, update, delete on public.lab_collaborations from anon, authenticated;

-- --- profile_pinned_labs (1–3 featured Labs on a profile) -------------------
-- Own pins always; someone else's pin only if you can read the pinned Space
-- (a private Space must not leak through a pin on a public profile).
create policy profile_pinned_labs_select_readable on profile_pinned_labs
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_read_lab(lab_id)
  );

revoke insert, update, delete on public.profile_pinned_labs from anon, authenticated;

-- --- lab_playbooks (charter templates; reference data) ----------------------
create policy lab_playbooks_select_active on lab_playbooks
  for select to authenticated
  using (is_active);

revoke insert, update, delete on public.lab_playbooks from anon, authenticated;

-- ============================================================================
-- 4. RELAX PHASE-2 `lab_id is null` GUARDS (Space-scoped content now visible)
-- ============================================================================
-- Phase 2 gated every posts/comments/reactions/poll policy on `lab_id is null`
-- with the note "out of reach until Labs ship their own policy." That policy is
-- now here. Design decision: the lab_id-scoped Plaza surface is the Space's
-- INTERNAL discussion ("room chat"), so it is visible to active Space MEMBERS
-- only (is_lab_member) — NOT to every reader of the Space. The outward
-- build-in-public content is lab_updates / lab_artifacts / lab_decisions, which
-- are gated by can_read_lab (public/members/private) above. This keeps a public
-- Space's curated build-log public while its working discussion stays members-
-- only, and preserves the Phase-2 guarantee that a non-member never sees a
-- Space's internal posts.

-- posts: lab-scoped posts require active membership.
drop policy if exists posts_select_visible on posts;
create policy posts_select_visible on posts
  for select to authenticated
  using (
    (status = 'published' and (lab_id is null or public.is_lab_member(lab_id)))
    or author_user_id = (select auth.uid())
    or public.is_mod()
  );

-- comments: parent-post visibility now includes member-visible lab posts.
drop policy if exists comments_select_visible on comments;
create policy comments_select_visible on comments
  for select to authenticated
  using (
    author_user_id = (select auth.uid())
    or public.is_mod()
    or (
      status = 'published'
      and post_id is not null
      and exists (
        select 1 from posts p
        where p.id = comments.post_id
          and (
            (p.status = 'published' and (p.lab_id is null or public.is_lab_member(p.lab_id)))
            or p.author_user_id = (select auth.uid())
          )
      )
    )
  );

-- post_tags: follows parent post visibility.
drop policy if exists post_tags_select_visible on post_tags;
create policy post_tags_select_visible on post_tags
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = post_tags.post_id
        and (
          (p.status = 'published' and (p.lab_id is null or public.is_lab_member(p.lab_id)))
          or p.author_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

-- poll_options: follows parent post visibility.
drop policy if exists poll_options_select_visible on poll_options;
create policy poll_options_select_visible on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = poll_options.post_id
        and (
          (p.status = 'published' and (p.lab_id is null or public.is_lab_member(p.lab_id)))
          or p.author_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

-- poll_votes: a Space member may vote in that Space's poll (not just global).
drop policy if exists poll_votes_insert_own on poll_votes;
create policy poll_votes_insert_own on poll_votes
  for insert to authenticated
  with check (
    voter_user_id = (select auth.uid())
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

drop policy if exists poll_votes_update_own on poll_votes;
create policy poll_votes_update_own on poll_votes
  for update to authenticated
  using (voter_user_id = (select auth.uid()))
  with check (
    voter_user_id = (select auth.uid())
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and (p.lab_id is null or public.is_lab_member(p.lab_id))
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

-- reactions: a Space member may react to that Space's post/comment.
drop policy if exists reactions_insert_own on reactions;
create policy reactions_insert_own on reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (
        post_id is not null
        and exists (
          select 1 from posts p
          where p.id = reactions.post_id
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
      or (
        comment_id is not null
        and exists (
          select 1 from comments c
          join posts p on p.id = c.post_id
          where c.id = reactions.comment_id
            and c.status = 'published'
            and p.status = 'published'
            and (p.lab_id is null or public.is_lab_member(p.lab_id))
        )
      )
    )
  );

-- ============================================================================
-- 5. DORMANCY SWEEP (28 days) — ENCOURAGEMENT ONLY, NEVER DEMOTES
-- ============================================================================
-- Marks Spaces with no meaningful activity in 28 days as Dormant: sets
-- dormant_since and writes a 'marked_dormant' history event. It touches NOTHING
-- else — space_mode, stage, visibility, membership are all left exactly as they
-- were. There is no demotion path anywhere in the schema or this function.
-- Returns the ids newly marked so the /api/cron/labs route can fan out the
-- revival nudge (in-app, §26) to each Space's members. Instantly reversible:
-- the next update/artifact/decision clears dormant_since via the trigger above.

create function public.mark_dormant_labs()
returns setof uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    update public.labs
       set dormant_since = now()
     where dormant_since is null
       and last_activity_at < now() - interval '28 days'
    returning id
  loop
    insert into public.lab_events (lab_id, event_type, metadata)
      values (r.id, 'marked_dormant', jsonb_build_object('threshold_days', 28));
    return next r.id;
  end loop;
  return;
end;
$$;

revoke all on function public.mark_dormant_labs() from public, anon, authenticated;
grant execute on function public.mark_dormant_labs() to service_role;

-- ============================================================================
-- 6. SKILLS-GAP SWEEP (7 days) — non-punitive, non-blocking
-- ============================================================================
-- Flags "looking for" skills open (unfilled) and un-alerted for 7+ days,
-- stamping alerted_at so each fires once. Returns (lab_id, skill) so the cron
-- route can notify members whose profile matches the skill (§16). It never
-- blocks the Space or changes its state — it only stamps alerted_at.

create function public.flag_skill_gaps()
returns table (lab_id uuid, skill text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
    update public.lab_skill_needs sn
       set alerted_at = now()
     where sn.filled_at is null
       and sn.alerted_at is null
       and sn.created_at < now() - interval '7 days'
    returning sn.lab_id, sn.skill;
end;
$$;

revoke all on function public.flag_skill_gaps() from public, anon, authenticated;
grant execute on function public.flag_skill_gaps() to service_role;
