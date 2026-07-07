# RLS note — unified Following feed (`following_feed`)

Source: `packages/db/supabase/migrations/20260708000000_following_feed.sql`.
Consumed by `GET /api/me/feed`.

## What it is

`following_feed` is a **`security_invoker` view** that unifies the three
Following-feed item types (§13) into one keyset-pageable source:

| column      | type          | meaning                                                            |
| ----------- | ------------- | ----------------------------------------------------------------- |
| `item_type` | `text`        | `'post'` \| `'lab_update'` \| `'listing'`                          |
| `item_id`   | `uuid`        | row id in its own table (`posts` / `lab_updates` / `business_listings`) |
| `sort_ts`   | `timestamptz` | underlying row's `created_at` — the feed ordering key             |
| `lab_id`    | `uuid`        | source lab for `lab_update` rows (else `null`); saves a lookup    |

Keyset: `ORDER BY sort_ts DESC, item_id DESC`, page with
`(sort_ts, item_id) < (:before_ts, :before_id)`. The API hydrates each row by
`(item_type, item_id)` under the caller's RLS (posts via plaza views, lab
updates via labs views, listings via listing-view).

## Union sources

1. **posts** authored by users the caller follows (`follows.target_type='user'`).
2. **lab_updates** in labs the caller **follows** (`follows.target_type='lab'`)
   **or is an active member of** (`is_lab_member`).
3. **listings** from followed users — reuses the existing `following_listings`
   (`security_invoker`, published-only) view.

Comments/replies are deliberately **not** feed items (too noisy; not a standard
feed unit — sprint decision, 8 Jul).

## Why it's privacy-safe

`security_invoker = on` means every underlying table is read under the
**caller's** RLS — the same policies the rest of the app already trusts. The
view adds no visibility of its own; it can only ever narrow what those policies
already permit.

- **Hidden / removed content** never appears: `posts_select_visible`,
  `lab_updates_select_readable`, and `following_listings` all filter to
  `status='published'` (plus author/mod self-view, which is correct).
- **Private-lab updates never leak.** A caller who *follows* a private lab but is
  **not a member** fails `can_read_lab(lab_id)`, so
  `lab_updates_select_readable` returns zero rows for them — the follow row
  cannot override RLS. Membership (`is_lab_member`) is what grants read.
- **Own follow/mute/block rows only.** The `follows`, `mutes`, and `user_blocks`
  joins are correlated to `auth.uid()` and each table is own-rows under RLS, so
  no cross-user data is reachable.

## Personal exclusions (layered on top of RLS)

These are the caller's private-feed preferences (§4.5), enforced with
`NOT EXISTS` against the caller's own rows:

- muted **users** (`mutes.entity_type='user'`) → their posts / updates / listings out
- muted **labs** (`mutes.entity_type='lab'`) → that lab's updates out
- muted **tags** (`mutes.entity_type='tag'`) → posts carrying the tag out
- **blocked users** (`user_blocks.blocked_user_id`) → their posts / updates / listings out

RLS handles *visibility* (can this caller see this row at all); the exclusions
handle *preference* (the caller can see it but chose to filter it). Both must
hold for a row to appear.

## Tests

`packages/db/src/following-feed.test.ts` (embedded Postgres) proves: followed
post/update/listing surface; lab members see updates without a follow; a private
lab's update does not leak to a non-member follower; muted user/tag/lab and
blocked user are excluded; keyset boundary has no gap/dup; 6 playbooks seeded.
