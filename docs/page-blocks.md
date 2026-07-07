# Page blocks — block-style profile & Space layouts (design + groundwork)

Status: **schema shipped in `20260706300000_experience_expansion.sql`; renderer/editor deferred to a later version.** This doc is the contract future phases build against.

## What this is

Facebook/LinkedIn-style composable page sections for profiles, Spaces (Club/Lab), and
Candidates: an ordered list of **typed blocks** (text, image, gallery, embed, links,
pinned items) that the owner arranges. On wide screens blocks lay out on a grid
(full/half/third spans); on mobile they collapse to a single scroll column in the
same order.

## Verdict on implementation size (asked 6 Jul)

**Easy enough — if and only if it stays a typed-block system.** It is *not* a big
rethink because every hard problem is already solved elsewhere in the app:

| Concern | Already solved by |
| --- | --- |
| Media in blocks (image/gallery/video) | MediaSlot + the media pipeline (`kind='block'` reserved in `media_kinds`) — Lite mode works inside blocks for free |
| Embeds | `lib/embeds.ts` allowlist + `EmbedFrame` sandbox |
| Text formatting | Same sanitized subset the composer uses (no raw HTML, ever) |
| Permissions | Owner-manage / visibility-scoped read RLS, same predicates as labs (`can_read_lab`) |
| Ordering/limits | `position` + unique constraint, like `profile_pins` |
| Mobile vs desktop | Pure CSS: grid with `span` hints ≥900px, single column below — no separate mobile model |

What **would** make it a big rethink (deliberately excluded from the contract):
free-form HTML blocks, arbitrary nesting/columns-in-columns, per-block custom CSS,
or third-party widget embeds. Those turn a content model into a page builder —
moderation surface, XSS surface, and design-coherence costs explode. Don't.

## Schema (shipped)

- `block_types` lookup (slug PK): `text`, `image`, `gallery`, `embed`, `links`,
  `pinned_items`. New block type = one INSERT + a renderer entry (no migration).
- `page_blocks`: `owner_type` (`profile` | `lab` | `candidate`) + `owner_id`,
  `block_type`, `position`, `span` (`full` | `half` | `third`), `config jsonb`,
  `visibility` (`public` | `members` | `private`), timestamps.
  Unique `(owner_type, owner_id, position)`. RLS: reads follow the owner's
  visibility model; writes API-only.

### `config` shapes (versionless by convention — additive keys only)

- `text`: `{ "body": string /* sanitized subset, same rules as post bodies */, "heading"?: string }`
- `image`: `{ "mediaId": uuid, "path": string, "thumbPath": string, "blurhash": string, "alt": string, "caption"?: string }`
- `gallery`: `{ "items": [image-config, …] /* ≤8 */ }`
- `embed`: `{ "url": string /* must pass the embeds allowlist at write time */ }`
- `links`: `{ "items": [{ "label": string, "url": string }, …] /* ≤10 */ }`
- `pinned_items`: `{ "refs": [{ "entityType": "post"|"lab"|"listing", "entityId": uuid }, …] /* ≤3, hydrated + visibility-checked at render */ }`

Server validates `config` against the block type's Zod schema at write time; render
is data-driven (never `dangerouslySetInnerHTML`).

## Renderer contract (build when surfacing)

- `components/blocks/block-renderer.tsx`: `<BlockRenderer blocks prefs viewer>` maps
  `block_type` → component via a registry object. Unknown type → render nothing
  (forward compat).
- Layout: CSS grid, 6 columns ≥900px (`full`=6, `half`=3, `third`=2), one column
  below. Order = `position` in both layouts (mobile is "just scroll" by design).
- All media inside blocks goes through **MediaSlot** — Lite mode defers bytes with
  (Show / Muuji) exactly like everywhere else. This is non-negotiable (§22).
- Default page = current fixed layout expressed as implicit blocks; a profile with
  zero `page_blocks` rows renders exactly what it renders today. Blocks are additive
  polish, not a migration burden on existing members.

## Rollout plan

1. **v1.0 (done):** schema + RLS + negative tests. No UI.
2. **v1.0.x (cheap):** read-only renderer on profile/Space pages below the existing
   header card; API `PUT /api/me/profile/blocks` (and lab equivalent) with
   fixed-order add/remove/reorder via up/down buttons — no drag-drop.
3. **v1.1:** drag-drop editor, span picker, live preview. This is the only genuinely
   new UI investment, and it's isolated to the editor.

## Anti-gaming / safety notes

- Embed blocks re-validate against the allowlist server-side (a saved block must not
  outlive an allowlist removal — re-check at render).
- `pinned_items` hydrate through RLS at render: pinning something you later lose
  access to (private Lab) renders nothing rather than leaking.
- Block text runs the same AI pre-scan lane as posts when surfaced (write-time scan,
  `moderation_reviews` reuse) — add before enabling the editor for members.
