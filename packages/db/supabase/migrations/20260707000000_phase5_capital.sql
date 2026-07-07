-- ============================================================================
-- Xidig v1.0 — Phase 5: Capital / Maal — RLS, visibility helpers, tallies
-- ============================================================================
-- Phase 0 already shipped the ENTIRE Capital domain fully locked (all tables +
-- enums + indexes + updated_at triggers; RLS enabled by the Phase 1 blanket
-- loop, ZERO policies): venture_candidates, candidate_reviews, candidate_votes,
-- interests, capital_gate_evaluations, plus comments.candidate_id (open member
-- comments, §12) and page_blocks owner_type='candidate'. Phase 4's promote-to-
-- candidate already writes a DRAFT venture_candidates row (a marker). So this
-- migration adds ONLY the wiring Phase 5 owns:
--
--   1. Candidate visibility predicates (can_read_candidate /
--      is_candidate_lab_member / can_review_candidate) — SECURITY DEFINER, same
--      style as can_read_lab() / is_lab_member() / is_admin();
--   2. ballot/interest-privacy tallies (candidate_vote_tally /
--      candidate_interest_counts) — SECURITY DEFINER counts-only, exactly the
--      poll_results() precedent (the raw ballot tables stay own-row-only);
--   3. SELECT policies opening the five Capital tables (candidate readability,
--      own-row ballots/interests/gate log), writes API-only via the service
--      role (default-deny stays for anon/authenticated writes);
--   4. EXTEND comments_select_visible so candidate-targeted comments become
--      readable when the candidate is readable (§12 open member comments);
--   5. EXTEND page_blocks_select_visible so candidate-owned blocks become
--      readable when can_read_candidate + block visibility admits the caller
--      (Phase 4.5 parked owner_type='candidate' as mod-only).
--
-- Locked scope (§17 + Warya 7 Jul): Capital v1 is a listing/intro service +
-- intent capture + manual ops. NO money movement, NO pledge ledger, NO payout
-- states, NO tokens. Maalgeli (Invest) = intent capture only, Somalia-region
-- gated (geo-IP AND profile country AND self-attestation — ALL three, enforced
-- at the APP layer; the capital_gate_evaluations log here is the audit trail).
-- Garab/Co-sign + "I can help" are non-financial and never gated.
--
-- Visibility model (§17):
--   * all_members  — status NOT 'draft' AND caller is a logged-in member:
--     readable community-wide (the default candidate visibility).
--   * reviewers_only — only the review set (mod/admin), lab members, creator,
--     admin: the Lab lead can share a candidate under wraps for scoring.
--   * draft        — creator + lab members + admin only (Phase 4's marker row,
--     pre-submission): never community-visible.
--   Admins and mods always read (moderation + review reach). "Public" logged-out
--   projection (timeline_public) is served by the SSR service role, not anon
--   RLS (house convention: anon gets nothing through RLS).
--
-- Reviewer set (v1.0): there is NO dedicated reviewer role pre-Phase-6, so the
-- reviewer set is is_mod() OR is_admin(), MINUS recusal (a mod who is a member
-- of the candidate's Lab cannot review it, §17). FLAGGED in
-- docs/rls-phase5-capital.md as a Phase-6 revisit (a verifier role may replace
-- mod-as-reviewer).
--
-- Write model (same reasoning as Plaza posts / DMs / Labs): every Capital table
-- gets NO client insert/update/delete policy. Candidate lifecycle (edit →
-- submit → review → decide), rubric aggregation, vote-window enforcement, the
-- three-input region gate + its compliance log, and the interest side effects
-- all carry API-side obligations the database cannot express. A direct
-- PostgREST write would bypass them, so the API (service role, after explicit
-- authz) is the only writer.
-- ============================================================================

-- ============================================================================
-- 1. CANDIDATE VISIBILITY PREDICATES (SECURITY DEFINER, empty search_path)
-- ============================================================================
-- Each takes the candidate id but NO uid parameter — auth.uid() resolves
-- internally so a caller can never probe another member's access. SECURITY
-- DEFINER runs as the owner (bypasses RLS), so can_read_candidate reading
-- public.venture_candidates does NOT recurse through the candidate SELECT
-- policy. Reuses is_lab_member() / is_mod() / is_admin() (Phase 1/4).

-- Active member of the candidate's Lab (lab_id or co_lab_id)? Drives recusal
-- (a Lab member cannot review its own Candidate) and draft/reviewers_only read.
create function public.is_candidate_lab_member(cand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.venture_candidates c
    where c.id = cand
      and (
        public.is_lab_member(c.lab_id)
        or (c.co_lab_id is not null and public.is_lab_member(c.co_lab_id))
      )
  );
$$;

revoke all on function public.is_candidate_lab_member(uuid) from public, anon;
grant execute on function public.is_candidate_lab_member(uuid) to authenticated, service_role;

-- Can the caller read this Candidate at all? Implements the §17 visibility model
-- (draft / reviewers_only / all_members) plus admin/mod moderation reach.
create function public.can_read_candidate(cand uuid)
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
            where u.id = auth.uid() and u.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function public.can_read_candidate(uuid) from public, anon;
grant execute on function public.can_read_candidate(uuid) to authenticated, service_role;

-- Reviewer eligibility for v1.0 (§17): mod OR admin, MINUS recusal. No dedicated
-- reviewer role exists pre-Phase-6 (see docs/rls-phase5-capital.md — Phase-6
-- revisit). A mod/admin who is a member of the candidate's Lab is recused.
create function public.can_review_candidate(cand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (public.is_mod() or public.is_admin())
     and not public.is_candidate_lab_member(cand);
$$;

revoke all on function public.can_review_candidate(uuid) from public, anon;
grant execute on function public.can_review_candidate(uuid) to authenticated, service_role;

-- ============================================================================
-- 2. TALLIES (SECURITY DEFINER, counts-only — ballot/interest privacy)
-- ============================================================================
-- candidate_votes and interests are otherwise own-row-only (a member sees only
-- their own ballot / their own interest). Aggregate social proof — the vote
-- tally and the Garab/help/invest counts — comes EXCLUSIVELY through these two
-- functions, which never enumerate WHO voted or expressed interest. Same design
-- as poll_results() (Seq 14 anonymous ballots).
--
-- Readability is NOT re-checked here. These functions run counts-only and are
-- always invoked AFTER the caller has already loaded the candidate under RLS
-- (route-level loadCandidateForViewer, or the RLS candidate fetch in
-- lib/capital/views.ts) — can_read_candidate has therefore already gated access
-- to this candidate. Crucially, both the app read path AND the vote/interests
-- API routes call these RPCs through the SERVICE-ROLE admin client (ballots are
-- own-row-only, so a plain count would be blocked). Under that client
-- auth.uid() is NULL, so an internal `and can_read_candidate(cand)` guard would
-- be FALSE for every candidate and permanently zero every tally. Dropping the
-- guard (readability enforced by the caller) mirrors the poll_results precedent,
-- which likewise aggregates with the admin client and never re-gates on uid.

create function public.candidate_vote_tally(cand uuid)
returns table (approve int, reject int, total int)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(count(*) filter (where v.vote = 'approve'), 0)::int as approve,
    coalesce(count(*) filter (where v.vote = 'reject'), 0)::int  as reject,
    coalesce(count(*), 0)::int                                    as total
  from public.candidate_votes v
  where v.candidate_id = cand;
$$;

revoke all on function public.candidate_vote_tally(uuid) from public, anon;
grant execute on function public.candidate_vote_tally(uuid) to authenticated, service_role;

-- Aggregate interest counts (Garab count as social proof, "I can help" tally,
-- invest-intent tally) without enumerating who. candidate_id is required here —
-- fund-level (candidate_id null) invest intent is counted server-side, not via
-- this per-candidate function.
create function public.candidate_interest_counts(cand uuid)
returns table (help int, cosign int, invest int)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(count(*) filter (where i.type = 'help'), 0)::int   as help,
    coalesce(count(*) filter (where i.type = 'cosign'), 0)::int as cosign,
    coalesce(count(*) filter (where i.type = 'invest'), 0)::int as invest
  from public.interests i
  where i.candidate_id = cand;
$$;

revoke all on function public.candidate_interest_counts(uuid) from public, anon;
grant execute on function public.candidate_interest_counts(uuid) to authenticated, service_role;

-- ============================================================================
-- 3. RLS — CAPITAL TABLES (SELECT policies; writes revoked, service-role only)
-- ============================================================================

-- --- venture_candidates -----------------------------------------------------
-- Readable per the §17 visibility model. No client writes: the whole lifecycle
-- (create draft → edit → submit → review → decide), rubric aggregation and
-- vote-window management are API obligations (service role, after authz).
create policy venture_candidates_select_readable on venture_candidates
  for select to authenticated
  using (public.can_read_candidate(id));

revoke insert, update, delete on public.venture_candidates from anon, authenticated;

-- --- candidate_reviews ------------------------------------------------------
-- Reviewer notes + rubric scores are visible wherever the candidate is readable
-- (kept simple per spec: a Lab member / reader who can see the candidate sees
-- its reviews — decline/park reasons are meant to be visible, §17). Writes are
-- API-only: the upsert enforces can_review_candidate + recusal + aggregate
-- recomputation server-side.
create policy candidate_reviews_select_visible on candidate_reviews
  for select to authenticated
  using (public.can_read_candidate(candidate_id));

revoke insert, update, delete on public.candidate_reviews from anon, authenticated;

-- --- candidate_votes --------------------------------------------------------
-- Ballot privacy (§12/§17): a member reads ONLY their own vote (so the UI can
-- render "you voted approve" + the retract control). The aggregate tally comes
-- exclusively from candidate_vote_tally(). Writes API-only: the vote endpoint
-- enforces the vote_candidate capability + the open 7-day window.
create policy candidate_votes_select_own on candidate_votes
  for select to authenticated
  using (voter_user_id = (select auth.uid()));

revoke insert, update, delete on public.candidate_votes from anon, authenticated;

-- --- interests --------------------------------------------------------------
-- Own-row-only (a member sees only their own help/cosign/invest interests, and
-- their standing fund-level invest intent). Aggregate counts come from
-- candidate_interest_counts(). Writes API-only: help/cosign are open to all
-- regions, invest runs the Somalia region gate + compliance log first.
create policy interests_select_own on interests
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.interests from anon, authenticated;

-- --- capital_gate_evaluations ----------------------------------------------
-- Compliance log (Seq 6 / §17): a member reads only their own gate evaluations.
-- Append-only — inserts are service-role only (the gate decision is computed
-- server-side from geo header + profile country + attestation), and there is NO
-- update/delete grant for any client role (the record persists through
-- anonymisation).
create policy capital_gate_evaluations_select_own on capital_gate_evaluations
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.capital_gate_evaluations from anon, authenticated;

-- ============================================================================
-- 4. EXTEND comments — candidate-targeted open member comments (§12)
-- ============================================================================
-- Phase 2 (relaxed by Phase 4) reads comments through their parent POST. A
-- comment can also target a Candidate (comments.candidate_id — the FK + the
-- exactly-one-target CHECK are Phase 0). Extend the SELECT policy so a
-- published candidate comment is readable exactly when its Candidate is
-- readable. Writes stay API-only (Phase 2): the comment endpoint enforces
-- can_read_candidate on insert + the §26 rate limits + AI pre-scan.

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
    or (
      -- Candidate-targeted comment: readable when the Candidate is readable.
      status = 'published'
      and candidate_id is not null
      and public.can_read_candidate(candidate_id)
    )
  );

-- ============================================================================
-- 5. EXTEND page_blocks — candidate-owned blocks (§17)
-- ============================================================================
-- Phase 4.5 parked owner_type='candidate' as mod-only ("Candidate RLS ships in
-- Phase 5"). Now allow read when can_read_candidate(owner_id) AND the block's
-- own visibility admits the caller — mirroring the lab branch (candidate
-- visibility already distinguishes draft/reviewers_only/all_members). 'private'
-- blocks stay owner (creator) / mod only. (The candidate page_blocks UI is
-- still backlog — this is RLS groundwork only.)

drop policy if exists page_blocks_select_visible on page_blocks;
create policy page_blocks_select_visible on page_blocks
  for select to authenticated
  using (
    public.is_mod()
    or (
      owner_type = 'profile'
      and (
        owner_id = (select auth.uid())
        or visibility in ('public', 'members')
      )
    )
    or (
      owner_type = 'lab'
      and (
        (visibility in ('public', 'members') and public.can_read_lab(owner_id))
        or exists (
          select 1 from labs l
          where l.id = page_blocks.owner_id
            and l.lead_user_id = (select auth.uid())
        )
      )
    )
    or (
      owner_type = 'candidate'
      and public.can_read_candidate(owner_id)
      and (
        visibility in ('public', 'members')
        or exists (
          select 1 from venture_candidates c
          where c.id = page_blocks.owner_id
            and c.created_by_user_id = (select auth.uid())
        )
      )
    )
  );
