# D3 handoff — Xidig icon family implementation package

Produced 2 Aug 2026 from the D2 exports (Icons / Mark project). Drop-in for `apps/web`.

```
components/icons/   XidigIcon.tsx · paths.ts · xidig-icon.css   → src/components/icons/
glyphs/             12 optimized SVGs + glyphs.map.json          → geometry canon / public assets
screens/            before-feed.png · 01-after.png · 02-after.png
integration.md      surface-by-surface replacement guide + acceptance checklist
screens-src/        the exact pages the captures came from
```

Key decisions
- All glyphs `currentColor`; tones are token classes (`--x-accent`, `--x-accent-text`, `--x-trust`).
- Guul's default orange is declared once in `XIDIG_ICON_DEFAULT_TONE` — not hardcoded per call site.
- Garab = approved D1 dabqaad; outline = unlit, filled = lit (smoke). Active colour is Somali Blue per §2; bronze stays an open brand question.
- Smoke animation is opt-in (`animateSmoke`) and double-gated: `prefers-reduced-motion` AND `html[data-motion='off']`.
- GATE-locked files untouched; these are all new files.
