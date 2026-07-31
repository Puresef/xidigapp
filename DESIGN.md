# Xidig UI design standard

> **Provenance.** This document encodes the 31 Jul Phase 00 decision: the
> design target is always the full-quality experience; Lite ("Xawli yar") is a
> byte-delivery mode. It was synthesized in-repo because the corrected Notion
> UI Spec was not reachable from the authoring session — when Notion access is
> available, diff this file against the UI Spec's DESIGN.md block and
> reconcile.

The doc a build agent reads before touching UI. Normative companions:
[`docs/lite-mode.md`](docs/lite-mode.md) (MediaSlot / Lite contract),
[`docs/brand-direction.md`](docs/brand-direction.md) (brand rulings),
[`docs/i18n.md`](docs/i18n.md) (strings). Tokens and shared classes live in
`apps/web/src/app/globals.css` (naming: `xidig-<block>__<element>--<modifier>`).
Components live in `apps/web/src/components` (not `packages/ui` — repo
convention).

## 1. Design target

- **Full-quality is always the target.** Every surface is designed rich by
  default. "Keep it basic, some members are on 2G" is a forbidden argument —
  Lite is never a design ceiling.
- **Lite mode is a byte-delivery mode.** It changes *when bytes move*
  (deferred behind an explicit tap via MediaSlot), never *what exists*.
  Identical layout, identical features; placeholder instead of payload.
- Never cut, hide, or simplify a feature for bandwidth. Never
  `if (lite) return null` around media. Never gate a feature — especially a
  write path — on Lite.
- If a build instruction conflicts with this bar, **flag it instead of
  building low** (standing instruction in [`claude.md`](claude.md)).

## 2. Tokens

Every token is defined twice: light in `:root`, dark under
`[data-theme='dark']` (cookie `xidig_theme`, no-FOUC script in
`app/layout.tsx`). Never hardcode a hex in component CSS where a token exists.

### Palette

| Token                                | Light                   | Dark                        | Role                                          |
| ------------------------------------ | ----------------------- | --------------------------- | --------------------------------------------- |
| `--x-bg`                             | `#f2f5fa`               | `#0a0e1a`                   | Page canvas (dawn sky / ink night sky)        |
| `--x-surface`                        | `#ffffff`               | `#101828`                   | Cards, panels                                 |
| `--x-surface-2` (+ `--x-shadow-2`)   | `#ffffff` + shadow      | `#16203a`                   | Raised layer: menus, pickers, toasts, modals  |
| `--x-fg`                             | `#131c2e`               | `#eef2f9`                   | Body text                                     |
| `--x-muted`                          | `#556075`               | `#a7b3c9`                   | Secondary text (AA on bg *and* surface)       |
| `--x-border` / `--x-border-strong`   | `#d9e0ec` / `#b9c4d8`   | `rgba(151,173,214,.16/.3)`  | Card texture / boundaries                     |
| `--x-accent` (+ `-fg`, `-soft`)      | `#2e78b0`               | `#2e78b0`                   | THE functional accent (fills, rings, links)   |
| `--x-accent-text`                    | `#276a9e`               | `#7ab8e8`                   | Accent as *text/icon* — AA on both surfaces   |
| `--x-trust` (+ `-fg`, `-soft`)       | `#ff8c00` / `#a85700`   | `#ff8c00` / `#ffa733`       | Trust & celebration — reserved (see below)    |
| `--x-ok` / `--x-danger` (+ `-bg`)    | semantic pair           | lightened for dark          | Success / destructive only                    |
| `--x-field-bg` / `--x-field-border`  | `#ffffff` / `#8794a8`   | `#0c1220` / 0.55-alpha      | Form fields (3:1 non-text minimum on borders) |

Exact current values: the `:root` and `[data-theme='dark']` blocks in
`apps/web/src/app/globals.css`. That file is the source of truth; this table
is orientation.

### Color rules (duotone discipline)

- **One functional accent.** `--x-accent: #2e78b0` in both palettes — the
  mark's own blue (18 Jul "one sky" decision; white on it 4.75:1). Links,
  primary buttons, focus rings, active states all use it.
- **Trust orange is reserved.** `--x-trust` (#FF8C00 family) marks trust and
  celebration ONLY: Verified (avatar ring/check, listing chip), Wins, Founding
  Member, Garab/Co-sign, Capital entry. Anywhere else it is a violation.
  #FF8C00 on white is 2.33:1 — as *text* use `--x-trust-fg` (`#a85700` light —
  the softer `#b35f00` fails AA at 4.15:1 on the trust-soft chip tint — /
  `#ffa733` dark); pure #FF8C00 only as ring/border or fill-with-ink
  (`#131c2e` on it is 7.30:1).
- **Sanctioned exemptions** (these stay; nothing else does): seeded violet
  `#6d28d9` (`.xidig-tag--seeded`) — the §21 AI/seed provenance marker,
  deliberately outside the duotone so seeded content is unmistakable — and the
  semantic `--x-ok` / `--x-danger` pair.
- **No other hues.** The five-hue post-type chip palette is retired: win →
  trust treatment; update/ask/poll/intro → neutral / accent-soft treatments
  distinguished by label, not hue.
- **Open brand question (flagged, not resolved here):** #0077cc as the
  functional accent was NOT adopted in this pass — the 18 Jul one-sky decision
  holds. The front door still runs orange CTAs; that front-door ≠ app
  divergence is a known open item (front-door files are owned by other
  branches — never touch them from app work).

### Elevation

Three steps, always in order: `--x-bg` (canvas) → `--x-surface` (cards) →
`--x-surface-2` (anything floating above a card: dropdown menus, the reaction
picker, DM menus, toasts, modals). Raised panels pair `--x-surface-2` with
`--x-shadow-2`: in light the surface stays white and the shadow carries the
lift; in dark the surface itself lightens (`#16203a`). Elevation never
inverts — a floating panel must not drop to `--x-bg` in dark mode.

### Radius, spacing, type

- Base tokens: `--x-radius` (10px), `--x-space` (1rem), `--x-max-form`
  (26rem); scale steps come from the `--x-radius-*` / `--x-space-*` /
  `--x-text-*` ramps. A new hardcoded px/rem where a ramp token fits is a
  review flag.
- Display face `--x-display` (Space Grotesk via next/font, shared with the
  front door) for headings and buttons; system stack for body.

## 3. MediaSlot — defer, don't disable

**The normative contract is [`docs/lite-mode.md`](docs/lite-mode.md)** (the
"MediaSlot — the usage contract" section). This section is a pointer, not a
second copy — if they ever disagree, `docs/lite-mode.md` wins.

What it guarantees, in one breath: one component
(`apps/web/src/components/media/media-slot.tsx`) fronts every image, embed
and map tile. When the viewer's prefs defer a category, the slot renders a
~0-byte placeholder — blurhash wash (or the `Avatar` initials disc for
identity), alt label, `~size` estimate, a **Show / Muuji** button — in the
exact layout the real asset would occupy. Reveals are remembered for the
session; media-heavy pages offer show-all (`LiteShowAll`); prefs are granular
(images / embeds / maps / animations) with bundles (`text` / `essentials` /
`everything`). Cookie `xidig_lite` is the rendering source of truth (the
server decides before any bytes move; works signed-out);
`user_settings.preferences.lite` is the signed-in mirror.

Build rule for any new media surface: upload with the right `kind`,
denormalize path + blurhash onto the owning row, render through `MediaSlot`
with real `estBytes`. Never branch layout on Lite.

## 4. States & quality bar

The bar every UI change is reviewed against. "Ships" means in the same
commit, not a follow-up.

### Interactive elements — all four states

- **hover** — house tint: `color-mix(in srgb, var(--x-border) 45%, transparent)`;
- **pressed** (`:active`) — slight darken / `translateY(1px)`;
- **focus-visible** — 2px accent outline (`:focus-visible`, never bare `:focus`);
- **disabled** — flat and muted, no hover response.

### Lists and async surfaces — all three states

- **skeleton** — `.xidig-skeleton*` primitives; the silhouette matches the
  loaded card, shimmer only inside the motion gate (below);
- **empty** — `EmptyState` (`components/empty-state.tsx`): designed message
  plus a next action, never a bare "no results";
- **error** — designed notice (`Banner` pattern) with retry, never a blank
  region or a raw error string.

Reuse before building: `Banner`, `EmptyState`, `LoadingComet`/`LoadingFlap`,
`Avatar`, `MediaSlot`, `ContentSourceBadge`, `SystemNotice`, the toast bus.

### Contrast — regression gate

AA ≥ 4.5:1 for every text/background pair in BOTH palettes. This is a gate,
not a guideline: computed ratios live in CSS comments for non-obvious pairs,
and named token pairs are asserted by test —
`apps/web/src/app/globals-tokens.test.ts` (extend its `PAIRS` table when a
new pair ships) alongside the avatar-disc contrast gate
([`docs/brand-direction.md`](docs/brand-direction.md) item 3). New color
pair → compute the ratio before it lands.

### Typography

Body text measure ≤ ~68ch; body line-height 1.55–1.65. Columns may be
full-width; the *text* measure is capped.

### Bilingual resilience

Layouts must survive ~130% string length (Somali copy runs long). No
fixed-width labels; no truncating a translatable string unless the design
explicitly ellipsizes both languages.

### Motion — double-gated

Every animation/transition respects BOTH `@media (prefers-reduced-motion:
reduce)` AND `html[data-motion='off']` (Settings → Appearance). Skeletons
render as a static tint when motion is off — a shimmer that ignores the gate
is a bug.

### Moderation and seed states — designed chrome

System states render as designed badges/notices, never as text injected into
member content: `SystemNotice` (`components/system-notice.tsx`) for
moderation/system notices, `ContentSourceBadge`
(`components/content-source-badge.tsx`) for AI-seeded provenance (§21 violet
marker). A bracketed "[removed]" inline in a post body is a violation.

### Social honesty

- **Reaction counts stay hidden until the viewer has reacted** — no ambient
  scoreboard on content (`components/plaza/reaction-bar.tsx`).
- **Chronological honesty**: no engagement ranking anywhere. Where ordering is
  a fairness surface, the sort rule is published in the UI next to the list.
