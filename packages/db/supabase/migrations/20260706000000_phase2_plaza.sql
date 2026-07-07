-- ============================================================================
-- Xidig v1.0 — Phase 2: Plaza (Madal) — media pipeline, HITL moderation queue,
-- RLS + grants for the Plaza API surface
-- ============================================================================
-- Phase 0 already shipped the Plaza content tables (posts, comments, post_tags,
-- poll_options, poll_votes, reactions) fully locked (RLS enabled, no policies).
-- This migration:
--
--   1. adds the two Phase 2 tables the media pipeline + Somali-language
--      human-in-the-loop moderation queue need (media_uploads,
--      moderation_reviews);
--   2. opens the Plaza tables to the API surface, following the Phase 1
--      conventions (authenticated-only policies, (select auth.uid()),
--      column-scoped grants, side-effectful writes stay API-only);
--   3. ships poll_results() — the ONLY read path for poll tallies (Seq 14:
--      ballots are anonymous, counts only).
--
-- Storage note: the 'post-media' bucket is created at runtime by the media API
-- (idempotent, service role) — deliberately NOT here, because the migration
-- harness (embedded Postgres) has no storage schema, and bucket creation is
-- data-plane setup, not schema.
--
-- Write-model note (deviation from the listings precedent, deliberate): posts,
-- comments, post_tags, poll_options, tags, media_uploads and moderation_reviews
-- get NO client insert/update policies. Creating Plaza content has API-side
-- obligations the database cannot express — the AI moderation pre-scan (§15),
-- posts/comments daily rate limits (§26/§27), tag normalization, poll-option
-- count rules (Seq 14) and media attachment checks. A direct PostgREST insert
-- would bypass the moderation pipeline, so the API (service role, after
-- explicit authz) is the only writer. Reactions and poll votes are
-- side-effect-free and stay client-writable under RLS.
-- ============================================================================

-- ============================================================================
-- 1. ENUM ADDITIONS
-- ============================================================================

-- Moderation reviews can target an uploaded image before any post exists.
-- (Value is not referenced elsewhere in THIS migration — a value added by
-- ALTER TYPE cannot be used in the same transaction.)
alter type entity_type add value if not exists 'media_upload';

-- Lifecycle of a stored media object. Uploads that the AI pre-scan
-- confidently flags are rejected at the API and never stored, so there is no
-- 'flagged' state here: 'uncertain' = stored + queued for human review.
create type media_scan_status as enum ('passed', 'uncertain', 'skipped', 'removed');

-- Why a row landed in the human review queue (§15 AI pre-scan +
-- Somali-language human-in-the-loop for content the AI can't judge).
create type moderation_review_reason as enum ('ai_flagged', 'ai_uncertain');

-- 'approved' = human overrode/confirmed OK (content published/restored);
-- 'removed'  = human confirmed violation (content removed, mod action logged);
-- 'dismissed' = review is moot (e.g. author already deleted the content).
create type moderation_review_status as enum
  ('pending', 'approved', 'removed', 'dismissed');

-- ============================================================================
-- 2. MEDIA UPLOADS (§15 images/memes: 1–5MB → WebP, EXIF-stripped, pre-scanned)
-- ============================================================================
-- One row per stored object in the 'post-media' bucket. The upload API
-- transcodes to WebP (re-encode drops EXIF/GPS), runs the AI pre-scan, then
-- inserts this row; posts.image_urls stores the storage paths for rendering,
-- while this table carries provenance + scan state for moderation and orphan
-- cleanup. post_id is set when a post attaches the upload.

create table media_uploads (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users (id),
  bucket         text not null default 'post-media',
  storage_path   text not null unique,
  mime_type      text not null default 'image/webp',
  bytes          integer not null,
  width          integer,
  height         integer,
  scan_status    media_scan_status not null,
  scan_verdict   jsonb not null default '{}'::jsonb, -- provider verdict (categories, confidence, language, model)
  post_id        uuid references posts (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint media_uploads_bytes_positive check (bytes > 0)
);

create index media_uploads_owner_idx on media_uploads (owner_user_id, created_at desc);
create index media_uploads_post_idx on media_uploads (post_id) where post_id is not null;
-- Orphan sweep: uploads never attached to a post (abandoned composer sessions)
create index media_uploads_unattached_idx on media_uploads (created_at) where post_id is null;

alter table media_uploads enable row level security;

-- ============================================================================
-- 3. MODERATION REVIEWS (human-in-the-loop queue)
-- ============================================================================
-- Content the AI pre-scan couldn't judge ('ai_uncertain' — prominently
-- Somali-language content, §15 + build brief) or confidently flagged
-- ('ai_flagged' text → auto-hidden pending a human decision). This is NOT the
-- Phase 6 member-reports queue (reports/mod_actions ship there); it only
-- reviews what the AI filter escalates. `language` is the scan's language
-- guess so Somali-speaking reviewers can filter their queue ('so').

create table moderation_reviews (
  id                   uuid primary key default gen_random_uuid(),
  entity_type          entity_type not null,
  entity_id            uuid not null,
  author_user_id       uuid not null references users (id),
  reason               moderation_review_reason not null,
  language             text, -- 'so' | 'en' | 'other' | null = unknown
  content_excerpt      text, -- snapshot at scan time (moderation context survives edits)
  ai_verdict           jsonb not null default '{}'::jsonb,
  status               moderation_review_status not null default 'pending',
  reviewed_by_user_id  uuid references users (id) on delete set null,
  review_note          text,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- One open review per piece of content; re-scans (edits) reuse the open row.
create unique index moderation_reviews_one_pending_per_entity
  on moderation_reviews (entity_type, entity_id) where status = 'pending';
-- Queue reads: pending first, filterable by language (Somali HITL lane)
create index moderation_reviews_queue_idx on moderation_reviews (status, language, created_at);
create index moderation_reviews_entity_idx on moderation_reviews (entity_type, entity_id);

alter table moderation_reviews enable row level security;

-- ============================================================================
-- 4. RLS — PLAZA CONTENT
-- ============================================================================

-- --- posts ----------------------------------------------------------------
-- Members read the global Plaza (published, not Space-scoped). Authors always
-- see their own rows in any moderation state (a hidden-pending-review or
-- removed post renders as a status banner to its author, §27 plain language);
-- mods see everything. lab_id IS NULL keeps future Space-scoped posts
-- (Phase 4 visibility rules) out of reach until Labs ship their own policy.

create policy posts_select_visible on posts
  for select to authenticated
  using (
    (status = 'published' and lab_id is null)
    or author_user_id = (select auth.uid())
    or public.is_mod()
  );

revoke insert, update, delete on public.posts from anon, authenticated;

-- --- comments ---------------------------------------------------------------
-- Visible when published AND the parent post is visible to the caller (a
-- hidden post must not leak through its comment thread). Authors/mods see
-- their own/all rows. Candidate-targeted comments (§12 Capital) stay
-- unreadable until Phase 5 ships its visibility rules.

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
            (p.status = 'published' and p.lab_id is null)
            or p.author_user_id = (select auth.uid())
          )
      )
    )
  );

revoke insert, update, delete on public.comments from anon, authenticated;

-- --- post_tags --------------------------------------------------------------
-- Tag chips render with their post; visibility follows the parent post.

create policy post_tags_select_visible on post_tags
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = post_tags.post_id
        and (
          (p.status = 'published' and p.lab_id is null)
          or p.author_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

revoke insert, update, delete on public.post_tags from anon, authenticated;

-- --- poll_options -----------------------------------------------------------

create policy poll_options_select_visible on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from posts p
      where p.id = poll_options.post_id
        and (
          (p.status = 'published' and p.lab_id is null)
          or p.author_user_id = (select auth.uid())
          or public.is_mod()
        )
    )
  );

revoke insert, update, delete on public.poll_options from anon, authenticated;

-- --- poll_votes (Seq 14: ballots are ANONYMOUS — counts only) ----------------
-- A member reads/casts/changes only their OWN ballot. Nobody — including
-- mods — can enumerate who voted for what through the API surface; tallies
-- come exclusively from poll_results() below. The insert/update checks make
-- the database itself refuse ballots on closed, past-deadline, non-published
-- or Space-scoped polls (manual close = poll_status, scheduled close =
-- poll_closes_at; the auto-close sweep may lag the deadline).

create policy poll_votes_select_own on poll_votes
  for select to authenticated
  using (voter_user_id = (select auth.uid()));

create policy poll_votes_insert_own on poll_votes
  for insert to authenticated
  with check (
    voter_user_id = (select auth.uid())
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and p.lab_id is null
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

create policy poll_votes_update_own on poll_votes
  for update to authenticated
  using (voter_user_id = (select auth.uid()))
  with check (
    voter_user_id = (select auth.uid())
    and exists (
      select 1 from posts p
      where p.id = poll_votes.post_id
        and p.type = 'poll'
        and p.status = 'published'
        and p.lab_id is null
        and p.poll_status = 'open'
        and (p.poll_closes_at is null or p.poll_closes_at > now())
    )
  );

revoke insert, update, delete on public.poll_votes from anon, authenticated;
grant insert (post_id, poll_option_id, voter_user_id) on public.poll_votes to authenticated;
grant update (poll_option_id) on public.poll_votes to authenticated;

-- --- reactions (§20 taxonomy: fire/strong/mashallah/idea/watching) ----------
-- Side-effect-free and idempotent, so members manage their own directly
-- (same reasoning as skill_endorsements). SELECT is own-rows-only: per-type
-- counts are served by the API (service role) — the same "aggregates without
-- enumeration" stance as follower counts (§13 precedent in Phase 1).

create policy reactions_select_own on reactions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy reactions_insert_own on reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (
        post_id is not null
        and exists (
          select 1 from posts p
          where p.id = reactions.post_id
            and p.status = 'published'
            and p.lab_id is null
        )
      )
      or (
        comment_id is not null
        and exists (
          select 1 from comments c
          join posts p on p.id = c.post_id
          where c.id = reactions.comment_id
            and c.status = 'published'
            and p.status = 'published'
            and p.lab_id is null
        )
      )
    )
  );

create policy reactions_delete_own on reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.reactions from anon, authenticated;
grant insert (user_id, post_id, comment_id, type) on public.reactions to authenticated;
grant delete on public.reactions to authenticated;

-- --- notifications ----------------------------------------------------------
-- Phase 2 starts WRITING notification rows (reply, ask credited, stale-Ask
-- nudge, moderation outcomes — service role only); members can read their
-- own. The notifications UI + read_at flow ship in Phase 3.

create policy notifications_select_own on notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.notifications from anon, authenticated;

-- --- media_uploads ----------------------------------------------------------
-- Owners see their uploads (composer gallery); mods see everything (review
-- queue context). Writes are API-only: rows exist only after transcode +
-- pre-scan, and scan columns must never be client-writable.

create policy media_uploads_select_own on media_uploads
  for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or public.is_mod()
  );

revoke insert, update, delete on public.media_uploads from anon, authenticated;

-- --- moderation_reviews -----------------------------------------------------
-- Mod/admin queue only. Resolution has side effects (content status change,
-- mod_actions + audit rows, author notification), so writes are API-only.

create policy moderation_reviews_select_mod on moderation_reviews
  for select to authenticated
  using (public.is_mod());

revoke insert, update, delete on public.moderation_reviews from anon, authenticated;

-- tags: unchanged — select opened in Phase 1, writes stay API-only (the
-- Phase 2 tag-create endpoint normalizes + rate-limits member suggestions).
-- reputation_events / reputation_scores: stay fully locked; Phase 2 appends
-- helper-credit ledger rows via the service role only (§15 helper credit).
-- Phase 7 (reputation UI) opens read policies.

-- ============================================================================
-- 5. POLL TALLIES — the only read path for ballots (Seq 14)
-- ============================================================================
-- SECURITY DEFINER because poll_votes is own-rows-only under RLS: tallies
-- must aggregate ALL ballots while never exposing voter ids. Callers only get
-- counts, and only for polls they can see (same visibility branch as
-- posts_select_visible). Style per phase1_auth helpers: STABLE, empty
-- search_path (schema-qualify everything), no uid parameter — auth.uid()
-- resolves internally so a caller can never probe another member's view.

create function public.poll_results(p_post_id uuid)
returns table (poll_option_id uuid, votes bigint)
language sql stable security definer set search_path = ''
as $$
  select po.id, count(pv.id)::bigint
  from public.poll_options po
  left join public.poll_votes pv on pv.poll_option_id = po.id
  where po.post_id = p_post_id
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

-- Supabase default privileges grant EXECUTE to anon too — revoke explicitly.
revoke all on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated, service_role;
