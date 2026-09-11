-- ============================================================================
-- Client-API lifecycle gate: an account that is no longer a member in good
-- standing loses direct database access, including through a token it already
-- holds.
--
-- Why: PostgREST and Realtime validate the JWT locally and never ask GoTrue,
-- so the §19 auth shutdown (ban, 20260911000300) stops NEW tokens and
-- refreshes but not an access token issued before it (Dev: up to 3600 s). It
-- was measured on Dev (Addendum L): after deletion + ban such a token still
-- read other members' DMs (and received new ones over Realtime), private
-- Space content and the whole directory, and could publish a business
-- listing, rewrite a retained one, add support to another member's ask,
-- follow, claim and record consent. The same holds for a SUSPENDED or
-- DEACTIVATED account: the app refuses them (requireUser), but nothing at the
-- database did — and neither of those states is banned at GoTrue, so they
-- could also mint fresh tokens and use the API directly.
--
-- The rule mirrors requireUser(): the client API is for 'active' accounts
-- and for 'pending_deletion' (the cancellable §19 30-day grace keeps full
-- access). 'suspended', 'deactivated' and 'deleted' are refused.
--
-- Shape (additive; no existing policy is edited):
--   1. public.current_account_can_use_client_api() — STABLE SECURITY DEFINER,
--      pinned search_path, one primary-key lookup on public.users for
--      auth.uid(). SECURITY DEFINER so it never re-enters users' own RLS
--      (no recursion when used in a policy ON users) and cannot fail on a
--      caller's grants; it returns a boolean and raises nothing, so it
--      discloses nothing through errors. False for a signed-in identity with
--      no account row.
--   2. A RESTRICTIVE policy `client_lifecycle_gate` FOR ALL TO authenticated
--      on every table the signed-in role holds any privilege on (105 tables).
--      Restrictive policies are ANDed with the existing permissive ones, so
--      every current grant keeps its meaning for members in good standing and
--      is simply bounded by lifecycle. The call is wrapped as
--      `(select …)` so Postgres evaluates it once per statement (InitPlan),
--      not per row. Realtime postgres_changes evaluates these same policies
--      per subscriber, so the gate covers live delivery too.
--   3. `users` is the ONE table whose SELECT stays open: a blocked account can
--      still read its OWN row (users_select_own). That is how getAuthContext()
--      learns the status the explicit, server-mediated routes depend on —
--      appeal (suspended), reactivate (deactivated), cancel deletion, and the
--      sign-in routes' account-state messages. Those routes do their real
--      work through the service role. A deleted account's row is a neutral
--      tombstone. Writes to users (the three preference columns) ARE gated.
--   4. The RLS-bypassing RPCs that return member data get the same check:
--      dm_inbox, dm_unread_count (caller-scoped, so the helper alone), and
--      poll_results, candidate_vote_tally, candidate_interest_counts,
--      mentor_asks_answered, which server code also calls with the service
--      role (auth.uid() null) — for those the guard admits a null uid; anon
--      holds no EXECUTE on any of them, so that branch is server-only.
--      Bodies are otherwise byte-identical to their latest definitions.
--
-- Untouched by design: anon (signed-out) policies; the service role and
-- every server path (BYPASSRLS); the profile freeze trigger (a client token
-- now stops at the gate first; the trigger remains the invariant for the
-- writers the gate does not cover); GoTrue and the retained auth phone.
--
-- Contract-tested in packages/db/src/client-lifecycle-gate.test.ts: a new
-- table, view or SECURITY DEFINER function the signed-in role can reach fails
-- the suite until it is gated or exempted with a written reason.
--
-- Fix-forward only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The helper.
-- ---------------------------------------------------------------------------
create function public.current_account_can_use_client_api()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.users u
     where u.id = (select auth.uid())
       and u.status in ('active', 'pending_deletion')
  );
$$;

revoke all on function public.current_account_can_use_client_api() from public, anon;
grant execute on function public.current_account_can_use_client_api() to authenticated, service_role;

comment on function public.current_account_can_use_client_api() is
  'True when the calling account may use the client API: status active or pending_deletion (the §19 grace). False for suspended, deactivated, deleted, or a signed-in identity with no account row. Used by the restrictive client_lifecycle_gate policies and the member-data RPCs.';

-- ---------------------------------------------------------------------------
-- 2. The table gate.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'advisor_grants', 'api_keys', 'app_settings', 'appeals', 'audit_logs',
    'auth_email_tokens', 'award_cycles', 'award_results', 'award_votes',
    'badge_definitions', 'block_types', 'bookmarks', 'business_listings',
    'candidate_reviews', 'candidate_votes', 'capital_gate_evaluations', 'comments',
    'consent_records', 'conversations', 'digest_editions', 'digest_email_sends',
    'dm_read_states', 'email_suppressions', 'event_categories', 'event_rsvps',
    'events', 'follows', 'governance_log_entries', 'interests', 'invites',
    'lab_artifacts', 'lab_collaborations', 'lab_decisions', 'lab_events',
    'lab_members', 'lab_playbooks', 'lab_skill_needs', 'lab_tags', 'lab_updates',
    'labs', 'lanes', 'listing_categories', 'listing_claims', 'listing_photos',
    'listing_services', 'listing_tags', 'media_kinds', 'media_uploads',
    'membership_tiers', 'mentor_residencies', 'mentor_slots', 'messages',
    'mod_actions', 'moderation_reviews', 'mutes', 'notification_prefs',
    'notifications', 'open_to_kinds', 'page_blocks', 'poll_options', 'poll_votes',
    'post_cosigns', 'post_drafts', 'post_offers', 'post_revisions', 'post_tags',
    'posts', 'profile_link_meta', 'profile_module_kinds', 'profile_modules',
    'profile_open_to', 'profile_pinned_labs', 'profile_pins', 'profile_showcase',
    'profiles', 'push_subscriptions', 'reactions', 'report_snapshots', 'reports',
    'reputation_events', 'reputation_scores', 'seed_entities', 'seed_runs',
    'signup_grants', 'skill_endorsements', 'skills', 'tags', 'term_suggestions',
    'tier_capabilities', 'user_badges', 'user_blocks', 'user_settings',
    'venture_candidates', 'venture_capital_needs', 'venture_tasks',
    'venture_weight_schemes', 'venture_workstreams', 'verification_access_log',
    'verifications', 'verifier_grants', 'vouches', 'waitlist_entries',
    'webhook_endpoints', 'work_event_attestations', 'work_events'
  ]
  loop
    execute format(
      'create policy client_lifecycle_gate on public.%I as restrictive for all to authenticated '
      'using ((select public.current_account_can_use_client_api())) '
      'with check ((select public.current_account_can_use_client_api()))',
      t
    );
  end loop;
end
$$;

-- users: writes gated; own-row SELECT deliberately open (see header, point 3).
create policy client_lifecycle_gate_write on public.users
  as restrictive for update to authenticated
  using ((select public.current_account_can_use_client_api()))
  with check ((select public.current_account_can_use_client_api()));

-- ---------------------------------------------------------------------------
-- 3. The member-data RPCs.
-- ---------------------------------------------------------------------------

-- dm_unread_count: body of 20260910000000 + the gate.
create or replace function public.dm_unread_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  where (select public.current_account_can_use_client_api())
    and (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
    and c.status in ('pending', 'accepted')
    and not (
      c.recipient_user_id = auth.uid()
      and c.status = 'pending'
      and exists (
        select 1 from public.conversation_declines d where d.conversation_id = c.id
      )
    )
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_user_id <> auth.uid()
        and m.deleted_at is null
        and m.created_at > coalesce(
          (select r.last_read_at from public.dm_read_states r
             where r.conversation_id = c.id and r.user_id = auth.uid()),
          '-infinity'::timestamptz
        )
    );
$$;

revoke all on function public.dm_unread_count() from public, anon;
grant execute on function public.dm_unread_count() to authenticated, service_role;

-- dm_inbox: body of 20260910000000 + the gate.
create or replace function public.dm_inbox(
  p_limit integer default 20,
  p_before timestamptz default null,
  p_before_id uuid default null
)
returns table (
  conversation_id       uuid,
  other_user_id         uuid,
  status                public.conversation_status,
  is_initiator          boolean,
  last_message_body     text,
  last_message_at       timestamptz,
  last_message_sender   uuid,
  last_message_deleted  boolean,
  last_message_voice    boolean,
  unread_count          integer,
  created_at            timestamptz,
  updated_at            timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    c.id,
    case when c.initiator_user_id = auth.uid() then c.recipient_user_id else c.initiator_user_id end,
    c.status,
    (c.initiator_user_id = auth.uid()),
    lm.body,
    lm.created_at,
    lm.sender_user_id,
    (lm.deleted_at is not null),
    (lm.voice_upload_id is not null),
    coalesce(uc.n, 0),
    c.created_at,
    c.updated_at
  from public.conversations c
  left join lateral (
    select m.body, m.created_at, m.sender_user_id, m.deleted_at, m.voice_upload_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*)::integer as n
    from public.messages m
    where m.conversation_id = c.id
      and m.sender_user_id <> auth.uid()
      and m.deleted_at is null
      and m.created_at > coalesce(
        (select r.last_read_at from public.dm_read_states r
           where r.conversation_id = c.id and r.user_id = auth.uid()),
        '-infinity'::timestamptz
      )
  ) uc on true
  where (select public.current_account_can_use_client_api())
    and (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
    and c.status <> 'blocked'
    and not (
      c.recipient_user_id = auth.uid()
      and c.status = 'pending'
      and exists (
        select 1 from public.conversation_declines d where d.conversation_id = c.id
      )
    )
    and (
      p_before is null
      or c.updated_at < p_before
      or (c.updated_at = p_before and c.id < p_before_id)
    )
  order by c.updated_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.dm_inbox(integer, timestamptz, uuid) from public, anon;
grant execute on function public.dm_inbox(integer, timestamptz, uuid) to authenticated, service_role;

-- poll_results: body of 20260706000000 + the gate (null uid = server caller).
create or replace function public.poll_results(p_post_id uuid)
returns table (poll_option_id uuid, votes bigint)
language sql stable security definer set search_path = ''
as $$
  select po.id, count(pv.id)::bigint
  from public.poll_options po
  left join public.poll_votes pv on pv.poll_option_id = po.id
  where po.post_id = p_post_id
    and ((select auth.uid()) is null or (select public.current_account_can_use_client_api()))
    and exists (
      select 1 from public.posts p
      where p.id = p_post_id
        and (
          (p.status = 'published' and p.lab_id is null)
          or p.author_user_id = auth.uid()
          or public.is_mod()
        )
    )
  group by po.id, po.position
  order by po.position;
$$;

revoke all on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated, service_role;

-- candidate_vote_tally: body of 20260707000000 + the gate. A refused caller
-- gets the all-zero row, never another member's votes.
create or replace function public.candidate_vote_tally(cand uuid)
returns table (approve int, reject int, total int)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(count(*) filter (where v.vote = 'approve'), 0)::int as approve,
    coalesce(count(*) filter (where v.vote = 'reject'), 0)::int  as reject,
    coalesce(count(*), 0)::int                                    as total
  from public.candidate_votes v
  where v.candidate_id = cand
    and ((select auth.uid()) is null or (select public.current_account_can_use_client_api()));
$$;

revoke all on function public.candidate_vote_tally(uuid) from public, anon;
grant execute on function public.candidate_vote_tally(uuid) to authenticated, service_role;

-- candidate_interest_counts: body of 20260707000000 + the gate. (Its separate,
-- pending question — whether active members should read counts for every
-- candidate — is NOT decided here; members in good standing see no change.)
create or replace function public.candidate_interest_counts(cand uuid)
returns table (help int, cosign int, invest int)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(count(*) filter (where i.type = 'help'), 0)::int   as help,
    coalesce(count(*) filter (where i.type = 'cosign'), 0)::int as cosign,
    coalesce(count(*) filter (where i.type = 'invest'), 0)::int as invest
  from public.interests i
  where i.candidate_id = cand
    and ((select auth.uid()) is null or (select public.current_account_can_use_client_api()));
$$;

revoke all on function public.candidate_interest_counts(uuid) from public, anon;
grant execute on function public.candidate_interest_counts(uuid) to authenticated, service_role;

-- mentor_asks_answered: body of 20260709000000 + the gate.
create or replace function public.mentor_asks_answered(p_user_id uuid, p_since timestamptz)
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.comments c
  where c.author_user_id = p_user_id
    and c.is_credited_answer = true
    and c.created_at >= p_since
    and ((select auth.uid()) is null or (select public.current_account_can_use_client_api()));
$$;

revoke all on function public.mentor_asks_answered(uuid, timestamptz) from public, anon;
grant execute on function public.mentor_asks_answered(uuid, timestamptz) to authenticated, service_role;
