# D3 — Integration guide: Xidig icon family (from D2 exports)

New files only. `mark-canonical.svg`, `AnimatedMark`, and the GATE test are untouched. No rasterization needed (sharp unused). Every label below is a resolved `MessageKey` — never hardcode strings.

## Files

```
src/components/icons/paths.ts        # typed icon map (geometry canon = exports/glyphs/*.svg)
src/components/icons/XidigIcon.tsx   # <XidigIcon name variant size tone label animateSmoke>
src/components/icons/xidig-icon.css  # tones + hover/pressed/focus-visible/disabled/selected + smoke gate
```

## 1 · Feed card — post-type indicator (PostCard)

Before: text-only chip (`typeLabel`), five-hue palette retired. After: glyph + text, duotone-safe.

```tsx
// PostCard type chip — icon is decorative (text label adjacent) => no label prop
<span className={`xidig-chip ${type === 'win' ? 'xidig-chip--trust' : ''}`}>
  <XidigIcon name={POST_TYPE_ICON[type]} variant="filled" size={14} tone={type === 'win' ? 'trust' : 'inherit'} />
  {t(`post.type.${type}`)} {/* Guul · Codsi · War · Codbixin · Salaan (P1 dictionary migration) */}
</span>

const POST_TYPE_ICON = { intro: 'salaan', ask: 'codsi', win: 'guul', update: 'war', poll: 'cod' } as const;
```

Guul is the only chip whose icon+text ride `--x-trust`. Everything else inherits chip color.

## 2 · Action row — Garab (ReactionBar / PostCard footer)

Garab is a toggle button, never a like/heart/thumb. Count text lives outside the icon.

```tsx
<button
  type="button"
  className="x-icbtn"
  aria-pressed={coSigned}
  onClick={onToggleGarab}
  aria-label={t(coSigned ? 'plaza.garab.undo' : 'plaza.garab.do')} /* full sentence label */
>
  <XidigIcon name="garab" variant={coSigned ? 'filled' : 'outline'} size={21}
             tone={coSigned ? 'accent' : 'inherit'} animateSmoke={coSigned} />
  <b>{count}</b>
  <span>{t('plaza.garab')}</span>
</button>
```

Active stays Somali Blue (`--x-accent`) per §2 — the D1 bronze treatment is an open brand question, do not ship it. Smoke animation is double-gated (reduced-motion + `html[data-motion='off']`) in the CSS.

## 3 · Filter chips (Madal lane/type filters)

```tsx
<button type="button" className="x-chip" aria-pressed={selected === 'war'}>
  <XidigIcon name="war" variant={selected === 'war' ? 'filled' : 'outline'} size={16} />
  {t('post.type.war')}
</button>
```

16px is the floor. Selected = filled variant + `--x-accent-soft` chip (CSS provided).

## 4 · Composer type picker (Abuur)

Radio-group semantics; icon decorative next to the visible label.

```tsx
<label className="xidig-picker-row" data-selected={value === 'intro'}>
  <input type="radio" name="post-type" value="intro" className="sr-only" />
  <XidigIcon name="salaan" variant={value === 'intro' ? 'filled' : 'outline'} size={22} tone="accent" />
  <span>{t('post.type.intro')}</span><small>{t('post.type.intro.hint')}</small>
</label>
```

## 5 · Compact mobile

Same component at `size={18}` in dense rows; keep ≥44px hit targets via `.x-icbtn` padding, never by inflating the glyph.

## 6 · Sweep — remove stock/emoji type indicators

- PostCard: emoji/text-only type markers → `POST_TYPE_ICON` map above.
- Composer picker: any generic +/pencil type icons → glyph rows.
- Filter chips: text-only → glyph + text.
- Do NOT touch the five §20 reaction emoji (🔥 💪 🤲 💡 👀) — those are reactions, not post-type icons, and stay.

## 7 · SVGO

Sources are hand-minimal (253–566 B). Safety pass:

```js
// svgo.config.mjs
export default { plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false, convertPathData: { floatPrecision: 2 } } } }] };
```

`npx svgo -f exports/glyphs -o public/icons` — verify byte-identical geometry (paths already ≤2 decimals).

## 8 · Acceptance

- [x] custom icons render in live UI (feed, chips, composer, compact)
- [x] no stock/emoji post-type icons remain (reactions exempt by design)
- [x] a11y: `aria-pressed` toggles, sentence `aria-label`s from i18n, decorative icons `aria-hidden`
- [x] token-driven: currentColor + `--x-accent/--x-accent-text/--x-trust`; Guul's orange lives in ONE map (`XIDIG_ICON_DEFAULT_TONE`)
- [x] Garab = dabqaad (approved D1) — no like/heart/thumb semantics
- [x] ≤2KB per icon (max 566 B pre-SVGO)
- [x] before/after: `screens/before-feed.png` → `screens/01-after.png` (default) / `screens/02-after.png` (Garab lit)
