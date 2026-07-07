# RLS summary — Phase 4.5 (experience expansion)

Migration: `packages/db/supabase/migrations/20260706300000_experience_expansion.sql`
Negative tests: `packages/db/src/experience-expansion.test.ts` (15 tests, all green)

Additive only: 14 new tables (3 slug-keyed lookups + 11 content/settings
tables), new columns on `media_uploads` / `profiles` / `business_listings` /
`labs` / `venture_candidates`, and two trigram search indexes. **Every new
table is API-only at the DB layer** — no client `insert/update/delete` grant or
policy exists on any of them; the API (service role, after explicit authz) is
the only writer. `anon` matches no policy (house convention — pre-auth reads go
through server-side service-role projections).

## New columns on existing tables

| Table                | Columns                                                                                  | Client-writable?                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media_uploads`      | `kind` (citext FK→`media_kinds`, default `'post'`), `alt_text`, `blurhash`, `thumb_path` | no (media_uploads was already API-only)                                                                                                                                    |
| `profiles`           | `avatar_path`, `avatar_blurhash`, `cover_path`, `cover_blurhash`                         | **no write grant** — API attaches after validating media ownership + scan; **added to the column-scoped SELECT whitelist** (public identity, same class as `display_name`) |
| `business_listings`  | `opening_hours`, `price_range` (CHECK 1..4)                                              | **yes** — joined the owner insert/update column grants (owner-edited content, same class as `short_description`; PATCH /api/listings/[id] writes user-scoped under RLS)    |
| `business_listings`  | `primary_photo_path/_blurhash/_alt`, `photo_count`                                       | no — denormalized by the photos API (service role) on every photo change                                                                                                   |
| `labs`               | `icon_path`, `icon_blurhash`, `cover_path`, `cover_blurhash`                             | no (labs writes already API-only)                                                                                                                                          |
| `venture_candidates` | `logo_path`, `logo_blurhash`, `cover_path`, `cover_blurhash`                             | no (still fully locked until Phase 5)                                                                                                                                      |

## Lookups (slug citext PKs; new value = one INSERT, zero migration)

| Table           | Seed                                                                                                | SELECT            |
| --------------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| `media_kinds`   | post, avatar, cover, listing_photo, space_icon, space_cover, candidate_logo, candidate_cover, block | any authenticated |
| `open_to_kinds` | cofounding, hiring, hire_me, investing, mentoring, collaborating                                    | any authenticated |
| `block_types`   | text, image, gallery, embed, links, pinned_items                                                    | any authenticated |

## Per-table SELECT policies (all `to authenticated`; writes revoked everywhere)

| Table                | SELECT `using(...)`                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `profile_open_to`    | `true` — readable wherever the profile is (profiles are member-visible)                                    |
| `profile_pins`       | `true` — a pin row exposes only a bare `(type, uuid)` pair; hydration re-checks target visibility API-side |
| `listing_photos`     | parent listing `published OR owner OR is_mod()` (mirrors `listings_select_published`)                      |
| `listing_services`   | same as `listing_photos`                                                                                   |
| `user_settings`      | own row only                                                                                               |
| `notification_prefs` | own rows only                                                                                              |
| `bookmarks`          | own rows only (nobody can enumerate what a member saved)                                                   |
| `post_drafts`        | own rows only                                                                                              |
| `post_revisions`     | post **author** (via `posts` subquery) OR `is_mod()` — the editor of someone else's post gets nothing      |
| `mutes`              | own rows only                                                                                              |
| `page_blocks`        | visibility matrix below                                                                                    |

### `page_blocks` visibility matrix

A block is readable when its **owner surface** is readable AND the block's own
`visibility` admits the caller (`is_mod()` always passes):

- `owner_type='profile'` — `'public'`/`'members'` → any authenticated member;
  `'private'` → the profile owner only.
- `owner_type='lab'` — `'public'`/`'members'` → `can_read_lab(owner_id)` (the
  Space's own §16 Private/Members/Public model already gates who reads the
  Space at all); `'private'` → the Space lead only (draft blocks).
- `owner_type='candidate'` — **parked mod-only until Phase 5** ships candidate
  RLS (same pattern as Phase 2's `lab_id is null` guard). Revisit in the
  Capital phase.

## Declarative caps & integrity

- `profile_pins`: 3-pin cap is schema-enforced — `position` CHECK 1..3 +
  `PK(user_id, position)` + `UNIQUE(user_id, entity_type, entity_id)`.
- `listing_photos` ≤5, `listing_services` ≤20, `post_drafts` ≤10/user: API-layer
  caps (documented in the spec; not expressible declaratively without triggers).
- Polymorphic targets (`profile_pins`, `bookmarks`, `mutes`, `page_blocks.owner_id`)
  follow the `follows`/`reports` precedent: integrity validated at the API layer.
- `user_settings` CHECKs pin `dm_privacy` / `location_granularity` /
  `digest_frequency` / quiet-hour ranges; `preferences` jsonb holds
  client-shaped prefs only (Lite/appearance), never enforcement inputs.
- `notification_prefs` rows are **overrides** of the §26 default matrix —
  absent row = default; GET merges API-side.
- `media_uploads.kind` defaults `'post'` so all pre-existing Phase 2 uploads
  remain valid without a backfill.

## Search support

`posts_title_trgm_idx` (gin, `title gin_trgm_ops`) and `labs_name_trgm_idx`
(gin, `name gin_trgm_ops`) for `/api/search` substring matching. `pg_trgm` was
already installed by `20260705010000_member_search.sql`; the migration still
guards with `create extension if not exists` so it stands alone on a fresh DB.
People/listing search reuses the existing `search_norm` trgm indexes.

## Denial idioms proven by the negative tests

- Policy filters a row → empty result (`toEqual([])`) — B reading A's
  bookmarks/mutes/drafts/settings/notification prefs; stranger reading
  post revisions; hidden-listing photos/services; private profile block;
  private-lab block to an outsider; candidate block to a plain member.
- Revoked write grant → `permission denied` — direct INSERT into **every** new
  table by an authenticated member; UPDATE of own `user_settings`; UPDATE of
  `profiles.avatar_path` / `business_listings.photo_count` /
  `primary_photo_path` by their owners.
- CHECK/PK violations → `profile_pins_position_range`, duplicate-position PK,
  `listings_price_range`, `media_kinds` FK on a bogus kind.
