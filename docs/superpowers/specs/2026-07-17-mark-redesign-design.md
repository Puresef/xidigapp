# Xidig mark redesign — design spec (17 Jul 2026)

*Outcome of the brainstorm with Warya (visual companion, four rounds: direction board → C-tuning board → motion board → scenario assignment). Extends `docs/brand-direction.md` (which records the keep-the-X ruling) and resolves FDS §4.4 W-12's aesthetic half. All decisions below are Warya's picks from rendered candidates, not proposals.*

## 1. The canonical mark — "C2"

The exact current traced geometry (`apps/web/src/app/icon.svg`, the 1,370 B clean trace) with three changes and nothing else:

- **Star scaled 112%** about the star's own center (707, 389) — both woven halves (the right/top piece and the lower-left piece), preserving the weave: the half-shaded top point and the arm-through channel are the mark's fingerprint and survive untouched.
- **Star tones lifted**: `#212121` → `#2f3038` (right/top half), `#222222` → `#33343c` (lower-left half) — the star stops sinking into dark surfaces.
- **The two vestigial specks deleted** (the old `#3981B0`/`#3675A4` fragments).

Arms byte-identical: whole-X body + the two upper shading paths, blues `#2E78B0`/`#2D78B0`. ViewBox `437 119 540 540` unchanged. Byte ceiling: 2 KB (measured candidate: 1,212 B).

**Chosen against**: cutout treatments (A/B) and spark forms — retained as variants (§3), not the canonical mark. Warya selected C on the direction board (7 clicks vs 1 exploratory each on B/D), then C2 on the tuning board.

## 2. Static assets

| Asset | Action |
|---|---|
| `apps/web/src/app/icon.svg` | Replace with the C2 asset (favicon route; drop-in — Next serves it as-is) |
| `apps/web/src/app/apple-icon.png` | Regenerate 180×180 from C2. Requires a rasterizer (sharp/resvg/playwright screenshot); implementation must check availability first — if none, this is a NAMED follow-up, never a silent skip |
| OG card, wordmark, chrome spark | Untouched — text-only card; wordmark/spark are separate open items |

## 3. The variant set — kept, parked

Four finished variant SVGs preserved in `docs/brand-variants/` (documentation only, zero bundle impact): **reference-classic** (today's near-black star), **spark-cutout** (A), **star-cutout** (B), **spark-glyph** (D). Purpose: a future **"choose your mark" member-personalization feature** — and real options for the eventual mark-ratification founding ballot (`docs/brand-direction.md` §4).

Recorded constraint: PWAs cannot switch the installed home-screen icon dynamically — realistic scope is in-app chrome/loading marks and possibly install-time choice. The feature is backlog, deliberately unscheduled.

## 4. Motion — all three, by scenario (Warya: "use all 3 in different/appropriate scenarios")

One component: `apps/web/src/components/brand/AnimatedMark` — server-renderable, **CSS-only** (no JS animation, no client bundle cost beyond markup), keyframes in `globals.css` under a `.xidig-animark` scope. Modes:

| Mode | Motion | Scenario |
|---|---|---|
| `assemble` | X converges from the four corners, the two woven star halves slide in and lock (~1.2 s, plays **once**) | **Entry surfaces** — scattered → gathered as the opening ritual. Mounts: above the `/signin` title (verified: the `xidig-auth` shell renders no mark today — this adds one), **and the signed-out front-door chrome** (Warya 17 Jul: the mark belongs on the logged-out site too) — the front-nav brand slot gains the mark beside the wordmark, assemble playing once on first load, static thereafter. Budget note: inline SVG ~1.2 KB + CSS keyframes, counted by the front-door weight gate; the existing star-path/starfield choreography is untouched |
| `flap` | Whole-butterfly fold along the vertical center, calm loop | **Loading / pending states** — the mark-based alternative to spinners (per the comets-not-spinners doctrine). Exported; first consumer mounts with its surface |
| `ceremony` | Wings fold toward each other and spread — one shot, showier | **Celebration moments only** — vote cast, co-sign, founding-badge reveal (the ceremony-vs-utility doctrine: never on routine taps). Exported; mounts with those surfaces |

**Gating (house rule, non-negotiable)**: base styles ARE the final frame; animation applies only under `(prefers-reduced-motion: no-preference)` AND `html:not([data-motion='off'])`. Motion-off users always see the complete static mark — never a mid-fold frame, never an empty box.

Mechanics proven on the motion board: quadrant `clip-path` layers for assemble (the X body is one path; quadrant clips make it fly as four pieces and tile seamlessly at rest), absolutely-positioned half layers with `rotateY` for the folds, star halves as separate layers (they already are separate paths).

## 5. Validation & rollout

- **Static**: overlay + side-by-side vs the current mark at 220/96/48/32/16 px on dark and light (the session's comparison harness) — confirm the only deltas are star size/tone/specks. Byte check ≤ 2 KB.
- **Motion**: rendered-markup test asserting (a) final-frame base state without animation classes' effects, (b) `aria-hidden` on decorative layers, (c) the double gate present in CSS; visual verification in browser.
- **Suite**: typecheck, lint, full tests green before any commit; commits/pushes remain Warya's explicit call.
- **Legitimacy**: C2 ships as the **founder's-draft mark**; "ratify the mark" stays on the founding-ballot list with the §3 variants as real ballot options.

## 6. Out of scope

Wordmark typography and chrome spark redesign; palette questions (gold/indigo — separately parked); building the personalization feature; PWA dynamic icon switching; front-door surfaces beyond the front-nav mark mount (the star-path/starfield/StarAssembly system stays untouched).
