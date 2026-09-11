-- ============================================================================
-- Durable retry state for identity-media cleanup (§19, storage option C).
--
-- Anonymisation clears profiles.avatar_path / cover_path, but the objects
-- themselves stay in the PUBLIC post-media bucket and remain fetchable at
-- their raw URLs. Deleting them is a second, cross-system step that can fail
-- independently of the database transaction, so it needs state the next run
-- can reconcile from.
--
-- media_uploads already carries everything needed to FIND the work
-- (owner_user_id, kind, storage_path, thumb_path — rows are never deleted by
-- the lifecycle). What it could not express is "these objects are confirmed
-- gone", which is what makes a retry idempotent and what stops the sweep
-- reporting a deletion as complete while media is still public.
--
-- purged_at is that marker, and nothing else:
--   * null  → the objects may still exist; the sweep must (re)attempt removal
--   * set   → every object for this row was confirmed absent from the bucket
--             (deleted by us, or already gone — both are success)
--
-- Additive and non-destructive: no row is deleted, the paths stay so an
-- operator can audit what was removed, and re-running the cleanup for an
-- already-purged row is a no-op rather than a second delete attempt.
--
-- The partial index is the sweep's reconciliation query: identity media
-- belonging to an anonymised account that has not been confirmed gone.
-- ============================================================================

alter table public.media_uploads
  add column purged_at timestamptz;

comment on column public.media_uploads.purged_at is
  'Set when every storage object for this row was CONFIRMED absent from the bucket (deleted or already gone). Null = cleanup still owed. Written only by the §19 lifecycle identity-media cleanup; never by an upload path.';

-- Reconciliation index: the cleanup scans avatar/cover rows still owing work.
create index media_uploads_identity_purge_pending_idx
  on public.media_uploads (owner_user_id)
  where purged_at is null and kind in ('avatar', 'cover');

-- Client roles never see or write this column (media_uploads already revokes
-- all client writes; SELECT stays own-or-mod via RLS). No new grant.
