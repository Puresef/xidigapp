# Retention implementation plan — R1a class map, R1b reversible suppression

**Status (12 Sep 2026):**

- **R1a is implemented** on `claude/integration-plus-retention` (`c55417b`):
  `packages/db/src/retention.ts` (`@xidig/db/retention`) and its contract
  test. It is configuration only, and no behaviour changed.
- **R1b and R2 are plans**, updated with the owner's third-pass rulings
  (`docs/retention-doctrine.md` §1b). Nothing in them is implemented.
- The plan was first written on `claude/retention-doctrine`, which is the
  doctrine document on top of retained-content `7162c1c`. **Partial
  containment only. Deletion compliance is NOT claimed**, and it will not be
  until R2, a provider path for GoTrue phone numbers and legal review are all
  complete.

**Authority:** the owner-edited PRD §24 and the owner rulings in
`docs/retention-doctrine.md` §1a (12 Sep). The class map is in the same
document (§3).

**Evidence:** a read-only audit of this branch (12 Sep). Each finding was
re-checked at file:line by an independent verifier. Dev (read-only counts,
12 Sep; "Dev" is the live production database, see §3 Environments, so
these are live production counts):

- 19 deleted accounts;
- 1 DM message from a deleted sender (1 thread, no voice);
- 3 events hosted by a deleted member (1 past, 1 Space-hosted);
- 2 Space updates by deleted authors (0 decisions, 0 artifacts);
- 0 digest editions; 9 report snapshots;
- 0 notifications or ledger events whose actor is a deleted member;
- Dev ledger 56.

## 0. Ground rules for every step

1. **Keyed on final deletion only.** Suppression applies when
   `users.status = 'deleted'`. The grace (`pending_deletion`), suspended and
   deactivated accounts keep their existing rules.
2. **No destructive deletion, and no mutation of source rows or storage
   objects in R1b.** The one rewrite is the digest post body (§3.5). That
   post is a system-authored **derived copy**, re-rendered from its retained
   payload under the award-redaction precedent (82daa4c), so it can be
   re-derived. The only write-site changes are forward-only: stop writing DM
   previews, and hash new suppression emails.
3. **Direct readability decides the layer.** Some surfaces let a signed-in
   client read the raw column through PostgREST, Realtime or an
   EXECUTE-granted SECURITY DEFINER RPC. For those the fix is at the **DB**; an
   app placeholder alone does not suppress anything. This is the award-body
   lesson from 82daa4c. It holds for DMs, notifications, Space history,
   events, the ledger note and snapshot bodies.
4. **Rollback is a pre-written inverse migration, never a git revert.** Each
   R1b migration ships with its inverse in the same PR. A git revert of
   998f991/82daa4c would re-open the signed-out public-Space inversion that
   82daa4c closed.
5. **Refuse inactive callers before any service-role read.** Placeholders
   need existence metadata, and after a row-hide that comes from the service
   role. But `/messages`, `/messages/[id]` and `/notifications` refuse only
   _suspended_ callers, and `getAuthContext` returns a context for any status.
   Today the DB lifecycle gate is the only thing keeping deactivated (and
   possibly deleted) callers from bodies. Each page therefore first gets a
   `requireUser`-equivalent refusal. Alternatively, the read becomes a gated
   SECURITY DEFINER RPC listed in `GUARDED_RPCS`.
6. **Moderators keep restricted read** through the existing `is_mod()`
   branches; that is the restricted-evidence path. Purpose-binding it (only
   with an open report or hold) is an owner question (§5).
7. **Audit:** R1a writes nothing. In R1b, only the digest re-render writes
   audit rows: one content-free row per rewritten post (the award
   precedent). Policies, grants and projections move no one's data. Every
   later R2 step writes one content-free audit row per item.

## 1. Retained-content behaviour that conflicts with the doctrine (verified)

| Area                                                             | Shipped behaviour (branch code = `7162c1c`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Ruling                           | Layer needed                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| **DM bodies + voice** (the 12 Sep "preserve DM history" ruling)  | `messages_select_participant` has no sender predicate and SELECT was never narrowed, so a counterparty reads the deleted sender's `body`/`voice_upload_id` directly (`20260706100000_phase3_fariimo.sql:211`). The thread API and page return it (`apps/web/src/lib/dm/views.ts:78`: `toMessageView` suppresses only on moderation `deleted_at`). `dm_inbox()` returns the raw last body (`20260911000400_client_lifecycle_gate.sql:202`). The voice route mints a signed URL (`api/conversations/[id]/voice/[uploadId]/route.ts:40`). | C1                               | DB + app                                         |
| **DM previews in notifications**                                 | `payload.preview` (≤140 chars of the DM) on `dm_request`/`new_dm` (`apps/web/src/lib/dm/service.ts:314,466`). Readable directly (own-row policy), serialized into `/notifications` RSC props, and streamed by the app-wide `BadgeProvider` subscription. No UI renders it.                                                                                                                                                                                                                                                             | C1                               | DB (+ stop writing)                              |
| **Space updates / decisions / artifacts** (998f991)              | `author_is_retained` (live **or deleted**) on all three read policies (`20260911001100_retained_space_history.sql:34`). The Space tabs, the three API GETs (raw author id included), the following feed, the Venture overview/capital decision, and the signed-out public page (`apps/web/src/lib/labs/public-updates.ts:40`, via `isRetainedAuthorStatus`) all show bodies. Any member can `ilike`-search the bodies over PostgREST.                                                                                                  | C3                               | DB + app                                         |
| **Event bodies** (998f991 "past events keep a tombstone record") | `events_select_visible` has no host-status clause (`20260710063000_events.sql:161`). For a **past** sole-deleted-host event, page + API show cover, description, agenda and venue, plus address/online URL to "going" viewers (`apps/web/src/lib/events/views.ts:595,608`). The upcoming "No longer listed" view still carries description, agenda and cover (`views.ts:641`). The meta description, the Google Calendar href and the API JSON (`host_user_id`, host stats) do too.                                                    | C2                               | DB + app                                         |
| **Space-hosted events by a deleted creator**                     | Treated as `host_present` everywhere (`apps/web/src/lib/retained-content.ts:131`): full body, RSVPs, reminders, ICS with location, and the deleted member's online URL revealed. Nobody but the host or a mod can edit, cancel or check in.                                                                                                                                                                                                                                                                                            | C2                               | app (+ DB)                                       |
| **Old digests**                                                  | Each published edition pins a Plaza post by `xidig_ai` whose body bakes in Win/Ask titles, listing name + city and event titles (`apps/web/src/lib/digest/generate.ts:87`). It is readable directly (the author is live). A resumed send renders the stored payload (`digest/send.ts:43`). The payload comment claims "entity ids + counts only" but it holds titles (`20260709100000_phase8_ai_api.sql:138`).                                                                                                                         | doctrine                         | DB-visible body → rewrite or hide                |
| **Stored snapshots**                                             | `report_snapshots.captured_body` (full bodies, including DMs) is mod-readable raw over PostgREST (`20260704200000_phase1_auth.sql:499`). It has no window, and service-role DELETE is unguarded (`20260708100000_phase6_moderation.sql:315`). `moderation_reviews.content_excerpt` (≤500 chars) is the same. A counterparty can still report a deleted member's message, which starts a new immutable copy (`api/reports/route.ts:55`).                                                                                                | C4                               | DB grant + admin projection                      |
| **Venture ledger** (`work_events.note`)                          | ≤400 chars inside the sha256 chain. UPDATE/DELETE are refused for every role, and members read it directly; the trail and CSV export pass it through (`20260813000100_maal_venture.sql:223,497`). Dev: 0 affected rows.                                                                                                                                                                                                                                                                                                                | C4                               | append-only overlay + grant                      |
| **Audit logs**                                                   | Immutable. Every email-suppression row stores the plaintext address in metadata, and Sentry receives it too (`apps/web/src/app/api/webhooks/email/route.ts:91,95`).                                                                                                                                                                                                                                                                                                                                                                    | C4                               | forward-only minimisation; overlay = R2          |
| **Retention config**                                             | No `RETENTION_WINDOW_DAYS`, class map or legal-hold flag exists. `RECORDING_RETENTION_MONTHS` is declared and enforced nowhere (`apps/web/src/lib/moderation/constants.ts:16`): the drift the class map must prevent.                                                                                                                                                                                                                                                                                                                  | plan                             | config + contract test                           |
| **Public UGC media**                                             | Every non-identity kind stays in the **public** `post-media` bucket, fetchable at raw URLs that embed the uploader's id: Plaza images, listing photos, event covers, Space icon/cover, candidate logo/cover. Deletion purges only `avatar`/`cover` (`apps/web/src/lib/lifecycle/media-cleanup.ts:44`; `20260911000200_media_purge_state.sql:38`).                                                                                                                                                                                      | doctrine                         | objects → **A5b/R2**; owner accepts the residual |
| **Reviewer notes** (`candidate_reviews.notes`)                   | A deleted reviewer's notes stay readable by every member who can read the candidate, with no reviewer-status clause (`20260707000000_phase5_capital.sql:205-212`), yet the doctrine classes them as restricted. They are §17-transparency-locked.                                                                                                                                                                                                                                                                                      | C3/C4 (ruled 12 Sep: restricted) | DB grant + service-role projection (§3.6)        |
| **Deletion/privacy/terms copy**                                  | Shipped EN and SO copy still promises erasure ("everything is permanently removed", "personal data is removed rather than archived"; e.g. `packages/i18n/src/dictionaries/en.ts:661`). That contradicts both what is retained today and the 1-year restricted-metadata doctrine. The only rewrite is `5f3d3b3` on `claude/a3b-truthfulness`, which is **legal-blocked**.                                                                                                                                                               | doctrine                         | copy → **legal** (A3c)                           |

**The platform's own terms agree with the doctrine.** The accepted ToS says
the display licence "ends when you delete the content or your account"
(en.ts:1979; so.ts:1889). Showing a deleted member's Space history, DMs or
event bodies therefore also contradicts what members agreed to. No project
terms or Space-ownership acceptance exists that could override it.

**Superseded code comments** that R1b rewrites:

- `apps/web/src/lib/lifecycle/anonymise.ts:19-22` ("deliberately untouched … retained content renders under the tombstone");
- `apps/web/src/lib/dm/service.ts:213` ("existing conversation history … attributed to the tombstone");
- `apps/web/src/lib/retained-content.ts:35` (past event "keeps its record");
- the header of `retained-space-history.test.ts`;
- `profile.tombstone*` copy ("Things it contributed that others can still see…", en.ts:934).

**Already aligned:**

- award result posts (82daa4c);
- push payloads (payload-less);
- the DM-request email (sender name only);
- search and the external API (no DM, event or Space-history bodies; digest candidates recompute with live filters);
- event reminders and venture warnings (title/Space name only);
- data export (no counterparty messages);
- the upcoming sole-deleted-host discovery rules.

## 2. R1a — class map + config (C0: no migration, no behaviour change) — IMPLEMENTED (`c55417b`)

> **What shipped vs this design** (corrected after the 12 Sep review):
>
> - **Shipped:** `RETENTION_WINDOW_DAYS`, `LEGAL_HOLD`, the class vocabulary
>   as implemented (`remove | suppress | shell | restricted | legal | review
| platform`), a per-table class, member links, every text/json column (and
>   location coordinates), mutability, anchor and status + plan.
>   `RETENTION_WINDOWS` carries `enforcedBy` / `declared_not_enforced` per
>   window. Also `MEDIA_KINDS` + `PUBLIC_MEDIA_RESIDUAL`, `PROVIDER_METADATA`
>   (GoTrue phone and email), `NON_PUBLIC_REGISTER` (auth.* and
>   storage.objects) and `EXTERNAL_COPIES`.
> - **Not shipped (deferred to R1b/R2):** a per-table reader register (only
>   `memberReadable`, which detects literal `using(true)` policies), a
>   per-table `hardDeleteBlockedBy` (recorded as prose on `users`) and a
>   per-table `enforcedBy`. The optional C0b count-only sweep step is also
>   deferred.

1. **`packages/db/src/retention.ts`**, exported as the subpath
   `@xidig/db/retention` so a large map stays out of the browser bundle. This
   follows the `entitlements.ts` precedent: pure data, shared by DB tests and
   the app. `@xidig/db` has no dependency on the web app, and the CI
   typecheck of `packages/db` has no `@/` path (the vitest alias would
   resolve it, typecheck would not). So the doctrine's earlier
   `apps/web/src/lib/retention/classes.ts` proposal is replaced. It holds:
   - `RETENTION_WINDOW_DAYS = 365`;
   - the class vocabulary `remove | suppress | restricted | legal | review`;
   - **anchors**: deletion-driven = `users.anonymised_at` (set once, kept on
     re-run); dispute-driven = `max(anonymised_at, reports.resolved_at | appeals.decided_at)`;
   - one entry per table: member-link columns, body/media columns → class,
     mutability (`mutable | no_update | append_only`), the reader register
     (which surfaces may read it), `hardDeleteBlockedBy` (FKs from immutable
     tables; `users.id → auth.users` is NO ACTION), and `enforcedBy`
     (consumer) or `declared_not_enforced`;
   - **GoTrue phone:** restricted provider/auth metadata, ≤365 days, provider
     erasure unavailable — a classification, not a compliance claim;
   - **non-recallable external copies:** delivered digest emails, Sentry
     events (server init attaches local variables and has no `beforeSend`
     scrubbing, `apps/web/src/sentry.server.config.ts:10`), email-provider
     logs, CDN copies of public media;
   - PII-like copies the scrub cannot reach, e.g.
     `capital_gate_evaluations.profile_country`;
   - **every media kind**, with its bucket and purge status: `avatar` and
     `cover` are purged; `post`, `listing_photo`, `event_cover`,
     `space_icon`, `space_cover`, `candidate_logo` and `candidate_cover` sit
     in the public bucket and are unpurged; DM voice is private but unpurged;
   - `candidate_reviews.notes`, which is member-readable under the §17 lock
     (§5, question 14).
2. **`packages/db/src/retention-class-map.test.ts`** on the embedded-Postgres
   harness:
   - every public base table (`pg_class` relkind `r`/`p`, **no privilege
     filter**; `migrations.test.ts:40-47` is the template) has an entry, with
     no unknown or stale entries. The lifecycle gate's privilege-filtered
     enumeration misses fully revoked tables such as `conversation_declines`
     (member-linked through `conversations`);
   - every table with an FK to `public.users` lists its member-link columns;
   - every text/jsonb column on a member-linked table is classified;
   - every declared window names its consumer or says `declared_not_enforced`.
3. **Optional C0b:** a count-only sweep step (f) `retentionDue` (deleted and
   `anonymised_at < now − RETENTION_WINDOW_DAYS`). It writes nothing and
   reports `retentionPurged: 0` honestly. The sweep is reconciliation-based,
   with injectable time and per-item isolation (`apps/web/src/lib/lifecycle/sweeps.ts:114`).
   `sweeps.test.ts:175` and `:198` pin the exact counts object and the step
   order, so any new step extends that shape (and its FakeQuery). Because it
   changes the sweep's reported shape, it can equally wait for R2.
4. **Doc truth fixes:** the auth-token purge is opportunistic, not scheduled;
   the digest payload holds titles, not "ids + counts only".

**Rollback:** revert (no migration, no data).

## 3. R1b — the first reversible suppression/redaction slice

One PR per area, in this order, so each can be verified and rolled back on its
own.

**Base and gates:**

- **Base: the integration branch now exists** —
  `claude/integration-plus-retention` (owner-approved 12 Sep; merge
  `4b71213` of this line and the naming line). It holds this line (`cbcc297` ⊃
  `94dfc01`, `998f991`, `82daa4c`, `7162c1c`), Packet B (`42d10e3`), naming
  (`384b840`) and the Plus P1 migrations (`20260912100000`, `20260912100100`).
  R1b builds on it; every new migration sorts after `20260912100100`, and the
  Plus and retention lanes sequence their `en.ts`/`so.ts` edits.

- **Inverse migrations.** Each forward migration ships with a written inverse
  stored **outside** `packages/db/supabase/migrations/` (so `db push` never
  applies it). Rollback copies it in as a new fix-forward migration, per the
  repo's "fix-forward only" convention.
- **Live checks before relying on Realtime:** that Realtime applies
  per-subscriber RLS to `messages`, and that it drops a revoked column. This
  was not observable statically, and an observation on Dev (the live
  production database) proved a similar assumption wrong for read-state. `pg_graphql` exposure is unknown
  (`config.toml` lists `graphql_public`); if enabled, it uses the same grants
  and RLS.
- **Environments.**
  - The Supabase project labelled "Dev Xidig App" (`tbdryvhxxiqadseuxclm`)
    is currently the live production database for `xidig.net`. Treat any
    access to it as production access. No smoke test, migration, data check
    or "Dev" operation is safe unless explicitly approved as production work.
  - Staging is paused/unverified and must not be assumed to match
    production.
  - Any reference to Dev counts or Dev migration state in this plan refers to
    live production data/state, unless a separate non-production project is
    explicitly confirmed.
  - The live ledger records its 19 most recent entries (`20260901000000`
    onward) under apply-time versions, not the file versions, so
    `supabase db push` does not line up with this directory as-is. Use the
    same application method as those entries, or reconcile the ledger first,
    as an approved production step.

### 3.1 Prerequisite (in the first PR)

- `/messages`, `/messages/[id]` and `/notifications` refuse deleted and
  deactivated callers the way `requireUser` does (ground rule 5).
- New i18n keys, EN plus provisional SO (native review):
  - `messages.removedAccountDeleted` ("Message removed — account deleted.",
    the ruling's example; do **not** reuse the moderation key
    `messages.messageRemoved`);
  - an event "details removed" notice;
  - Space-history shell strings.

### 3.2 DMs + notification previews (C1)

**DB (one migration):**

- A helper `account_is_deleted(uuid)`: STABLE SECURITY DEFINER, `search_path=''`,
  granted to `authenticated` and `service_role`, and listed in `RPC_EXEMPT`
  with its reason. It is dedicated so that `author_is_retained` can later
  lose its EXECUTE grant (a status oracle).
- A **RESTRICTIVE** `FOR SELECT` policy on `messages`:
  `not account_is_deleted(sender_user_id)`. It covers PostgREST and Realtime.
  The counterparty's own messages stay readable.
- Recreate `dm_inbox` (drop + create, because the return type changes; keep
  the lifecycle guard and its `GUARDED_RPCS` entry). Add
  `last_message_sender_deleted` and null the body when it is set. The flag
  must come from `dm_inbox` itself: `hydrateInbox` receives the RLS client at
  two of its three call sites.
- `notifications`: stop writing `payload.preview` at its three write sites
  (`dm/service.ts:314,348,466`); no UI renders it. Add a RESTRICTIVE clause
  hiding `dm_request`/`new_dm` rows whose actor is deleted. This is
  reversible and mutates nothing. The owner may prefer stripping the preview
  on those rows instead: a derived copy, re-derivable from the retained
  message. **The app strips it too.** The inbox selects `payload`
  (`lib/notifications/inbox.ts:33`), bundles copy it (`bundle.ts:75`), and
  `GET /api/notifications` and the SSR page ship it to the browser.

**App:**

- `presentMessage(row, senderStatus)` in `lib/dm/presentation.ts` (the
  documented single boundary). Both the server `toMessageView` and the
  client-side Realtime `rowToView` call it. A deleted (or unknown → fail
  closed) sender renders the placeholder, with no body and no voice. The
  moderation branch is unchanged.
- The thread read (API + SSR) proves participation and then reads existence
  metadata (id, sender, time) through the service role, so continuity stays
  intact after the row-hide.
- Voice route: a deleted sender answers **404**, the same shape as a
  moderated message.
- Inbox preview and request card show the placeholder. A deleted initiator's
  request card is decline-only. The composer in an accepted thread is closed,
  with a plain notice. The request-context card nulls member-since, the
  shared Space and "replied to your ask" for a deleted initiator.

**Tests:**

- Add:
  - DB: as the peer, the deleted sender's messages return 0 rows while the
    peer's own are read; `dm_inbox` returns a null body + flag; the
    `dm_request`/`new_dm` notification from a deleted actor is hidden.
  - Unit: `presentMessage` (none exist today, not even for the moderation
    branch).
  - Routes: voice 404; inbox and composer cases.
- Flip: the history-render assertions and wording in
  `send-tombstone.test.ts`, `fariimo-voice.test.ts`, and the conversation and
  inbox component fixtures.

**Rollback:** the inverse migration drops the policy and the helper,
recreates `dm_inbox` from `20260911000400`, and drops the notification clause;
then revert the app.

### 3.3 Space updates, decisions, artifacts (C3)

**DB (one migration):** recreate `lab_updates_select_readable`,
`lab_artifacts_select_readable` and `lab_decisions_select_readable` with
`author_is_active(...)` (active + grace) in place of `author_is_retained`.
Mods keep `is_mod()`. The following-feed view is `security_invoker`, so it
follows automatically. Optionally revoke EXECUTE on `author_is_retained` from
`authenticated`, keeping the function for the inverse migration.

**App:**

- `lib/labs/history-shells.ts`: after `loadLabForViewer` (the RLS proof of
  `can_read_lab`), a service-role query returns **only** id, kind,
  `created_at`/`decided_at` and author status for published rows.
  - Updates and artifacts render "Removed — the author deleted their
    account" with the date.
  - Decisions render "Decision recorded {date} — text removed (the author
    deleted their account)". The **title is withheld by default** (it is
    member-authored free text).
  - A decision cited by `venture_capital_needs`/`venture_weight_schemes`
    keeps its `decision_id` link and shows the shell.
- The signed-out public page switches `isRetainedAuthorStatus` →
  `isLiveStatus`: those rows are dropped with no shell, because metadata is
  not public. The feed drops them (no shell). The API GETs return shells or
  omit (owner question).
- **The Venture JSON APIs too:** `GET /api/labs/[id]/venture` (overview
  decisions with title, text and author ref), `/capital` (the cited
  decision's title and text), `/tasks` and `/contributions` (the ledger note,
  §3.6) all go through the same shells (`apps/web/src/app/api/labs/[id]/venture/route.ts:39`).
- **Existence metadata must not carry the raw account id.**
  `GET /api/labs/[id]/events` returns `lab_events.actor_user_id` through
  `attachAuthors`, and `lab_events` is directly readable under `can_read_lab`
  (`apps/web/src/app/api/labs/[id]/events/route.ts:29`). The shells expose the
  tombstone only.
- **Unattributable Venture text** — `venture_capital_needs.purpose` (no
  declaring column) and `venture_workstreams.name` (only an owner seat) —
  cannot be reached by author-keyed suppression. The class map records them
  as `review`.
- The tombstone profile copy changes in **both** locales (en.ts:934,
  so.ts:775-776), or the i18n gates fail.
- **Project terms:** no project-terms, contribution-licence or
  Space-ownership acceptance exists anywhere
  (`consent_type` = ToS, privacy, cookies, analytics, error_monitoring). The
  C3 "Space-owned under accepted project terms" exception therefore **cannot
  apply to any existing row**, and the default suppression applies. Any
  future terms mechanism is prospective and legal-reviewed, and is not part
  of R1b.

**Tests flip:**

- `retained-space-history.test.ts:123-130`: reader and lead → 0, mod stays 1;
- `retained-space-history.test.ts:145-154`: replace with a shell-projection
  test;
- `retained-space-history.test.ts:204-224`: `['deleted', 1]` → 0;
- `public-updates.test.ts:71-76`;
- the parity test `public-updates.test.ts:103-120`, repointed at
  `author_is_active`'s status list.

Add anon assertions for decisions and artifacts.

**Rollback:** the inverse migration restores the `20260911001100` policies.
Never git-revert 998f991/82daa4c (ground rule 4).

### 3.4 Events (C2)

**DB (one migration):** recreate `events_select_visible` so that the
general-member branch also requires `lab_id is not null or not
account_is_deleted(host_user_id)`. Sole-deleted-host rows become invisible to
members over PostgREST; mods keep them.

**App:**

- `getDeletedHostEventShell(slug)` (service role, narrow select: slug, title,
  category, starts/ends, timezone, mode, status, visibility) and one
  `shellView` for **past and upcoming** sole-deleted-host events: title,
  date, status and the tombstone host.
- **Withheld:** description, agenda, cover, venue name/address, online URL,
  capacity, host stats and `host_user_id`. The reveal is never fetched.
  Calendar, Google and Share links are gated on `host_present`. The meta
  description is skipped.
- The past card gets a neutral label (not "Photos and report"), and a
  "details removed" notice is shown.
- An existing RSVP can still be withdrawn (service-role fallback; the
  behaviour is test-pinned). The RSVP host notification is skipped when the
  host is deleted.

**Who the "sole host" actually is.** Plain members cannot create an event
without a Space container (`apps/web/src/lib/events/authz.ts:10-22,46-56`).
So every event with `lab_id` null is one of two kinds:

- a **mod/admin "community/official" event** (no container, or a candidate
  container);
- a **verified business's listing event**.

The "sole deleted host" case therefore arises when a **staff member or a
verified business owner** deletes their account.

**Owner ruling (12 Sep; `docs/retention-doctrine.md` §1b):**

- A staff event is organisation/platform-owned only where it is **clearly
  recorded** as official/platform content.
- A business event is organisation-owned only where business ownership is
  clear **and** the deleted member acted as an authorised representative
  under accepted terms.
- Otherwise, the description, agenda, cover/media, links and contact are
  personal UGC and are suppressed.
- The shell keeps title, date, status and the tombstone host, or
  organisation attribution when that is clearly non-personal.

The schema records neither an official-content marker nor accepted
representative terms, so **every existing sole-host event is ambiguous and is
shelled**. Adding such a marker is a separate, prospective owner/legal slice.
Today only a listing event's CONTAINER link is suppressed when the listing's
owner is not live; the event's own body is not (`apps/web/src/lib/events/views.ts`
`loadContainer`), so it gets the same shell as any other ambiguous event.

**Space-hosted events created by a deleted member:** the schema cannot tell
Space content from the creator's personal UGC. That makes them ambiguous, and
under the ruling they are suppressed. Withhold the creator-authored
description, agenda, cover, venue and online URL; keep the title, date,
status and Space. Whether the event keeps running (RSVPs, reminders) is still
an owner question, because no Space lead can edit, cancel or re-host it
today.

**Also in this PR:**

- `GET /api/events`, the member calendar API, returns raw rows (description,
  agenda, cover, venue, `host_user_id`) for Space-hosted events whose
  creator was deleted (`apps/web/src/app/api/events/route.ts:44`). It goes
  through the same withholding.
- A mod's PATCH on a deleted host's event, including publishing their
  leftover draft, writes new rows attributed to the deleted account: a Plaza
  auto-post, a moderation review, and a `moderation_hold` notification to
  them (`apps/web/src/app/api/events/[slug]/route.ts:147`). Refuse publish
  for a deleted host, and never notify a deleted host.
- Correct the `retained-content.ts:36` comment. The reminder cron already
  stamps `reminded_at` on those rows before skipping them, which is
  harmless, but "no event row is written" is untrue.

**Tests:**

- Add DB-level and view-level cases, not only route cases. Every event route
  test mocks `getMemberEventView` wholesale
  (`apps/web/src/app/api/events/[slug]/rsvp/route.test.ts:25-39`), so "still
  lets the member withdraw" would stay green while live withdrawal 404s
  under the row-hide. Also add API, page-metadata and ICS cases.
- Flip `retained-content.test.ts:68,109` and `events/views.test.ts:184`
  under the default Space-hosted withholding. C2 already sets the default:
  nothing is "clearly not personal UGC" because no marker and no project
  terms exist. Flip `reminders.test.ts:164` only if the owner rules to stop
  those events running.
- New i18n strings need EN plus provisional SO twins; the SO past-card label
  is pinned by a component test.

**Rollback:** the inverse migration, then revert the app. Cover **objects** in
public `post-media` are A5b's scope (`event_cover` is not in today's purge
kinds).

### 3.5 Old digests

**Recommended: the award-precedent re-render.** This is reversible
redaction of a derived copy, and only the few affected posts change.

- A lifecycle sweep step does a direct service-role update, guarded by
  `source='ai'` and keyed by `digest_editions.pinned_post_id`. It
  re-renders the body with `renderDigestPost` over the payload minus the
  items whose author, owner or sole host was deleted.
- It must never go through `PATCH /api/posts/[id]`, which writes
  `post_revisions`, and it must handle the "quiet week" branch.
- It is idempotent and writes one content-free audit row per post.
- The untouched payload is the rollback source: re-render with every item.
- The send path applies the same filter before `renderDigestEmail` on a
  resumed send.
- `/p/[id]` reads posts under the caller's RLS
  (`apps/web/src/app/p/[id]/page.tsx:85-89`), so the rewrite governs
  permalinks too.
- Extending the sweep flips `sweeps.test.ts:175,198` (the counts shape).

**Alternatives:**

- A status flip on the affected posts.
- Time-boxing every non-current digest post.
- **Not recommended:** a RESTRICTIVE `posts` policy with a SECURITY DEFINER
  predicate that parses `digest_editions.payload` per row. `posts` is the
  feed's hottest table, and that policy is a performance and regression risk.

**Also:**

- Neither option touches `digest_editions.payload` or `digest_email_sends`,
  and sent emails cannot be recalled.
- **Owner question:** are Win/Ask titles bodies (doctrine §4) or existence
  metadata? If they are metadata, this item drops out.
- Dev (live production) has 0 editions, so a fixture is needed.

### 3.6 Stored snapshots and permanent tables (C4)

- **`report_snapshots` / `moderation_reviews`:**
  - `moderation_reviews.content_excerpt` holds up to 500 characters of a
    post, comment **or event** (title + description) whenever the AI
    pre-scan flags or is unsure (`apps/web/src/lib/moderation/scan.ts:31`).
    It is a restricted stored copy of the author's body.
  - Column scope for `authenticated` in the repo pattern: **revoke table
    SELECT, then re-grant** (`report_id`, `entity_type`, `entity_id`,
    `created_at`) and the review metadata. A column-level revoke alone is a
    no-op under a table-level grant (the profiles/events/verifications
    precedent). Every app reader already uses the service role.
    `phase2-plaza.test.ts:496` (`select *` on `moderation_reviews` as a
    member) flips to permission-denied.
  - The report route snapshots any post, comment or message by id through
    the service role, with no reader-visibility or subject-deleted check
    (`apps/web/src/app/api/reports/route.ts:55`). So every new report of a
    deleted member's content creates a new immutable full-body copy (owner
    question §5).
  - Optional (owner; off by default): the admin projection shows a
    placeholder for **closed** reports whose subject is deleted, unless a
    hold or open dispute applies. The row itself remains the restricted
    evidence.
  - Optional (owner): a BEFORE DELETE guard on `report_snapshots` and
    `work_event_attestations`. Service-role DELETE is unguarded today, so a
    guard stops evidence being destroyed outside a sanctioned purge. This is
    hardening, not deletion.
  - Rollback: re-grant table SELECT. Add a `has_column_privilege` test that
    `captured_body` and `content_excerpt` are unreadable by `authenticated`.
- **Reviewer notes (`candidate_reviews.notes`)** — owner ruling, 12 Sep:
  notes containing deleted-member personal data are restricted metadata.
  - Today they are readable wherever the candidate is readable
    (`candidate_reviews_select_visible` → `can_read_candidate`), including
    over PostgREST.
  - R1b: revoke table SELECT, then re-grant every column except `notes`.
  - Serve notes through the service-role review projection. Withhold them
    from member surfaces when the reviewer is deleted, and when the candidate
    creator is deleted (the notes may describe them).
  - Reviewers and mods keep restricted read. Live reviewers' decline/park
    reasons (`status_reason`, the §17 transparency) are unchanged.
  - Tests: `has_column_privilege` false for `notes`; the projection's
    deleted-reviewer and deleted-creator cases.
- **Venture ledger (`work_events.note`):** an append-only side table
  `work_event_suppressions(work_event_id, reason, created_by, created_at)`,
  **outside** the hash chain.
  - Revoke table SELECT on `work_events` from `authenticated`, then
    re-grant every column except `note` (a bare `SELECT(note)` revoke is a
    no-op under the table grant).
  - The side table must itself satisfy the schema contracts: RLS on, plus
    the restrictive lifecycle gate unless all privileges are revoked
    (`migrations.test.ts:45`). The same applies to any future hold or
    overlay table.
  - The trail and CSV export read the note through the service role or a
    gated RPC, suppressed when `recorded_by_user_id` is deleted or an overlay
    row exists.
  - `verify_work_chain` still verifies the stored row, and no
    `work_events` row is ever updated. The overlay is C4's append-only
    suppression-event log. Optionally, a new in-chain event type can also
    record each suppression tamper-evidently (a schema change). The hashed
    `note` itself stays (`20260813000100_maal_venture.sql:223`).
- **`audit_logs` + Sentry:** forward-only minimisation. New email-suppression
  rows store `sha256(lower(email))`, the domain and the provider email id, not
  the address. Existing rows need a legal-gated append-only overlay (R2).
- **Notifications:** covered in §3.2. Notifications have no retention at
  all; they are a derived copy that follows its source's class.

## 4. R2 — later, legal-gated (listed, not designed)

Each R2 step needs explicit owner approval, legal review, a written rollback
(or an honest statement that none exists), content-free per-item audit rows,
and a legal-hold check.

- Body overwrite at the day-365 anchor: posts, comments, revisions, drafts,
  messages, `lab_*`, events, listing contact, venture tasks, candidate pitch.
- Media purge (A5b), widened to **every** UGC kind in the public
  `post-media` bucket, not just event covers. Today only `avatar`/`cover`
  are purged (`apps/web/src/lib/lifecycle/media-cleanup.ts:44`). A deleted
  member's Plaza images, listing photos, event covers, Space icon/cover and
  candidate logo/cover stay fetchable at raw URLs that embed the uploader's
  id. Add `dm-media` voice. R1b cannot suppress objects (no object
  mutation).
  - **Owner ruling (12 Sep):** this is accepted **only as an explicitly
    recorded residual risk** — **KNOWN RESIDUAL LEAK, not complete until the
    purge or access-control change is done**, and never described as
    deletion-compliant.
  - It is recorded in code as `PUBLIC_MEDIA_RESIDUAL`.
  - R1b removes or suppresses normal UI/API references and stops new
    surfacing where feasible.
  - The purge itself needs an inventory, rollback/impact notes and legal
    review.
- Hash the plaintext identifiers: `signup_grants`, `waitlist_entries`,
  `digest_email_sends`, `email_suppressions`.
- A day-365 purge job with a legal-hold flag. This is **in-place
  anonymisation, not row deletion**: hard-deleting `users` or the GoTrue
  identity is blocked by NO ACTION FKs from immutable tables. That holds for
  **every** self-deleted member, because the deletion request itself writes
  an immutable `audit_logs` row naming them.
- Sanctioned purge paths for immutable tables:
  - an `audit_logs` overlay;
  - a guarded `report_snapshots` purge function;
  - a `work_events` chain v2 that hashes `sha256(note)`, so plaintext can
    later be dropped without breaking verification.
- The GoTrue identity at day 365, if the provider supports it.
- Notification retention.

## 5. Open owner/legal questions

1. **DMs:** row-hide (recommended) or a column-scoped body grant for direct
   reads? Should moderation-removed DMs get the same DB-level suppression?
2. **Notification previews:** stop writing them, plus hide (recommended) or
   strip the existing rows from deleted actors?
3. **Pending requests from a deleted initiator:** a decline-only card, or
   hidden from the inbox and badge? And should the 30-day request sweep keep
   hard-deleting them, or defer to the ≤365-day restricted class?
4. May a counterparty report a suppressed message after deletion? That
   starts a new immutable copy.
5. **Events:** organisation-owned events were ruled on 12 Sep (§3.4): only
   when clearly recorded; ambiguous events are suppressed. Still open:
   - which shell fields beyond title/date/status/tombstone host (category,
     mode, attended count)?
   - past shells listed, or permalink-only?
   - anon shell or 404?
   - Space-hosted events by a deleted creator: withhold bodies (proposed);
     keep running?
6. **Space history:**
   - does the decision shell show its title?
   - may the Space audience see "Deleted member" in the History tab?
   - should the API return shells or omit rows?
   - should mod read be purpose-bound?
7. **Out of this slice, needing their own rulings:** venture task titles and
   candidate pitch fields by a deleted creator. Candidate visibility also
   interacts with Xidig Plus ruling B.
8. **Old digests:** the award-style re-render of the derived post
   (recommended), a status flip, or time-boxing? Are titles bodies?
9. **`report_snapshots`:** hide closed, deleted-subject bodies from mods
   before day 365? What sets and clears a legal hold, and where does it live?
10. **Ledger notes:** approve the side-table overlay (C4)? Is a chain v2 with
    a note commitment acceptable as the enabler for a future purge?
11. **Audit/Sentry:** approve forward-only hashing of suppression emails?
12. **Class map:** confirm `@xidig/db/retention`, the anchors, and "day 365 =
    in-place anonymisation".
13. **Counts:** should reactions, support, poll, endorsement, vouch,
    follower, award-vote and attestation counts exclude deleted members?
    (Each count is gated separately.)
14. **Reviewer notes** were ruled on 12 Sep: notes with deleted-member
    personal data are restricted metadata. Still open: the R1b mechanism
    (withhold a deleted reviewer's notes from member projections, and a
    column scope on `candidate_reviews.notes`) must be squared with the §17
    decline/park-reason transparency, which stays for live reviewers.
15. **Public media** was ruled on 12 Sep: accepted only as a recorded KNOWN
    RESIDUAL LEAK until the purge or access-control change.
