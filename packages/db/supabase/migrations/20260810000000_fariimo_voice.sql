-- ============================================================================
-- Fariimo voice notes (F2 §4 dispatch, 10 Aug 2026)
--
-- Voice = MediaSlot upload kind 'voice': self-recorded in the composer,
-- duration shown, no auto-transcription (P1). DM audio is PRIVATE content:
-- the dm-media bucket is non-public and carries NO storage policies — every
-- byte is served through the participant-checked API route via short-lived
-- signed URLs (service role). Clients can never list or fetch the bucket
-- directly.
--
-- RLS: conversations/messages policies are UNCHANGED — participant-only
-- SELECT, writes API-only (service role). The new voice_upload_id column
-- rides the existing messages SELECT policy; the upload ROW stays invisible
-- to the recipient (media_uploads owner-scoped SELECT), which is fine — the
-- recipient plays audio through the signed-URL route, never the row.
-- ============================================================================

-- 1) Vocabulary: the voice upload kind (id format check: ^[a-z][a-z0-9_]*$).
insert into media_kinds (id, description) values
  ('voice', 'Fariimo voice note — self-recorded, <=120s, signed-URL access only')
on conflict (id) do nothing;

-- 2) Client-measured duration, server-clamped. Generic column: null for
--    image kinds, seconds for audio.
alter table media_uploads add column duration_seconds integer;
alter table media_uploads add constraint media_uploads_duration_range
  check (duration_seconds is null or duration_seconds between 1 and 300);

-- 3) Voice pointer on messages. ON DELETE RESTRICT is deliberate: a
--    referenced upload cannot vanish from under a live message. Moderation
--    soft-deletes the MESSAGE (deleted_at); the 30-day request sweep deletes
--    conversations (messages cascade) FIRST and voice uploads after. A
--    message must carry text or voice — never neither.
alter table messages add column voice_upload_id uuid references media_uploads (id) on delete restrict;
alter table messages alter column body drop not null;
alter table messages add constraint messages_body_or_voice
  check (body is not null or voice_upload_id is not null);
-- UNIQUE: one upload belongs to exactly one message — reattaching the same
-- audio to a second conversation would leak it across the participant
-- boundary. The DB owns this invariant, not the app layer.
create unique index messages_voice_upload_idx on messages (voice_upload_id)
  where voice_upload_id is not null;

-- 4) The private bucket, declared in a migration so the privacy property is
--    reviewable (public=false is the whole point; no storage.objects
--    policies are added — service role only). Guarded: the local test
--    harness is plain Postgres without Supabase's storage schema.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('dm-media', 'dm-media', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- 5) dm_inbox learns whether the last message is a voice note — the inbox
--    preview renders a neutral "voice note" label, never fake text. Adding a
--    return column changes the row type: drop + recreate + regrant.
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
