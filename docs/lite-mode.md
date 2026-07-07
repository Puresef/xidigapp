# Lite mode ("Xawli yar")

How Xidig serves low-bandwidth members (§22) as of Phase 4.5.

## The principle: defer, don't disable

Lite mode is a **delivery constraint, not a scope constraint**. Heavy bytes
are **deferred behind an explicit tap, never removed as features**. No
feature is ever cut for bandwidth: with a category deferred, every image /
embed / map still renders — as a ~0-byte placeholder (blurhash wash or
neutral box + alt label + estimated size + a **Show / Muuji** button) that
fetches that one asset on demand.

The Phase 1 behavior (hide images, swap the map for a list) is retired in
favor of this model. If you are building a new surface: **never `if (lite)
return null` around media — wrap it in a `MediaSlot`.**

## Preference model (`lib/lite/prefs.ts`)

```ts
type LitePrefs = { images; embeds; maps; animations; smallAvatars: boolean };
// true = LOAD normally, false = defer behind a tap
```

Bundles (Settings shortcuts + the simple toggle):

| Bundle       | images | embeds | maps | animations | smallAvatars |
| ------------ | ------ | ------ | ---- | ---------- | ------------ |
| `text`       | ✗      | ✗      | ✗    | ✗          | ✗ (initials) |
| `essentials` | ✗      | ✗      | ✗    | ✗          | ✓ (<8KB)     |
| `everything` | ✓      | ✓      | ✓    | ✓          | ✓            |

- Cookie `xidig_lite` (JSON `LitePrefs`, 1y) is the rendering source of truth
  — server components decide before any bytes move, and it works signed-out.
- Server read: `getLitePrefs()` (`lib/lite/server.ts`). **Back-compat:** no
  `xidig_lite` + legacy `xidig_lowbw=1` → `essentials`; neither → `everything`.
- `getLowBandwidth()` (`lib/bandwidth-server.ts`) still works: it now means
  `isLiteActive(prefs)` (any category deferred). Legacy call sites keep
  functioning; prefer per-category checks in new code.
- Signed-in members mirror prefs into `user_settings.preferences.lite` via
  `PATCH /api/me/settings` (Settings agent) for cross-device continuity.
- The simple on/off toggle (`components/low-bandwidth-toggle.tsx`) writes
  both cookies: on = `essentials`, off = `everything`.

## MediaSlot — the usage contract (`components/media/media-slot.tsx`)

```tsx
<MediaSlot kind="image" | "embed" | "map"
  src={string}            // the asset URL — also the session-memory key
  thumbSrc={string?}      // small variant, images only
  blurhash={string?}      // placeholder wash (lib/media/blurhash.ts)
  alt={string}            // REQUIRED — the placeholder label + img alt
  estBytes={number?}      // real bytes when known, else per-kind fallback
  width={n?} height={n?}  // aspect ratio of the placeholder
  prefs={LitePrefs}>
  {/* children: the real asset for embed/map (EmbedFrame, MapBrowser…).
      Image slots render their own <img>. */}
</MediaSlot>
```

Behavior you get for free:

- **Deferred category** → placeholder (blurhash canvas ≤32px scaled by CSS,
  alt, `~size`, Show button; keyboard-focusable, aria-labelled).
- **Reveal memory**: a tapped slot stays revealed for the browser session
  (sessionStorage keyed by `src`) and fires the `media_revealed {kind}`
  client analytics event.
- **Savings meter**: a slot that stays deferred records its estimated bytes
  once per src per session (`lib/lite/savings.ts`, localStorage rolling
  7-day buckets) — Settings shows "Lite saved you ~X MB this week"
  (`getSavedThisWeek()`).
- **Connection-aware images** even outside Lite: on `saveData` / 2g / 3g the
  thumb renders first with an explicit tap-to-full.
- **Page-level show-all**: mount `<LiteMediaProvider>` around a media-heavy
  page (plaza feed, post detail, listing detail, profile) and drop
  `<LiteShowAll />` near the top — with ≥2 deferred slots it renders
  "N hidden — Show all on this page". Slots work fine without the provider.
- Children are only mounted after reveal, so wrapping a heavy client
  component (e.g. Leaflet `MapBrowser`) defers its whole bundle+tiles.

`Avatar` (`components/media/avatar.tsx`, server-safe): initials disc
(deterministic color from the handle, tinted by the blurhash average) when
there is no photo or `smallAvatars=false`; otherwise the thumb image.

Byte estimates (`lib/lite/estimates.ts`): per-provider embed table (~0.6–1.2
MB), map ≈ 350 KB, unknown image ≈ 250 KB; `formatBytes(n, locale)` renders
the `~size` label.

## Upload pipeline (`POST /api/media`)

FormData: `file` (≤5MB) + `kind` (default `post`) + `alt` (optional except
`listing_photo` → `image_alt_required` 400; avatars default to the display
name). Every upload is re-encoded to WebP (EXIF/GPS dropped), pre-scanned
(§15, flagged = never stored), and produces main + thumb + blurhash:

| kind                                  | main               | thumb      | notes                     |
| ------------------------------------- | ------------------ | ---------- | ------------------------- |
| post / block                          | 2048 inside        | 480 inside | keeps GIF animation       |
| listing_photo                         | 2048 inside        | 480 inside | alt REQUIRED              |
| avatar / space_icon / candidate_logo  | 512 cover (square) | 96 cover   | thumb <8KB (Lite avatars) |
| cover / space_cover / candidate_cover | 1600×600 inside    | 480 inside | profile/space/candidate   |

Storage: `{userId}/{uuid}.webp` + `{userId}/{uuid}_thumb.webp`;
`media_uploads` row carries `kind, alt_text, blurhash, thumb_path`. Response:
`{ media: { id, url, thumbUrl, blurhash, alt, kind, width, height, bytes,
scanStatus } }`. Rate limit 30/hour.

Attaching is a second step and re-validates (`lib/media/attach.ts`):
ownership + expected kind + scan-clean, else `media_not_ready` 409. Attach
surfaces denormalize `*_path` / `*_blurhash` onto their target row (posts,
profiles, listings, labs) so read paths never join media_uploads.

## For future phases

- New media surface? Upload with the right `kind`, denormalize path +
  blurhash onto the owning row, render through `MediaSlot` with real
  `estBytes`. That is the whole contract.
- `animations` pref + `html[data-motion="off"]` + `prefers-reduced-motion`
  all kill animations/transitions on media surfaces (globals.css).
- Never gate a WRITE feature on Lite (e.g. composers): uploading is a choice
  the member makes explicitly; Lite only governs what loads uninvited.
