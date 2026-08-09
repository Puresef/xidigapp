-- Codsi (Ask) lifecycle — enum extension (P1 Codsi detail dispatch, HANDOFF-P1 6 Aug).
--
-- The P1 lifecycle is open → in_progress → fulfilled (asker-only transitions).
-- ADD VALUE lives in its own migration because a value added inside a
-- transaction cannot be USED in that same transaction ("unsafe use of new
-- value") — the companion 20260809000100 migration backfills with these.
--
-- 'answered' and 'closed' stay in the enum (Postgres enums don't shrink):
-- 'answered' is fully backfilled away by the companion migration; 'closed'
-- survives as a read-only legacy terminal state that no new flow writes.

alter type ask_status add value if not exists 'in_progress';
alter type ask_status add value if not exists 'fulfilled';
