# Integration note (2 Aug 2026)

`integration.md` and `README.md` are the **verbatim** Claude Design handoff —
provenance, kept unedited. Two deltas between its examples and what shipped:

- **i18n keys in the examples are illustrative.** The guide shows
  `t('post.type.win')` / `t('plaza.garab.do')`; the repo's real keys are
  `plaza.typeWin` (+ `plaza.type*Hint`) and `action.garab` /
  `capital.cosignDone`. No new keys were needed: every wired icon sits beside
  its visible text label, so all glyphs render decorative (`aria-hidden`) and
  the existing strings carry the meaning.
- **Wired surfaces map to the repo's actual components:** PostCard type chip
  (`plaza/post-card.tsx`), the `/plaza?type=` filter link-tabs
  (`app/plaza/page.tsx`), the composer's ButtonTabs type picker
  (`plaza/post-composer.tsx`), and the Garab dabqaad on the Capital co-sign
  toggle (`capital/interest-bar.tsx`). The guide's §2 "ReactionBar" does not
  apply — the plaza ReactionBar is the §20 five-emoji reaction set (exempt by
  design); Garab lives on the Capital interest bar.

Canonical geometry: `apps/web/public/icons/*.svg` (+ `glyphs.map.json`);
runtime component: `apps/web/src/components/icons/` (`XidigIcon.tsx`,
`paths.ts` — incl. the shared `XIDIG_POST_TYPE_ICON` map — and
`xidig-icon.css`, imported once from the root layout).
