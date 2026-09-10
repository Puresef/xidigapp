-- ============================================================================
-- Fariimo read-state privacy (A5a): a participant must not learn the
-- COUNTERPARTY's read time. Two leaks closed, both reproduced against Dev on
-- 2026-09-09:
--
--   1) Column exposure. conversations kept the Supabase default table-wide
--      SELECT grant (phase 3 revoked only writes), so the participant SELECT
--      policy exposed BOTH *_last_read_at columns — and REPLICA IDENTITY FULL
--      streams whatever the subscriber may read. Fix: column-scoped re-grant,
--      the seq 49.5 verifications precedent (20260718000000). The caller's
--      own unread arithmetic never used the table grant: dm_inbox() and
--      dm_unread_count() are SECURITY DEFINER and project only auth.uid()'s
--      own column, so they are untouched.
--
--   2) The updated_at oracle. The generic set_updated_at trigger bumped
--      updated_at on EVERY update, pure read-marks included — an updated_at
--      change with no new message ≈ "they just read it", visible at rest,
--      over realtime, and as silent inbox reordering in the counterpart's
--      list. Fix: fire the bump only when something OTHER than read-state
--      changed. Inbox ordering (dm_inbox orders by updated_at) is unaffected:
--      message sends bump through their own explicit touch trigger
--      (touch_conversation_on_message), and status/accepted_at changes still
--      bump here.
--
-- Realtime note: walrus consults column privileges (has_column_privilege)
-- when building change payloads, so revoking SELECT on the two columns is
-- expected to strip them from postgres_changes payloads too — verify on a
-- live stack before trusting (the read-privacy suite pins the predicate;
-- staging pins the observed payload). Residual, accepted for now: the UPDATE
-- event's TIMING still reaches the counterpart's open subscription; closing
-- that fully means moving read marks off the conversations row entirely
-- (per-user read-state table) — recorded as the end-state option.
--
-- Rollback posture: fix-forward only. Re-granting these columns would
-- knowingly re-expose read timestamps and is not a sanctioned rollback.
-- ============================================================================

-- 1) Column-scoped SELECT: every column EXCEPT the two read-state columns.
--    anon is revoked outright (it never had a policy; the default grant was
--    dead weight). service_role keeps its full grant — the API's read-mark
--    writer and loadConversationForUser() run there.
revoke select on public.conversations from anon, authenticated;
grant select (id, initiator_user_id, recipient_user_id, status, accepted_at, created_at, updated_at)
  on public.conversations to authenticated;

-- 2) Read-marks stop bumping updated_at. The jsonb-minus comparison means any
--    OTHER column change — today's and any future column's — still bumps;
--    only a write whose sole effect is read-state is exempt. (The message
--    touch trigger sets updated_at explicitly, so skipping the generic
--    trigger for its updated_at-only write is a no-op by design.)
drop trigger conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  when (
    (to_jsonb(old) - 'initiator_last_read_at' - 'recipient_last_read_at' - 'updated_at')
    is distinct from
    (to_jsonb(new) - 'initiator_last_read_at' - 'recipient_last_read_at' - 'updated_at')
  )
  execute function public.set_updated_at();
