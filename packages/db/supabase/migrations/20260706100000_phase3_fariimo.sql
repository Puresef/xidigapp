-- ============================================================================
-- Xidig v1.0 — Phase 3: Fariimo (DMs + Notifications) — RLS, realtime, helpers
-- ============================================================================
-- Phase 0 already shipped every Phase 3 table fully locked (RLS enabled by the
-- Phase 1 loop, no policies): conversations, messages, notifications,
-- push_subscriptions, user_blocks. Phase 2 opened notifications for reads
-- (notifications_select_own) and started writing rows. This migration:
--
--   1. opens conversations / messages / push_subscriptions / user_blocks /
--      reports to the API surface, following the Phase 1/2 conventions
--      (authenticated-only SELECT policies, (select auth.uid()), all
--      side-effectful writes stay API-only via the service role);
--   2. bumps conversations.updated_at when a message arrives (drives inbox
--      ordering by last activity) via a trigger;
--   3. ships dm_unread_count() — an efficient, own-only unread badge count
--      (SECURITY DEFINER, same style as poll_results());
--   4. registers messages / notifications / conversations with the Supabase
--      Realtime publication so DM delivery + badges stream over Postgres
--      changes (§13 realtime note: NO polling) — filtered per-subscriber by
--      the SELECT policies below.
--
-- Privacy stance (deliberate, stronger than Plaza): DMs are 1:1 private.
-- Unlike posts/comments, mods do NOT get a blanket read policy on
-- conversations or messages — reading a private thread requires a report
-- context, which is Phase 6. So conversations/messages SELECT is
-- participant-only, full stop. This is what the Phase 3 "private DM isolation"
-- acceptance criterion proves.
--
-- Write-model note (same reasoning as Plaza posts): conversations, messages,
-- push_subscriptions and user_blocks get NO client insert/update/delete
-- policies. Every write has API-side obligations the database cannot express —
-- the request-to-chat accept gate (§13), block enforcement (both directions),
-- DM-request + send abuse throttles (§26), and the §26 notification /
-- email / push side effects. A direct PostgREST insert would bypass all of
-- them, so the API (service role, after explicit authz) is the only writer.
-- ============================================================================

-- ============================================================================
-- 1. INBOX ORDERING — bump conversations.updated_at on new message
-- ============================================================================
-- The inbox lists a member's conversations most-recent-activity first. Rather
-- than denormalize a last_message_id (the Phase 0 notes deliberately kept
-- conversations free of it to avoid a circular FK), a trigger touches
-- updated_at so ordering is a plain index scan. Runs as the table owner, so it
-- is unaffected by the API-only write model (service-role message inserts
-- still fire it).

create function public.touch_conversation_on_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Inbox list ordering (both roles): most recent activity first.
create index conversations_updated_idx on conversations (updated_at desc);

-- ============================================================================
-- 2. UNREAD BADGE — dm_unread_count()
-- ============================================================================
-- Number of conversations with unread inbound activity for the caller, across
-- BOTH accepted threads (new messages) and pending requests where the caller
-- is the recipient (the request-preview message counts as unread). Powers the
-- Messages nav badge in one round trip instead of N+1.
--
-- SECURITY DEFINER + empty search_path (schema-qualify everything) + no uid
-- parameter — auth.uid() resolves internally so a caller can never probe
-- another member's unread state. STABLE: read-only, safe to cache per stmt.

create function public.dm_unread_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  where c.status in ('pending', 'accepted')
    and (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_user_id <> auth.uid()
        and m.deleted_at is null
        and m.created_at > coalesce(
          case
            when c.initiator_user_id = auth.uid() then c.initiator_last_read_at
            else c.recipient_last_read_at
          end,
          '-infinity'::timestamptz
        )
    );
$$;

-- Supabase default privileges grant EXECUTE to anon too — revoke explicitly.
revoke all on function public.dm_unread_count() from public, anon;
grant execute on function public.dm_unread_count() to authenticated, service_role;

-- --- dm_inbox() -------------------------------------------------------------
-- The conversation-list read path in one round trip: for each of the caller's
-- conversations, the other participant, the last message preview, the per-
-- conversation unread count, and the status. Ordered by last activity
-- (updated_at) with a keyset cursor (p_before) for pagination. Blocked threads
-- are hidden. Same security posture as dm_unread_count/poll_results: SECURITY
-- DEFINER, empty search_path, no uid parameter (auth.uid() resolves
-- internally). The API hydrates the other participant's profile separately.

create function public.dm_inbox(
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
    coalesce(uc.n, 0),
    c.created_at,
    c.updated_at
  from public.conversations c
  left join lateral (
    select m.body, m.created_at, m.sender_user_id, m.deleted_at
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
        case when c.initiator_user_id = auth.uid() then c.initiator_last_read_at
             else c.recipient_last_read_at end,
        '-infinity'::timestamptz
      )
  ) uc on true
  where (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
    and c.status <> 'blocked'
    -- Keyset with an id tiebreaker: two conversations sharing an updated_at
    -- (two message sends in the same tick) must not straddle a page boundary
    -- and drop one silently. Strict (updated_at, id) < (p_before, p_before_id).
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

-- ============================================================================
-- 3. RLS — DIRECT MESSAGES
-- ============================================================================

-- --- conversations ----------------------------------------------------------
-- A member reads a conversation ONLY if they are one of its two participants.
-- No mod branch (see privacy stance above). Writes are API-only: creating a
-- request, accept/decline, block-status transitions and last_read bumps all
-- carry throttle/notification/block obligations.

create policy conversations_select_participant on conversations
  for select to authenticated
  using (
    initiator_user_id = (select auth.uid())
    or recipient_user_id = (select auth.uid())
  );

revoke insert, update, delete on public.conversations from anon, authenticated;

-- --- messages ---------------------------------------------------------------
-- Visible only to the two participants of the parent conversation. The EXISTS
-- re-uses conversations' own RLS (a non-participant can't see the conversation
-- row, so the subquery finds nothing) — same "visibility follows the parent"
-- pattern as Plaza comments. Soft-deleted messages (moderation removal, §19)
-- still return to participants; the UI renders a removed-message tombstone.

create policy messages_select_participant on messages
  for select to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (
          c.initiator_user_id = (select auth.uid())
          or c.recipient_user_id = (select auth.uid())
        )
    )
  );

revoke insert, update, delete on public.messages from anon, authenticated;

-- ============================================================================
-- 4. RLS — BLOCKS, PUSH, REPORTS
-- ============================================================================

-- --- user_blocks ------------------------------------------------------------
-- A member sees only the blocks THEY created (the Settings "blocked members"
-- list). They deliberately cannot see who has blocked THEM — exposing that
-- would let a blocker be probed. Blocking has a side effect (halting any live
-- conversation → status 'blocked'), so it is API-only.

create policy user_blocks_select_own on user_blocks
  for select to authenticated
  using (blocker_user_id = (select auth.uid()));

revoke insert, update, delete on public.user_blocks from anon, authenticated;

-- --- push_subscriptions -----------------------------------------------------
-- Private to the owning user (their own device push endpoints + keys). The
-- server-side push SEND path uses the service role (bypasses RLS) — that is
-- the "admin service path" in the Phase 3 brief. Writes are API-only:
-- registration upserts on the unique endpoint and revocation flip revoked_at.

create policy push_subscriptions_select_own on push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

-- --- reports ----------------------------------------------------------------
-- Phase 3 ships the DM report ENTRY POINT (§13 block + report inside DMs), not
-- the Phase 6 mod queue. A reporter can read the status of reports they filed
-- (visible-outcome promise, §19); the mod-facing queue policy ships with
-- Phase 6. Submission is API-only (service role) so it can attach an audit row
-- and the §27 "thanks for the report" notice.

create policy reports_select_own on reports
  for select to authenticated
  using (reporter_user_id = (select auth.uid()));

revoke insert, update, delete on public.reports from anon, authenticated;

-- notifications: already opened in Phase 2 (notifications_select_own; writes
-- revoked → service-role only). Phase 3 adds no policy — it only starts
-- WRITING the DM/mention/accepted rows and marking read_at (both service role
-- via the notifications API), and streams the table over Realtime below.

-- ============================================================================
-- 5. SUPABASE REALTIME — Postgres changes streaming (§13: no polling)
-- ============================================================================
-- Register the DM + notification tables with the supabase_realtime
-- publication. Realtime authorizes each subscriber against the table's SELECT
-- policy, so a client subscribed to `messages` with a
-- `conversation_id=eq.<id>` filter receives an INSERT only if the participant
-- SELECT policy above lets them read that row — non-participants get nothing,
-- even mid-stream.
--
-- Guarded so it is idempotent and safe in the migration harness (which has no
-- Supabase-provisioned publication): create the publication if absent, then
-- add each table only if not already a member.
--
-- REPLICA IDENTITY FULL on messages/conversations: Realtime evaluates the RLS
-- SELECT policy against the row image it receives for UPDATE/DELETE events too
-- (read-receipt updates, moderation soft-delete). FULL guarantees the
-- participant columns are present in that image so the policy resolves
-- correctly, not just the primary key.

alter table public.messages replica identity full;
alter table public.conversations replica identity full;
-- notifications too: read_at UPDATE events must re-evaluate the own-row SELECT
-- policy so cross-tab/device mark-read syncs the inbox + badges.
alter table public.notifications replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
