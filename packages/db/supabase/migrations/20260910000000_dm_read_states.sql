-- ============================================================================
-- DM read-state moves off the shared conversations row (A5a follow-up).
--
-- A5a (20260909000000) closed the column-value and updated_at-oracle leaks, but
-- one residual remained and was CONFIRMED OBSERVABLE on Dev on 2026-09-09: a
-- pure read-mark still UPDATEs the conversations row, and Supabase Realtime
-- emits a postgres_changes event for any row UPDATE the counterpart can see —
-- RLS gates on ROW visibility, not on which columns changed, and column-strip
-- only removes columns from the payload, it does not suppress the event. So the
-- counterpart's open subscription still received an UPDATE timed to "B just
-- read", inferrable even with the columns stripped and updated_at frozen.
-- (Positive control in the same session: the subscriber DID receive an ordinary
-- message-send conversations UPDATE, proving the observer was correctly
-- authenticated and the zero-for-read case would have been meaningful.)
--
-- Structural fix: read state lives in a per-user table that is NOT in the
-- realtime publication, so one participant's read-mark produces no event the
-- other can receive at all. The conversations.*_last_read_at columns become
-- dead (kept, per anonymise/no-destructive-migration discipline; already
-- client-revoked by A5a) and stop being written by the app.
--
-- D3 alignment: the (conversation_id, user_id) shape is exactly what a future
-- group-chat participant model reads for per-member read state — this GENERALISES
-- to N participants rather than coupling to the 1:1 columns. It intentionally
-- does NOT reference a participants table (none exists); it keys off
-- conversations(id) + users(id), so D3 can adopt it without a rewrite.
--
-- Rollback: fix-forward only. Reverting to the conversations columns re-arms
-- the realtime event leak; not a sanctioned rollback.
-- ============================================================================

create table public.dm_read_states (
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid not null references public.users (id),
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- One participant sees ONLY their own read-state row; the counterpart's row is
-- invisible under RLS (never mind unreadable columns — it's a different row).
alter table public.dm_read_states enable row level security;

create policy dm_read_states_select_own on public.dm_read_states
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes are API-only (service role), matching every other DM write. The /read
-- route upserts the caller's own row; no client insert/update/delete grant.
revoke all on public.dm_read_states from anon;
revoke insert, update, delete on public.dm_read_states from authenticated;

-- DELIBERATELY NOT added to the supabase_realtime publication: a read-mark must
-- emit no realtime event to anyone. (conversations/messages/notifications were
-- added explicitly in phase 3; membership is opt-in, so omitting it here is the
-- fix, not an oversight.)

-- Backfill existing read state from the now-dead columns so no unread count
-- resets at migration time.
insert into public.dm_read_states (conversation_id, user_id, last_read_at)
select c.id, c.initiator_user_id, c.initiator_last_read_at
  from public.conversations c where c.initiator_last_read_at is not null
union all
select c.id, c.recipient_user_id, c.recipient_last_read_at
  from public.conversations c where c.recipient_last_read_at is not null
on conflict (conversation_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- RPCs re-sourced onto dm_read_states. Both stay SECURITY DEFINER and read
-- ONLY auth.uid()'s own row, so unread arithmetic is unchanged and no
-- counterparty read time is ever projected. Bodies are otherwise identical to
-- 20260810003000 (silent-decline): the ONLY change is the read-state lookup.
-- ---------------------------------------------------------------------------

-- dm_unread_count: badge total (declined requests already excluded).
create or replace function public.dm_unread_count()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer
  from public.conversations c
  where (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
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

-- dm_inbox: list + per-row unread, most-recent-activity first.
drop function public.dm_inbox(integer, timestamptz, uuid);

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
  where (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
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
