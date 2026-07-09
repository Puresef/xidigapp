-- ============================================================================
-- Phase 7 — Reputation engine · milestone-badge awarding · Community Awards ·
-- Mentor-in-Residence (§6, §14, §20, §23).
-- ============================================================================
-- ADDITIVE ONLY. The Phase-0 schema already ships the DATA MODEL for all of
-- this — badge_definitions (all 5 milestone slugs seeded), user_badges,
-- reputation_events (append-only ledger), reputation_scores (materialized),
-- award_votes, award_category — and Founding Member already auto-awards on
-- signup (phase1_auth handle_auth_user_created). What was deferred to Phase 7,
-- and is ACTIVATED here, is the *logic* layer:
--
--   1. reputation engine — award_reputation() enforces the §14 anti-gaming
--      rules (30 pt/day/class cap · no self-interaction · no AI-account Helper
--      score · idempotent per-entity credit) and materialises the score;
--      recompute_reputation_scores() re-derives scores from the ledger with the
--      §12/§14 90-day decay (the job path). Scores become auditable + idempotent.
--   2. reputation RLS — reputation_scores becomes member-readable (profile /
--      leaderboard surfaces); reputation_events stays own-rows + mod only.
--      reputation_events gains an append-only (no-UPDATE) guard.
--   3. award_badge() — one idempotent SECURITY DEFINER primitive (slug -> id,
--      insert, ON CONFLICT DO NOTHING, returns "newly awarded") that the app's
--      badge service (which also emits the §23 badge_awarded analytics event)
--      and any SQL caller share. Founding Member's existing awarder is untouched.
--   4. Community Awards — award_cycles (the quarterly voting window + the link
--      to the Plaza results post) + award_cycle_is_open() + award_votes RLS
--      (select-own; writes service-role-only, one-per-category enforced by the
--      Phase-0 unique constraint, cast inside an open cycle enforced by a
--      DB trigger for defense-in-depth) + award_vote_tally() (winner resolution).
--   5. Mentor-in-Residence — advisor_grants + is_advisor() (a least-privilege
--      capability BESIDE mod/admin, exactly like verifier_grants), and
--      mentor_residencies (the rotating slot). The mentor badge is awarded by
--      the app appoint-route via award_badge() so the analytics event fires.
--
-- Nothing here weakens an earlier phase. No AI is involved (reputation is a
-- pure score+ledger; analytics/PostHog stays the separate consent-gated path).
-- Scoring runs at the app/job layer per the Phase-0 comment — there is NO
-- pg_cron dependency (this repo schedules via Vercel cron routes, vercel.json).
--
-- Point weights (mirrored in apps/web/src/lib/reputation/constants.ts — keep in
-- sync): post_created 5 · comment_created 2 · lab_update_published 5  (all
-- CONTRIBUTION); ask_credited 10 (HELPER). Daily cap 30 pt per class per UTC
-- day. Decay window 90 days. These live as app constants passed INTO
-- award_reputation (the function is weight-agnostic) so tuning never needs a
-- migration.

-- ============================================================================
-- 1. REPUTATION LEDGER — score_class + idempotency + append-only guard
-- ============================================================================
-- reputation_events is the append-only ledger scores are derived from. Add a
-- score_class discriminator so the daily cap and the decay recompute can
-- aggregate per class without re-deriving the class from event_type every time.
-- Backfill the only pre-existing writer (ask_credited helper credit) to 'helper'.
alter table reputation_events
  add column score_class text
    check (score_class is null or score_class in ('contribution', 'helper'));

update reputation_events set score_class = 'helper'
  where event_type = 'ask_credited' and score_class is null;

-- Idempotency: an event tied to a concrete entity credits AT MOST ONCE
-- (§CP2 "no duplicate credit"). Entity-less events (rare) are not deduped.
-- award_reputation double-checks this before insert; the index makes it a hard
-- guarantee under concurrency (a lost race surfaces as 23505 -> 0 points).
create unique index reputation_events_credit_uq
  on reputation_events (user_id, event_type, entity_id)
  where entity_id is not null;

-- Append-only: a past ledger row is never edited (that would silently rewrite a
-- score). DELETE is intentionally NOT forbidden — reputation_events.user_id is
-- ON DELETE CASCADE, so a member anonymisation/removal must be able to cascade.
-- Mirror report_snapshots' no-UPDATE guard (phase6), not the full immutability
-- of audit_logs. forbid_mutation() already exists (phase6_moderation).
create trigger reputation_events_no_update
  before update on reputation_events
  for each row execute function public.forbid_mutation();

-- Writes are service-role-only (the engine functions below run as definer /
-- the app writes via the service role). Revoke the Supabase default grants.
revoke insert, update, delete on public.reputation_events from anon, authenticated;
revoke insert, update, delete on public.reputation_scores from anon, authenticated;

-- ============================================================================
-- 2. REPUTATION ENGINE — award_reputation() + recompute_reputation_scores()
-- ============================================================================
-- award_reputation() is the ONE credit path. It is SECURITY DEFINER and granted
-- to service_role ONLY (never authenticated) — a member must not be able to
-- grant themselves points via a direct RPC. The app calls it after the source
-- write commits (post/comment/lab-update created, Ask answer credited).
--
-- Anti-gaming, all enforced here so no call site can forget them:
--   * no self-interaction — the CALLER passes the earner; the Ask-credit route
--     already refuses self-credit (helper != asker). Authorship events credit
--     the author by definition (that is contribution, not gaming) so there is
--     no "other party" to compare; the guard that matters for gaming is the cap.
--   * no AI-account Helper score — is_ai accounts never accrue 'helper' (§14 /
--     locked AI-account rule). They MAY accrue contribution (their posts are
--     labelled AI content, not help credit).
--   * 30 pt/day/class cap — points beyond the remaining daily allowance are
--     clamped to 0; the ledger row is still written (claims the idempotency
--     slot + audits the capped attempt) so the same entity can't retry for more.
--   * idempotent — an entity that already credited this event_type adds nothing.
-- Returns the points actually awarded (post-cap), for the caller's UI/badges.
create function public.award_reputation(
  p_user_id     uuid,
  p_event_type  text,
  p_score_class text,
  p_points      integer,
  p_entity_type public.entity_type,
  p_entity_id   uuid
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_ai        boolean;
  v_today_points integer;
  v_remaining    integer;
  v_effective    integer;
begin
  if p_score_class not in ('contribution', 'helper') then
    raise exception 'award_reputation: invalid score_class %', p_score_class
      using errcode = 'check_violation';
  end if;
  if p_points is null or p_points <= 0 then
    return 0;
  end if;

  select u.is_ai into v_is_ai from public.users u where u.id = p_user_id;
  if v_is_ai is null then
    return 0; -- unknown / deleted user
  end if;
  if v_is_ai and p_score_class = 'helper' then
    return 0; -- §14: AI accounts never earn Helper score
  end if;

  -- Idempotency fast-path: this entity already credited this event_type.
  if p_entity_id is not null and exists (
    select 1 from public.reputation_events e
    where e.user_id = p_user_id
      and e.event_type = p_event_type
      and e.entity_id = p_entity_id
  ) then
    return 0;
  end if;

  -- Daily cap: how much of the 30-pt/class allowance is left for the UTC day.
  select coalesce(sum(e.points), 0) into v_today_points
  from public.reputation_events e
  where e.user_id = p_user_id
    and e.score_class = p_score_class
    and e.created_at >= date_trunc('day', now());
  v_remaining := greatest(0, 30 - v_today_points);
  v_effective := least(p_points, v_remaining);

  -- Write the ledger row (even at 0 effective points — it audits the capped
  -- attempt and claims the idempotency slot). A concurrent duplicate loses the
  -- unique-index race; treat that as "already credited" -> 0.
  begin
    insert into public.reputation_events
      (user_id, event_type, score_class, points, entity_type, entity_id)
    values
      (p_user_id, p_event_type, p_score_class, v_effective, p_entity_type, p_entity_id);
  exception when unique_violation then
    return 0;
  end;

  if v_effective > 0 then
    insert into public.reputation_scores as s
      (user_id, contribution_score, helper_score, last_active_on, updated_at)
    values (
      p_user_id,
      case when p_score_class = 'contribution' then v_effective else 0 end,
      case when p_score_class = 'helper'       then v_effective else 0 end,
      current_date,
      now()
    )
    on conflict (user_id) do update set
      contribution_score = s.contribution_score
        + case when p_score_class = 'contribution' then v_effective else 0 end,
      helper_score = s.helper_score
        + case when p_score_class = 'helper' then v_effective else 0 end,
      last_active_on = current_date,
      updated_at = now();
  end if;

  return v_effective;
end;
$$;

-- The decay authority (the "recomputed by jobs" path, §14). Re-derives each
-- score as the SUM of ledger points in the trailing 90 days — so points age out
-- and any drift from the incremental path self-heals. p_user_id null = everyone
-- (a nightly Vercel cron); a uuid = one member (on-demand). Idempotent.
create function public.recompute_reputation_scores(p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Recompute everyone who has an in-window event.
  insert into public.reputation_scores as s
    (user_id, contribution_score, helper_score, updated_at)
  select
    e.user_id,
    coalesce(sum(e.points) filter (where e.score_class = 'contribution'), 0),
    coalesce(sum(e.points) filter (where e.score_class = 'helper'), 0),
    now()
  from public.reputation_events e
  where e.created_at >= now() - interval '90 days'
    and (p_user_id is null or e.user_id = p_user_id)
  group by e.user_id
  on conflict (user_id) do update set
    contribution_score = excluded.contribution_score,
    helper_score = excluded.helper_score,
    updated_at = now();

  -- Members whose events have ALL decayed out of the window keep a stale score
  -- row; zero them so decay actually bites.
  update public.reputation_scores s
  set contribution_score = 0, helper_score = 0, updated_at = now()
  where (p_user_id is null or s.user_id = p_user_id)
    and (s.contribution_score <> 0 or s.helper_score <> 0)
    and not exists (
      select 1 from public.reputation_events e
      where e.user_id = s.user_id
        and e.created_at >= now() - interval '90 days'
    );
end;
$$;

revoke all on function public.award_reputation(uuid, text, text, integer, public.entity_type, uuid)
  from public, anon, authenticated;
grant execute on function public.award_reputation(uuid, text, text, integer, public.entity_type, uuid)
  to service_role;
revoke all on function public.recompute_reputation_scores(uuid) from public, anon, authenticated;
grant execute on function public.recompute_reputation_scores(uuid) to service_role;

-- ============================================================================
-- 3. REPUTATION RLS — open the reads Phase 7 UI needs
-- ============================================================================
-- reputation_scores: aggregate, non-sensitive (contribution/helper totals shown
-- on profiles + a Top Helper leaderboard) — readable by every authenticated
-- member. Writes stay service-role-only (revoked above).
create policy reputation_scores_select_all on reputation_scores
  for select to authenticated
  using (true);

-- reputation_events: the per-event point breakdown is the member's own business
-- (and mods', for abuse review). Own rows + mod, never other members'.
create policy reputation_events_select_own on reputation_events
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_mod());

-- ============================================================================
-- 4. BADGE AWARDING — one idempotent primitive
-- ============================================================================
-- Resolve slug -> id, insert, swallow the duplicate. Returns TRUE only when a
-- NEW badge was granted (so the app emits badge_awarded exactly once). Shared by
-- the app badge service (via rpc) and any SQL caller. Milestone badges are all
-- pre-seeded in badge_definitions; a bad slug returns false, never throws.
create function public.award_badge(
  p_user_id uuid,
  p_slug    text,
  p_context text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_badge_id uuid;
begin
  select bd.id into v_badge_id
  from public.badge_definitions bd
  where bd.slug = p_slug and bd.is_active;
  if v_badge_id is null then
    return false;
  end if;

  insert into public.user_badges (user_id, badge_id, context)
  values (p_user_id, v_badge_id, p_context)
  on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.award_badge(uuid, text, text) from public, anon, authenticated;
grant execute on function public.award_badge(uuid, text, text) to service_role;

-- ============================================================================
-- 5. COMMUNITY AWARDS (§20) — quarterly voting window + tally
-- ============================================================================
-- award_votes (Phase-0) is quarterly member voting: best_lab / best_win /
-- most_helpful / rising_builder, one vote per (quarter, category, voter). It was
-- inert (RLS on, no policy). Open it: members read their OWN ballots; writes are
-- service-role-only (the API validates the open cycle + active account, inserts,
-- and maps 23505 -> already_voted). award_cycles defines WHEN a quarter is open
-- and links the Plaza results post.
create table award_cycles (
  quarter          text primary key,
  opens_at         timestamptz not null,
  closes_at        timestamptz not null,
  results_post_id  uuid references posts (id) on delete set null,
  published_at     timestamptz,  -- when winners were posted to Plaza
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint award_cycles_quarter_format check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  constraint award_cycles_window check (closes_at > opens_at)
);

-- Added after the base schema's global updated_at loop, so wire the trigger.
create trigger award_cycles_set_updated_at
  before update on award_cycles
  for each row execute function public.set_updated_at();

alter table award_cycles enable row level security;

-- Everyone sees the cycle (to know voting is open + to read published results).
create policy award_cycles_select_all on award_cycles
  for select to authenticated
  using (true);

revoke insert, update, delete on public.award_cycles from anon, authenticated;

-- Is this quarter open for voting right now? Used by the API and the award_votes
-- write trigger. STABLE (reads now()). Callable by authenticated (read gate).
create function public.award_cycle_is_open(p_quarter text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.award_cycles c
    where c.quarter = p_quarter
      and now() >= c.opens_at
      and now() < c.closes_at
  );
$$;

revoke all on function public.award_cycle_is_open(text) from public, anon;
grant execute on function public.award_cycle_is_open(text) to authenticated, service_role;

-- award_votes reads: own ballots only (a live tally is admin-only to avoid
-- bandwagoning during an open cycle — results are published to Plaza after).
create policy award_votes_select_own on award_votes
  for select to authenticated
  using (voter_user_id = (select auth.uid()));

revoke insert, update, delete on public.award_votes from anon, authenticated;

-- Defense-in-depth: even a service-role bug cannot record a vote outside an open
-- cycle (mirrors the appeals_reviewer_not_appellant CHECK posture).
create function public.award_votes_guard_open_cycle()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.award_cycle_is_open(new.quarter) then
    raise exception 'award vote rejected: cycle % is not open', new.quarter
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger award_votes_require_open_cycle
  before insert on award_votes
  for each row execute function public.award_votes_guard_open_cycle();

-- Winner resolution: vote counts per (category, target) for a quarter, ranked.
-- The GRANT is the authorization boundary: execute is revoked from anon +
-- authenticated and given only to service_role, so a live tally can never leak
-- mid-cycle to a member (award_votes SELECT is own-ballot-only). It deliberately
-- carries NO internal auth.uid()-based guard: under the service-role admin
-- client (the ONLY permitted caller) auth.uid() is NULL, so an `is_admin()`
-- predicate would be false for every row and permanently zero the tally — the
-- exact trap the candidate_vote_tally() header (phase5) warns against. The app
-- pre-gates to admins before calling this as the service role.
create function public.award_vote_tally(p_quarter text)
returns table (
  category    public.award_category,
  target_type public.entity_type,
  target_id   uuid,
  votes       bigint
)
language sql stable security definer set search_path = ''
as $$
  select v.category, v.target_type, v.target_id, count(*) as votes
  from public.award_votes v
  where v.quarter = p_quarter
  group by v.category, v.target_type, v.target_id
  order by v.category, votes desc;
$$;

revoke all on function public.award_vote_tally(text) from public, anon, authenticated;
grant execute on function public.award_vote_tally(text) to service_role;

-- ============================================================================
-- 6. MENTOR-IN-RESIDENCE (§20) — advisor capability + rotating slot
-- ============================================================================
-- A rotating VERIFIED Advisor who commits to answering Asks weekly, badged +
-- featured. Model the "verified Advisor" as a least-privilege capability BESIDE
-- mod/admin (grant table + is_advisor() helper), exactly like verifier_grants —
-- NOT a new user_role enum value. mentor_residencies is the rotating slot; the
-- mentor badge is awarded by the app appoint-route (so badge_awarded analytics
-- fires) via award_badge('mentor-in-residence', <period>).
create table advisor_grants (
  user_id             uuid primary key references users (id) on delete cascade,
  granted_by_user_id  uuid references users (id) on delete set null,
  note                text,
  granted_at          timestamptz not null default now(),
  revoked_at          timestamptz  -- soft-revoke keeps the audit trail
);

alter table advisor_grants enable row level security;

-- The roster is admin-visible only; writes API-only (service role).
create policy advisor_grants_select_admin on advisor_grants
  for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.advisor_grants from anon, authenticated;

create function public.is_advisor()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.advisor_grants g
      join public.users u on u.id = g.user_id
      where g.user_id = auth.uid()
        and g.revoked_at is null
        and u.status = 'active'
    );
$$;

revoke all on function public.is_advisor() from public, anon;
grant execute on function public.is_advisor() to authenticated, service_role;

-- The rotating slot. period is a human token (a quarter '2026-Q3' or ISO week
-- '2026-W28'); starts_on/ends_on drive "who is the current mentor". focus is the
-- domain they cover. One residency per period.
create table mentor_residencies (
  id                  uuid primary key default gen_random_uuid(),
  advisor_user_id     uuid not null references users (id) on delete cascade,
  period              text not null unique,
  focus               text,             -- domain / lane token (display)
  starts_on           date not null,
  ends_on             date not null,
  created_by_user_id  uuid references users (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint mentor_residencies_window check (ends_on >= starts_on)
);

create index mentor_residencies_current_idx on mentor_residencies (starts_on, ends_on);

alter table mentor_residencies enable row level security;

-- Public: every member can see who the mentor is (the featured slot / digest).
create policy mentor_residencies_select_all on mentor_residencies
  for select to authenticated
  using (true);

revoke insert, update, delete on public.mentor_residencies from anon, authenticated;

-- Weekly-commitment tracking (§20 "5 Asks/week") — display only, never a gate.
-- Counts the mentor's CREDITED Ask answers since a cutoff (the help that
-- actually landed). Uses is_credited_answer on their comments.
create function public.mentor_asks_answered(p_user_id uuid, p_since timestamptz)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.comments c
  where c.author_user_id = p_user_id
    and c.is_credited_answer = true
    and c.created_at >= p_since;
$$;

revoke all on function public.mentor_asks_answered(uuid, timestamptz) from public, anon;
grant execute on function public.mentor_asks_answered(uuid, timestamptz) to authenticated, service_role;
