# Deletion-retention doctrine — class map, conflicts and first slice

**Status:** audit/design only (12 Sep 2026). No migration, no data change. It
implements nothing destructive; it records the owner's new doctrine and maps
what it means for this codebase. **Partial containment only. Deletion
compliance is NOT claimed**: implementation, legal review and a provider
erasure path for GoTrue phone numbers are all incomplete.

**Authority:** the owner-edited Notion PRD "PRD Relook — Xidig: Social &
Collaboration Platform", §24 (updated 12 Sep). Where this doctrine conflicts
with earlier repo records, **the owner-edited PRD wins**. Superseded records
are listed at the end.

## 1. The doctrine (owner-locked, 12 Sep)

After **final** account deletion (the end of the 30-day grace, when
`anonymise_user` runs):

1. **Remove or suppress** the deleted member's UGC **bodies and media**, and
   their **public identity**, from normal product surfaces.
2. **Retain restricted platform-security/trust metadata for up to 1 year.**
   It may include:
   - account/user id and deletion timestamp;
   - auth-provider identifiers, including the retained phone where the
     provider offers no supported erasure;
   - email hash, pseudonym or prior auth identifiers where needed;
   - device, session and security indicators;
   - moderation, report and appeal records;
   - verification, vouch and anti-Sybil references;
   - audit references;
   - payment/entitlement metadata where legally required;
   - content-existence metadata: type, timestamps, and target
     Space/event/listing.
3. Metadata does **not** include full authored bodies or media unless a
   restricted dispute, safety or legal-hold purpose separately justifies it.
4. Retained metadata is **not public**, **not searchable by ordinary users**,
   **not used for ranking or marketing**, and **not shared with partners**
   unless legally required or explicitly approved.
5. **After 1 year:** purge or further anonymise, unless a documented legal
   hold, statutory duty, unresolved safety case or active dispute requires
   longer.

This **supersedes** earlier retained-content assumptions wherever they
preserved a deleted member's full authored content as normal tombstone
history.

## 2. What final deletion does today (branch `claude/retained-content-projection` @ `7162c1c`)

- `anonymise_user` scrubs the **profile** to the tombstone ("Deleted member",
  `deleted_<hex>`), deletes six profile satellite tables, nulls avatar/cover
  alt text, nulls `users.email`/`phone`, flips the status to `deleted`, and
  writes one audit row. The profile then freezes.
- **Sweep:**
  - (b) GoTrue: banned, and email pseudonymised to
    `deleted-<uuid>@deleted.invalid`. The **phone cannot be cleared.**
  - (c) Avatar/cover storage objects are purged.
  - (e) Award result posts that named a deleted winner are redacted.
  - (d) Expired verification recordings are nulled; this is time-based, not
    deletion.
- **Triggers:** live API keys and push subscriptions are revoked.
- **Projection containment** (998f991, 82daa4c, 7162c1c):
  - Listings are suppressed.
  - Upcoming member-hosted events are delisted.
  - Award names are removed.
  - Deleted accounts are removed from the leaderboard and ballot.
  - The waitlist withholds their contact details.
  - DM start, reply and accept to a deleted account are refused.
- **Everything else authored by the member stays in its rows.**
  `users.id` is never deleted and neither is the GoTrue identity, so no
  `ON DELETE` rule ever fires.

## 3. Retention class map

Keys:

- **R** = remove the body/media at final deletion (destructive; needs a
  sanctioned slice).
- **S** = suppress from normal surfaces (projection; reversible).
- **M** = retain as restricted metadata ≤ 1 year.
- **L** = longer only with a documented legal/statutory/safety/dispute
  reason.
- **?** = owner or legal decision needed.
- **✗** = conflicts with the current implementation.

### Identity & auth

| Data                                                                                                                     | Doctrine class                                      | Today                                                   | Status                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `profiles` presentation (name, handle, bio, links, avatar/cover paths)                                                   | R                                                   | scrubbed to tombstone + frozen                          | aligned                                                                                             |
| profile satellites (open-to, pins, modules, showcase, link meta)                                                         | R                                                   | rows deleted                                            | aligned                                                                                             |
| `users` row (id, status, role, suspension/deletion history, auth-cleanup state)                                          | M (1y), then further anonymise                      | kept indefinitely                                       | ✗ no 1-year step                                                                                    |
| GoTrue identity: pseudonymised email                                                                                     | M                                                   | kept indefinitely                                       | ✗ no 1-year step                                                                                    |
| **GoTrue phone number**                                                                                                  | **M (restricted), pending a provider erasure path** | **retained**: null/empty/omit all no-op at the provider | **classified as restricted metadata**; ? whether a hard `deleteUser` at day 365 is acceptable/works |
| `signup_grants` / `waitlist_entries` plaintext email/phone                                                               | M as **hash/pseudonym**, not plaintext              | plaintext kept (the admin view withholds it)            | ✗                                                                                                   |
| `email_suppressions` (email PK), `digest_email_sends.email`                                                              | M/L (deliverability/legal) as hash where possible   | plaintext                                               | ? / ✗                                                                                               |
| `consent_records`                                                                                                        | L (legal record)                                    | kept                                                    | ? retention period                                                                                  |
| `api_keys` (revoked; member-chosen `name`), `push_subscriptions` (revoked; endpoint + key material), `webhook_endpoints` | M; purge key material/endpoint                      | revoked, material kept                                  | ✗ material not purged                                                                               |
| `auth_email_tokens`                                                                                                      | M                                                   | purged after 24h                                        | aligned                                                                                             |

### Plaza

| Data                                             | Class                                            | Today                                                          | Status                                          |
| ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------- |
| `posts` title/body/link                          | S now → R                                        | rows kept; hidden from members (`author_is_active`); mods read | S aligned; ✗ bodies retained in rows            |
| `posts.image_urls` (public `post-media`)         | R                                                | **files publicly fetchable**                                   | ✗ → **A5b**                                     |
| `comments.body`                                  | S → R                                            | kept; hidden                                                   | as posts                                        |
| `post_revisions` (old bodies)                    | R (or L if tied to a report)                     | kept; author/mod read                                          | ✗                                               |
| `post_drafts` (unpublished bodies)               | R                                                | kept                                                           | ✗                                               |
| `poll_options` labels                            | S with parent post                               | follows post visibility                                        | aligned (S)                                     |
| reactions, poll votes, cosigns (support), offers | M (existence) — **must not feed counts/ranking** | kept; **reaction/support/poll counts include them**            | ? whether counts should exclude deleted members |

### DMs

| Data                                                                  | Class                                              | Today                                                                                    | Status                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `messages.body` **sent by the deleted member**                        | S → R (the counterparty's own messages are theirs) | **the counterparty still reads the full history**; `dm_inbox.last_message_body` shows it | **✗ conflicts with the 12 Sep ruling "preserve existing DM history"** — ? owner |
| DM voice notes (private `dm-media`)                                   | R                                                  | counterparty can still play them (signed URL)                                            | ✗                                                                               |
| `conversations`, `dm_read_states`, declines, blocks                   | M                                                  | kept                                                                                     | aligned (1-year step missing)                                                   |
| notification payload previews (DM excerpts in OTHER members' inboxes) | S → R                                              | kept                                                                                     | ✗                                                                               |

### Spaces / ventures / capital

| Data                                                                 | Class                                                                | Today                                                                                   | Status                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `lab_updates` title/body                                             | S → R; M = existence (type, time, Space)                             | **visible to the Space audience and on the public page** (998f991 `author_is_retained`) | **✗ conflicts with 998f991**                                                 |
| `lab_decisions` (title/context/decision)                             | ? — a Space governance record may justify L                          | visible (998f991)                                                                       | **✗ / ? owner**                                                              |
| `lab_artifacts` (title/url/description)                              | S → R                                                                | visible (998f991)                                                                       | **✗**                                                                        |
| Spaces the deleted member **led** (name, descriptions, icon/cover)   | ? — collective Space content vs personal UGC                         | kept; the lead stays the tombstone; no transfer exists                                  | ? (gated: lead transfer)                                                     |
| `lab_members` rows                                                   | M                                                                    | kept `active`; rosters and counts include them                                          | ? (gated: roster/count)                                                      |
| `work_events.note` (≤ 400 chars), attestations                       | ? — **append-only hash chain; update/delete refused for every role** | kept                                                                                    | **✗ needs a redaction overlay design** (never break the chain) — owner/legal |
| `venture_tasks.title`                                                | S → R                                                                | kept                                                                                    | ✗                                                                            |
| `venture_candidates` pitch fields + logo/cover                       | S → R (?)                                                            | kept; `can_read_candidate` has no creator check                                         | ✗ / ?                                                                        |
| `candidate_reviews.notes` (reviewer), `candidate_votes`, `interests` | M (review/governance/intent records)                                 | kept; tallies count them                                                                | ? (Q2 excluded)                                                              |
| `capital_gate_evaluations`                                           | L (compliance log, immutable)                                        | kept                                                                                    | Q2b — out of scope                                                           |

### Listings & events

| Data                                                               | Class                    | Today                                                                                        | Status                                                             |
| ------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| listing text fields + **`contact_links`** (member-derived contact) | S (done) → R for contact | suppressed everywhere; rows kept; mods read                                                  | S aligned; ✗ contact retained                                      |
| listing photos (public `post-media`)                               | R                        | **publicly fetchable**                                                                       | ✗ → **A5b**                                                        |
| `listing_claims.evidence`                                          | M (trust evidence)       | kept                                                                                         | aligned                                                            |
| `events` description/agenda/venue/online URL/cover                 | S → R                    | **the detail page still renders them** for upcoming (delisted) AND past events; cover public | **✗ conflicts with 998f991 "past events keep a tombstone record"** |
| `event_rsvps`                                                      | M                        | kept; host list and counts include them                                                      | ? (gated)                                                          |

### Awards, reputation, trust

| Data                                                             | Class                                                     | Today                                                          | Status                           |
| ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| award result post bodies                                         | R of name                                                 | redacted to tombstone (82daa4c)                                | aligned                          |
| `award_results`, `award_votes`                                   | M                                                         | kept; **tally counts deleted voters**                          | ? (gated)                        |
| `user_badges`, `reputation_events/scores`                        | M; **never ranking**                                      | kept; leaderboard excludes deleted; tombstone hides chips      | aligned (S); 1-year step missing |
| `skill_endorsements`, `vouches`                                  | M (anti-Sybil references); **must not feed trust counts** | **counts on live profiles include deleted endorsers/vouchers** | ✗ / ? (gated vouch threshold)    |
| `verifications` (+ recording pointer), `verification_access_log` | M/L                                                       | kept; recording nulled on its own expiry                       | aligned; 1-year step missing     |
| `mentor_residencies`                                             | M                                                         | current-mentor view has no status check                        | ? (gated)                        |

### Moderation, audit, security

| Data                                                                                               | Class                                                                                            | Today                  | Status                                                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------- |
| `reports`, `mod_actions`, `appeals` (incl. appellant text), `moderation_reviews` (content excerpt) | M/L (safety/dispute record)                                                                      | kept                   | aligned in intent; the 1-year/hold step is missing                     |
| **`report_snapshots.captured_body`** (full bodies)                                                 | L only while a safety/dispute purpose exists — **the justified exception** for restricted bodies | kept; update forbidden | ? a sanctioned purge path is needed (immutability)                     |
| `audit_logs` (immutable; **email address inside email-suppression metadata**)                      | M/L                                                                                              | kept; immutable        | ✗ plaintext email in metadata; needs a sanctioned purge/redaction path |

### Media, derived copies

| Data                                                    | Class                           | Today                                                                   | Status                                                      |
| ------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| public `post-media` (every kind except avatar/cover)    | R                               | **fetchable at raw public URLs**                                        | ✗ → **A5b** (CDN copies persist until they expire — say so) |
| `media_uploads` rows (`alt_text` for non-avatar kinds)  | M (existence) / R (alt text)    | kept                                                                    | ✗ alt text                                                  |
| `digest_editions.payload` + pinned digest post (titles) | S → R                           | frozen snapshots never revisited                                        | ✗ (gated: old digests)                                      |
| search                                                  | S                               | people/listings/posts exclude deleted; Space search has no author field | aligned                                                     |
| export                                                  | n/a                             | own-data only; a deleted account cannot export                          | aligned                                                     |
| follows/bookmarks/mutes                                 | M; must not feed visible counts | follower counts include deleted followers                               | ?                                                           |

## 4. Conflicts with shipped retained-content behaviour (explicit)

| Shipped                                                                                                                                               | New doctrine                                                    | Needed                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **998f991** `author_is_retained`: a deleted member's Space updates, decisions and artifacts stay visible to the Space audience and on the public page | bodies removed or suppressed                                    | reverse to suppression, keeping **existence metadata** (e.g. "An update by a deleted member was removed", with date) — a reversible policy + projection change. Decisions need an owner ruling. |
| **7162c1c / 12 Sep ruling** "preserve existing DM history with tombstone attribution"                                                                 | a deleted member's DM bodies and voice notes suppressed/removed | **owner ruling**: suppress the deleted member's messages in the counterparty's thread (placeholder + time) while keeping the counterparty's own messages?                                       |
| **998f991** past member-hosted events keep a tombstone record (description, agenda, cover)                                                            | bodies/media suppressed                                         | suppress description/agenda/cover; keep title? date? — owner ruling on how much counts as "existence metadata"                                                                                  |
| **82daa4c** award result posts redacted to the tombstone                                                                                              | aligned                                                         | none                                                                                                                                                                                            |
| old digest editions                                                                                                                                   | titles of deleted members' content are bodies                   | gated decision (rewrite vs projection on read)                                                                                                                                                  |
| listing photos / public media                                                                                                                         | media removed                                                   | **A5b**                                                                                                                                                                                         |

## 5. Proposed first safe slice — R1: class map + non-destructive suppression

**Goal:** make the doctrine true on normal product surfaces **without
destroying data**. Everything in R1 is a projection/policy change that one
revert undoes.

1. **Retention class map as code**: `lib/retention/classes.ts` exporting
   `RETENTION_WINDOW_DAYS = 365` and a table/column → class map. Plus a
   schema-enumerating **coverage contract test** (the pattern of
   `account-deletion-privacy.test.ts`) that fails on any member-linked table
   or body/media column left unclassified. This makes the 1-year policy
   visible in config and blocks silent drift.
2. **Suppression, deleted authors only** (suspended/deactivated unchanged):
   - **Space history:** replace `author_is_retained` with body suppression.
     Rows stay readable for existence metadata; bodies are withheld in every
     projection and rendered as "Removed — the author deleted their account"
     with the date. Decisions: pending an owner ruling (default proposal:
     suppress like updates).
   - **Events:** past and upcoming member-hosted events with a deleted host
     render title-less existence metadata, or title + date only (owner
     ruling); description, agenda, venue, cover and online URL are withheld.
   - **DMs** (if the owner rules so): the deleted member's messages render as
     a placeholder in the counterparty's thread and inbox preview, and voice
     playback is refused.
   - **Notification previews:** payload excerpts from a deleted actor are
     redacted at read time.
3. **Restricted-metadata register:** document which admin/security surfaces
   may read retained metadata. Guard ordinary search and ranking with tests
   (ranking already excludes deleted members; extend the rule to endorsement,
   vouch and follower counts under their own rulings).

**Rollback:** revert the R1 commit; no data changed. **Audit:** R1 writes
nothing. Every later destructive step (R2) must write one audit row per item,
without content.

**R2 (later, needs explicit approval):**

- at final deletion, overwrite body columns (posts, comments, revisions,
  drafts, messages, lab_\*, events, listing contact, venture tasks, candidate
  pitch);
- purge media (A5b);
- hash plaintext emails/phones in grants, waitlist, digest sends and
  suppressions;
- a **day-365 purge job** with a legal-hold flag;
- a **sanctioned purge path** for immutable tables (audit, report snapshots,
  work_events overlay) — legal;
- the GoTrue identity at day 365 (hard delete, if the provider supports it).

## 6. Acceptance criteria (design)

- **Bodies and media:** after final deletion, no normal product surface or
  API returns the deleted member's UGC body or media, unless a listed
  justified exception applies (restricted report snapshots).
- **Metadata is restricted:** retained metadata is readable only by the
  listed admin/security surfaces. It never appears in search, ranking,
  marketing, digests or partner APIs (tested).
- **1-year policy:** `RETENTION_WINDOW_DAYS = 365` exists in config, the
  class map covers every member-linked table (contract test), and a day-365
  step is designed with a legal-hold override.
- **GoTrue phone:** explicitly classified as restricted metadata pending a
  provider erasure path. It is never displayed, searched or exported.
- **No compliance claim:** nothing claims deletion compliance until R2, the
  provider path and legal review are complete.

## 7. Superseded records

These are superseded by the owner-edited PRD (12 Sep) wherever they preserve
a deleted member's full authored content:

- the 11 Sep retained-content ruling "Space updates remain as Space history
  with tombstone attribution" (implemented in migration `20260911001100` and
  commit 998f991);
- the 12 Sep ruling "preserve existing DM history with tombstone attribution"
  (7162c1c);
- 998f991's "completed public events may retain tombstone hosts" **for the
  event body**;
- `lib/lifecycle/anonymise.ts:19-22`, which states that posts, messages,
  listings and events are "deliberately untouched";
- the reconciliation Addenda X–Z and the Handoff entry, where they describe
  that history as the target end state.

These stay as history. The target end state is this doctrine.
