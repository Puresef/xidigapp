-- ============================================================================
-- Silent decline, hardened to the WIRE (10 Aug ruling on the adversarial
-- review: "decline must be undetectable from the initiator's side at every
-- layer — UI, API, Realtime, error shapes, timing").
--
-- The root problem: conversations is in the supabase_realtime publication
-- and its SELECT policy shows both participants the row, so flipping
-- status='declined' BROADCAST the decline to the initiator's browser no
-- matter what the application masked. Any status-based design leaks.
--
-- The fix: the decline is no longer a status. The shared conversations row
-- simply STAYS 'pending'; the decline lives in conversation_declines — a
-- table with ZERO client grants, no policies, and no realtime publication
-- membership. The initiator-observable universe (row data, update events,
-- error codes, re-request behaviour, sweep timing) is now IDENTICAL for
-- declined and unanswered, by construction rather than by masking.
-- dm_inbox / dm_unread_count (SECURITY DEFINER) consult the table to drop
-- declined requests from the RECIPIENT's inbox and badge only.
--
-- Also here (ruling 4, 10 Aug): conversations.accepted_at — set on accept,
-- rendered as the honest "Waxaad aqbashay codsiga salaanta · {time}"
-- divider. Null for legacy accepts (no honest time exists to show).
-- ============================================================================

-- 1) The recipient-side decline record. API-only in the strictest sense:
--    no client can even SELECT it (the recipient's own inbox filtering
--    happens inside the SECURITY DEFINER functions below).
create table conversation_declines (
  conversation_id  uuid primary key references conversations (id) on delete cascade,
  declined_at      timestamptz not null default now()
);

alter table conversation_declines enable row level security;
revoke all on conversation_declines from anon, authenticated;

-- 2) Ruling 4: the acceptance moment, for the divider.
alter table conversations add column accepted_at timestamptz;

-- 3) Backfill: existing declined rows convert to the new model. Flipping
--    them back to 'pending' fires one realtime UPDATE per row — benign
--    (pending is exactly what their initiators have always been shown).
--    The enum value 'declined' stays (enum values are immovable) but no
--    code path writes it after this migration.
insert into conversation_declines (conversation_id, declined_at)
select id, updated_at from conversations where status = 'declined'
on conflict (conversation_id) do nothing;

update conversations set status = 'pending' where status = 'declined';

-- 4) dm_inbox: drop recipient-declined requests from the RECIPIENT's list
--    (the initiator keeps seeing the pending row — which is the point).
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
        case when c.initiator_user_id = auth.uid() then c.initiator_last_read_at
             else c.recipient_last_read_at end,
        '-infinity'::timestamptz
      )
  ) uc on true
  where (c.initiator_user_id = auth.uid() or c.recipient_user_id = auth.uid())
    and c.status <> 'blocked'
    -- Recipient-declined requests vanish from the RECIPIENT's inbox only.
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

-- 5) dm_unread_count: a declined request must stop counting toward the
--    recipient's badge (it counted while pending; the decline settles it).
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
          case when c.initiator_user_id = auth.uid() then c.initiator_last_read_at
               else c.recipient_last_read_at end,
          '-infinity'::timestamptz
        )
    );
$$;

revoke all on function public.dm_unread_count() from public, anon;
grant execute on function public.dm_unread_count() to authenticated, service_role;
