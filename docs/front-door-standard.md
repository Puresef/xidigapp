# Front Door v2 — the standard (11 Jul 2026 teardown expansion)

*This document is the synthesis of the 11 Jul adversarial expansion of an outside teardown of the live xidig.net front door. It **extends** `docs/front-door-plan.md` — it does not replace it. Plan sections are referenced as FD§n; the plan's phases A/B/C, honesty invariants, data floor, organic-proof enforcement (`apps/web/src/lib/front/organic.ts` + `organic.test.ts`) and low-bandwidth budget remain governing. Every claim below is cited to a file path, a live-fetch fact (curl, 11 Jul 2026), or an FD§n. Nothing here proposes fabricating anything; recommendations that failed the honesty invariants were killed and are recorded in §6.*

*Two directives from Warya (11 Jul) are treated as final throughout: **directive 8** — no competitor names (WhatsApp/Instagram/TikTok) in copy; "time to move on" may only be implied, never named — and **directive 9 / invariant 9** — hero = ONE promise, CONNECTION ("connect with Somalis everywhere"); #2 hook = MEMBER-OWNED; then social core → governance → Labs; the directory is a byproduct and never leads.*

---

## §1 Verdict

The outside teardown is substantially right about the symptoms and substantially wrong about the remedies. Right: the live front door fails its own first impression. TTFB is 2.7–3.3s from a UK vantage (`cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS` — every anonymous visitor pays full dynamic SSR plus Supabase round-trips; there is no ISR or `unstable_cache` anywhere in the codebase, which falsifies the "built for our internet" brand claim at the network layer). The live `<title>` is literally "Xidig"; the live page ships zero OpenGraph/twitter tags, so a WhatsApp link-drop — the #1 distribution channel — previews as almost nothing. And text extractors see vignette debris: the aria-hidden odometer scenes (`apps/web/src/components/front/vignettes.tsx:57-68`, counts at :21-27, :251) render digit strips "0 1 2 3 4" and free-floating labels as real DOM text, beside a page that promises "any number on this page is a real one" (`en.ts` marketing.honestyBody). That is exactly how the outside reviewer experienced the page, and it is the teardown's most legitimate wound.

One evidence correction the record must carry: the grounding's "no opengraph-image file/route anywhere in the repo" is **stale**. Commit `c4ef186` (11 Jul, a parallel session) landed a site-default `apps/web/src/app/opengraph-image.tsx` plus root `openGraph`/`twitter` metadata in `layout.tsx`, and five per-entity OG routes exist (app root, `u/[handle]`, `labs/[slug]`, `c/[id]`, `l/[id]`, committed in `4734a61`). The gap is now **live-only** — the deployed site lags latest main (the known "redeploy latest main" loose end) — and **quality-only**: the default card carries the bare name + generic tagline, is `force-dynamic` (every preview fetch pays a fresh render on a 3s-TTFB origin), and per-route og:title/description mirroring does not exist. The fix is upgrade-and-verify, not greenfield.

Where the teardown is wrong, it is wrong in one consistent direction: it imports the standard playbook of a funded consumer app — testimonials, queue positions, screen recordings, social icons — into a pre-alpha, one-founder, ~2-member, honesty-locked product where every one of those items is either fabrication (invariant 1: "3–5 real quotes" cannot exist and cannot be invented), a fake mechanic ("You're #N in line" — the waitlist endpoint deliberately returns a non-oracle neutral response, `apps/web/src/app/api/waitlist/route.ts:42-49`, and invites are admin-picked + invite-code, not FIFO), or a budget violation (screen recording: 300–800KB per tap against a 2G brand promise). The teardown's items survive only after translation into this house's idiom: the honest substitutes exist for every single one, and most are cheaper than what it asked for.

The shape of the fix, in one sentence: **make the page fast and legible to machines (streaming + caching + metadata + de-debris), make it obey Warya's 11 Jul message hierarchy (one connection promise, member-owned second, directory demoted), show the product honestly (CSS demo frames + one real MediaSlot demo of Lite itself) instead of describing it, and replace impossible social proof with the one founder's verifiable record (signed note, dated build log, how-we-count receipt, deep-linked real artifacts).** Roughly half of this is copy and metadata shippable in days; the structural half merges into FD Phase B; a defined set of decisions is Warya's alone (§4.4).

## §2 The standard

The bar the front door must clear. Each item is pass/fail for a reviewer.

### A. Copy honesty & message hierarchy
1. The hero contains exactly ONE promise, in the connection family, with the member-owned hook as the #2 element — no feature enumeration in the hero (invariant 9). **Fail today**: heroSub lists six features (`en.ts:1541-1543`).
2. No competitor is named anywhere in front-door copy (directive 8); "time to move on" is only implied. **Fail today**: groupsBody/groupsKeep name WhatsApp twice; blockSuuqBody ends "…reach them on WhatsApp…" (`en.ts`, mirrored `so.ts:1468-1480`).
3. The primary CTA names the real artifact the click produces (a single-use invite code — `api/admin/waitlist/invite/route.ts`), and the button label matches the landing page's H1.
4. Every claim about what happens after submission describes only what the code or a committed founder process actually does — no batching, cadence, ordering, or "spot opens" language without a real mechanism behind it.
5. Exactly one honest platform claim is made (browser + Android home-screen install, backed by `manifest.ts` `display:'standalone'`); offline is never claimed (`public/sw.js` is push-only).
6. Any number rendered or extractable on the page is real, organic-filtered, and above its data floor — including in DOM text no human sees (crawler/reader extraction counts).

### B. Show the product
7. A text extractor (curl, reader mode, preview bot) sees zero decorative debris: no odometer digit strips, no free-floating vignette labels in extractable DOM text.
8. Within the first two folds, a visitor can see the product — as a server-rendered demo frame built from the real shipped CSS classes and/or a real labelled screenshot — never a screenshot passed off as live organic content.
9. All demo material is visibly labelled demo, and the page's honesty copy permits it before it ships (honestyBody amended atomically with the first demo surface — currently `en.ts` says flatly "no staged screenshots", which would contradict a labelled demo).
10. The Lite promise is demonstrated, not just described: one real MediaSlot on the landing in its deferred state (0-byte placeholder, true size estimate, real "Muuji" reveal — `media-slot.tsx:207-227`).
11. No eager image can ship on a front-door route ungoverned: `scripts/front-door-weight.mjs` counts eager image bytes and fails on same-origin `<img>` without `loading="lazy"`; a source scan forbids raw `<img>`/next-image outside MediaSlot in `app/(front)` + `components/front`.
12. Every front-door data fetcher lives in (or is scanned by) the organic-proof enforcement scope — `lib/front` or an extended `organic.test.ts` directory list (the scan reads source text only; imports from `lib/profile-view.ts` etc. escape it today).

### C. Social proof & verifiability
13. The page carries the FD§4 terminal-rung designed content: a signed founder note ("From the founder") between the honesty prose and the reports teaser — the one honest human this page can have at ~2 members.
14. "Any number on this page is a real one" links to a plain-language "How we count" receipt describing `lib/front/organic.ts` + its test enforcement.
15. Every "build in public" claim is backed by at least one public dated artifact (day-zero build-log module of 3–5 git-verifiable milestones), or the claim is softened.
16. The reports teaser shows real named titles and a **derived** count (`getAllReports().length` — never a hardcoded number that can go stale into a fake one).
17. A skeptical visitor can reach a human: CONTACT_INBOX verified set on production (env-gated at `env.ts:92`; the form renders "isn't wired up yet" when unset), and any reply-window promise is one Warya has committed to.
18. Testimonials/quotes appear only via the consented pipeline (opt-in quote bit beside the FD§4 spotlight toggle, ≥3 organic quotes floor, deep-link to live public profiles, deactivated/hidden authors dropped) — never before.
19. Every proof rail item deep-links to a live public artifact with a real timestamp; Dormant badges are never suppressed on marketing surfaces.

19b. Any waitlist-demand number counts only confirmed-contact entries: `api/waitlist/route.ts` rate-limits only 5/hr/IP with no email/phone confirmation step, and `waitlist_entries` aren't `users`, so the organic filter never touches them — a raw count is bot/typo-inflatable on the page that pledges real numbers. `countWaitlistDemand` gates on a confirmed-contact bit (or counts confirmed + not-yet-converted only) before anything renders.

### D. Information architecture
20. Section order is: hero (one promise + counter) → member-owned hook (full-width, replacing the groups section) → feed/profile/DM stations → governance station → Labs station with intent-only Capital coda → proof strip (event card + reports/membership/Lite one-liners) → honesty pledge alone → "Come home" final CTA + star assembly.
21. The directory appears only as a searchability clause inside the profiles station; Capital appears on the homepage only as a coda (invariants 7 and 9).
22. /product is the exhaustive present-tense tour (sole homepage-adjacent home of Suuq + Capital sections + trust + beta note), honestly framed as deeper-not-different where keys are shared (4 station keys remain shared).
23. One click from the hero terminates at a real artifact (labelled screenshot/demo frame on /product, pointer to the 14 real reports) — never at pure copy recursion.
24. The star-path choreography matches the section census (five swings, mobile path visible and legible against stacked text — `star-path.tsx:22-36`, `front.css:1085-1106`).

### E. Performance & delivery
25. No Supabase read blocks first byte on the anonymous homepage: the counter and event card stream behind Suspense with `fallback={null}` (byte-equivalent to the data-floor's "silently absent").
26. The two FrontHome reads are cached (`unstable_cache`, 5–15 min per FD§4) and the event helper is one query, not two serial ones (`front-home.tsx:89,101`; `lib/events/views.ts`). **Fail-fast (integration finding, 11 Jul):** each cached read is raced against a 600 ms deadline OUTSIDE the cache (`lib/front/cached.ts` `withDeadline`) — a cache miss against an unreachable/stalled DB degrades to the absent state for that request only (never caching the fallback; the abandoned promise still populates the entry for the next warm hit). Verified: `/` warm TTFB 4478 ms → 413 ms against an unreachable DB, ~40 ms against a reachable one; guards the plan's "never skeleton-flash because a count query hiccuped" rule and keeps the CI TTFB tripwire (item 30) measuring shell speed, not driver retry backoff.
27. Vercel functions are pinned co-located with the production Supabase region (dub1 ↔ eu-west-1, after confirming the prod project's region).
28. No supabase-js in the anonymous bundle (FD§2's explicit promise): app chrome (UserMenu/BadgeProvider/HeaderSearch/NotificationBell, FollowingFeed etc.) is dynamic-gated behind the viewer branch. **Fail today**: ~65KB supabase chunk ships to anonymous `/` (live-measured).
29. Only the active locale's dictionary ships initially; the other loads as a lazy chunk on toggle, preserving the instant client-side switch and EN-fallback semantics (`packages/i18n/src/translate.ts` statically imports both today, ~208KB source).
30. CI enforces a compressed-weight budget as a ratchet: seeded at measured-current +5%, ratcheted down with each diet PR, floor 100KB; a warm-request TTFB tripwire lands in the same PR as items 25–26 so it is green on arrival.
31. FD§6's stale "system font stack (no webfonts — verified)" claim is corrected; Space Grotesk carries at most the weights Warya confirms (dropping 500 saves an **estimated** ~19–26KB — unmeasured; read the built woff2 sizes before this figure anchors W-11).

### F. SEO, metadata & share cards
32. Every (front) route, /waitlist, and the reports routes carry their own title + description **mirrored into openGraph** via one composer (`lib/seo.ts` frontMetadata); the composer writes the full suffixed og:title itself (Next does not apply title.template to og:title).
33. The default OG card is build-time static and bilingual (EN + SO stacked), immune to origin TTFB and URL-keyed preview caches; no live numbers on any share card (preview caches freeze them into stale fakes).
34. Reports carry article OG (type=article, publishedTime), Article JSON-LD with mainEntityOfPage + dateModified, and sitemap lastModified from `Report.date`.
35. Vignette remnants are fenced from snippet synthesis with `data-nosnippet` (aria-hidden does not stop snippet harvesting), and every description-less public page gains a description (/product sets title+canonical only today, `product/page.tsx:49-57`).
36. /labs and /capital anon teasers carry real titles via generateMetadata — with copy neutral enough for their dual-mode (signed-in) renders.
37. The bilingual indexing model is an explicit recorded decision (recommended: Somali-canonical for front-door URLs with og:locale so_SO + alternateLocale, EN demand served by the 14 EN reports).

### G. Capital framing & footer
38. One canonical guardrail surface exists — "How backing works (and what it isn't)" on the signed-out /capital branch, structured as persistent page furniture the Phase-B public list slots into (the current teaser is documented as Phase-B-disposable, `capital/page.tsx:41-43`) — and every Capital mention links to it. Until legal sign-off (FD§9-Q3), the link points at the already-live `capital.securitiesDisclaimer` banner.
39. No front-door copy uses the root "invest" (today: "Investment-intent" in blockCapitalBody, `en.ts:1566-1567` — the sole offender); the marketing sentence and the legal sentence are split, in **both** `front-home.tsx` and `product/page.tsx` (they hold separate SECTIONS constants).
40. The public "not a fund" line (`en.ts:1625-1626`) and the member-side "Xidig Venture Fund" modal (`en.ts:1503-1505`) do not contradict; the forward-looking gate "legal sign-off before any fund-named content goes public" has a named owner and date in `docs/alpha-hardening.md`.
41. Signed-out visitors get a trust footer: Explore (Product/Labs/Capital/Reports/Membership) + Trust (About/Contact/Privacy/Terms) + legalEntityNote + language toggle; no social icons until real operated accounts exist; signed-in footer unchanged.
42. Legal-copy hygiene: the 'Somalia'/'Soomaaliya' split in `so.ts` is normalized to 'Soomaaliya' (6 UI strings + 1 comment; mixed within one sentence at `so.ts:1584`), and stale placeholder comments state the cff2209 facts.

### H. Emotional & visual identity
43. The homecoming thesis is bookended: an early echo where the groups section was ("It's time to come home." — directive 8's permitted indirect implication), one visitor-facing star-metaphor sentence at the first station (never in the hero), payoff kept at the final CTA.
44. Somali performs on the EN page: the final CTA renders both tongues (both strings exist; `createTranslator(locale)` resolves the sibling locale server-side), and Somali product names appear EN-first-glossed ("Labs (Warshado)") — never Somali-first on EN surfaces (5 Jul naming review).
45. The scroll carries a night-to-dawn temperature arc in static CSS (warm the last two `.xf-journey` aurora radials, `front.css:999-1003`; ≤0.06 opacity; contrast re-verified against `front.css:27-28` ratios) — the one emotional device every visitor segment (reduced-motion/Lite/no-JS) receives equally.
46. Mobile gets a real star-path (today it collapses to a 1rem gutter with `preserveAspectRatio='none'`, `front.css:1085-1090`, on exactly the screens "built for our internet" claims), with FrontMotion made visible-path-aware (`front-motion.tsx:45` querySelector-first would silently track a hidden path).
47. Any city constellation is framed as the **diaspora's** geography, never Xidig's footprint ("Somalis are in all these cities" — never "we're live in 34 cities"); city names rendered as UI become locale-aware keys (the `org-schema.ts:11-13` i18n exemption is schema-data-only).
48. The brand mark ships in chrome only after Warya's fidelity sign-off (no clean vector exists — `icon.svg` is 19,052B of PNG-trace paths; the redraw is real design work); the wordmark fallback stays live.

### I. Accessibility (audience overlaps low-end Android + TalkBack; root layout already honors text-size/motion prefs — nothing below may regress that)
49. Post-reorder heading order is sequential: the D20 restructure must not leave station h3s under a deleted h2 or skip levels — verified with an outline pass in the reorder PR.
50. The dawn arc and gold star-path survive a contrast pass: warmed radials stay ≤0.06 opacity with muted-text ratios re-verified against `front.css:27-28`, and no meaning is carried by the gold color alone.
51. The hero CTA row has visible `:focus-visible` states and its CTAs sit in logical DOM order for keyboard/switch access.
52. The vignette containers remain `aria-hidden` under the de-debris refactor, pinned by a regression test on `vignettes.tsx` (today :330-331): the CSS `content: attr()` fix is extractor-safe but stays screen-reader-safe *only* while aria-hidden holds — nothing else prevents generated-content labels being announced.

## §3 Gap analysis vs today

### A. Copy honesty & message

| Item | Current state (evidence) | Severity |
|---|---|---|
| One-promise hero (A1) | heroSub enumerates six features (`en.ts:1541-1543`); fails the 3-second test | **Critical** — invariant 9 non-compliance |
| No competitor names (A2) | WhatsApp named 3× (groupsBody, groupsKeep, blockSuuqBody), EN+SO | **Critical** — directive 8 violation |
| CTA names artifact (A3) | "Request Access" ×3 + waitlist H1 mismatch; artifact is a single-use invite code | High |
| Post-submit honesty (A4) | "we'll save your founding spot" (/product), "as spots open" — no mechanism behind either | High |
| Platform claim (A5) | None on page; `manifest.ts:12` still says "Where Somali builders connect, build, and fund — end to end" (pre-9-Jul framing, on the Android install sheet) | Medium |

### B. Show the product

| Item | Current state (evidence) | Severity |
|---|---|---|
| No crawler debris (B7) | Odometer digits 0..n as real spans, counts 4/3/5/2/3, co-sign n=7 in DOM text (`vignettes.tsx:57-68,:21-27,:251`); aria-hidden (:330-331) doesn't stop extraction | **Critical** — extractable fake-looking numbers beside the honesty pledge |
| Product visible in 2 folds (B8) | Zero screenshots, zero demo frames; six described stations only | High |
| honestyBody permits demos (B9) | "no staged screenshots" flat — stricter than invariant 1, blocks labelled demos | High (blocking) |
| Lite demonstrated (B10) | Lite trust card describes; fake blurred tile; no real MediaSlot on landing | Medium |
| Image budget governance (B11) | `front-door-weight.mjs:8,:44` excludes images entirely; budget green vacuously | High — dies silently when Phase B ports 26 report images (FD§7) |
| Fetcher enforcement scope (B12) | `organic.test.ts:122-144` scans source text only; `front-home.tsx` already imports un-scanned `lib/events/views` | Medium |

### C. Social proof & verifiability

| Item | Current state (evidence) | Severity |
|---|---|---|
| Founder note (C13) | Absent — grep for founder/Warya in `app/(front)`, `components/front`, `en.ts` hits only code comments; FD§4's terminal content unbuilt on the day it is the operative rung | **Critical** |
| How-we-count receipt (C14) | honestyBody makes the claim (`en.ts:1576`); no receipt anywhere | Medium |
| Build-in-public evidence (C15) | aboutStory3 claims it (`en.ts:1622`, on /about); zero artifacts | High |
| Reports staging (C16) | reportsTeaserBody one generic sentence (`en.ts:1578`); no titles, no aggregate on `reports/page.tsx` | Medium |
| Reachable human (C17) | CONTACT_INBOX optionalKey (`env.ts:92`); live state unsmoked; footer 4 links; org-schema deliberately omits contactPoint (`org-schema.ts:67-69`) | High |
| Quote pipeline (C18) | Nothing asks members for quote consent; teardown item 3 structurally unsatisfiable | Medium (design now, Phase B) |

### D. Information architecture

| Item | Current state (evidence) | Severity |
|---|---|---|
| Section order (D20) | Groups prose leads (`front-home.tsx:148-151`); 6 co-equal stations incl. Suuq/Capital; honesty section polluted by groupsKeep (:194); finalCta at bottom of attention | **Critical** — invariant 9 spirit |
| Directory demoted (D21) | Suuq is co-equal station 3 of 6 — equal billing (violates spirit, not letter) | High |
| /product differentiation (D22) | 7 of its sections shared keys with homepage (`product/page.tsx:26-47`); own SECTIONS constant, not reuse | Medium |
| Click-to-real-artifact (D23) | "Explore what's inside" (`front-home.tsx:118-120`) lands on copy-only /product | Medium |
| Choreography census (D24) | PATH_D hard-codes six swings (`star-path.tsx:22-36`); FrontMotion order-agnostic, alternation nth-child — retune is the only work | Low |

### E. Performance & delivery

| Item | Current state (evidence) | Severity |
|---|---|---|
| Streaming (E25) | Zero Suspense in `apps/web/src`; two awaits block TTFB (`front-home.tsx:89,101`) | **Critical** — with E26/E27, the 2.7–3.3s live TTFB |
| Caching (E26) | Zero `unstable_cache`/revalidate; event helper is 2 serial queries + a users query (`lib/events/views.ts`) — FD§4's cached-module design unbuilt | **Critical** |
| Region (E27) | No regions key in `vercel.json`; default iad1 vs eu-west-1 Supabase (verified for the `.env.local` project only — confirm prod) | High |
| Anon bundle (E28) | supabase-tier chunks 65–66KB + 137KB Sentry vendor + 58KB dictionary chunk in a 484KB JS total, live-measured; FD§2 promise unmet | High |
| Locale chunk (E29) | `translate.ts` statically imports both dictionaries (103KB+105KB source) | Medium |
| CI budget (E30) | `ci.yml` is lint/typecheck/test/build only; `front-door-weight.mjs` **exists** at `apps/web/scripts/` (B11 cites it) but is wired into neither `ci.yml` nor any package script, and its hard-coded 100KB bar would be red on first run against today's 484KB JS — item 9 reseeds it at measured +5%; no `.env.test` exists (a prior claim to the contrary was false) | High |
| Font claim (E31) | Space Grotesk 500+700 loaded (`layout.tsx:44-49`); FD§6 still claims no webfonts | Low (doc drift) + Medium (bytes) |

### F. SEO, metadata & share cards

| Item | Current state (evidence) | Severity |
|---|---|---|
| Per-route metadata (F32) | openGraph exists only in `layout.tsx` (since c4ef186); pages set bare title/canonical; every non-entity route shares og:title "Xidig" | **Critical** for the WhatsApp channel |
| Static OG card (F33) | `opengraph-image.tsx:5` force-dynamic + getT(); fresh Satori render per preview fetch on a 3s origin; one URL serves two language variants into URL-keyed caches | High |
| Reports cards (F34) | generateMetadata: title/description/canonical only; JSON-LD lacks mainEntityOfPage/dateModified; sitemap url-only; cover PNGs NOT in this repo yet (Phase-B salvage port, FD§7) | High |
| Snippet fencing (F35) | No data-nosnippet anywhere; /product description-less | High |
| Gated teasers (F36) | `labs/page.tsx`/`capital/page.tsx` export no metadata; index as bare-"Xidig"; dual-mode routes (generateMetadata runs for members too) | Medium |
| Indexing model (F37) | DEFAULT_LOCALE='so' (`locales.ts:15`), cookie→Accept-Language negotiation, no hreflang: Googlebot sends no locale cookie and typically no Accept-Language, so the front door most plausibly indexes Somali-only — an **inference from the negotiation code, not a verified crawl fact** (check Search Console / a live SERP before it anchors W-10); undecided | Medium (decision, not build) |
| Live deploy | Live site shows none of c4ef186's OG work until redeploy (known loose end); site effectively bare-carded live | **Critical** (operational) |

### G. Capital framing & footer

| Item | Current state (evidence) | Severity |
|---|---|---|
| Guardrail surface (G38) | None; teardown item 8 confirmed; teaser is Phase-B-disposable per in-file comment | High |
| "invest" root (G39) | blockCapitalBody: "Investment-intent features are region-gated…" — marketing + law in one sentence, link-dead, both surfaces | High — invariant 7 friction |
| Fund contradiction (G40) | "Xidig Venture Fund… primary way to back ventures" (member) vs "not a fund" (public) — founding members see both; gate ownerless (cutover itself did NOT breach §9-Q3: severed shipping was its sanctioned path) | High |
| Trust footer (G41) | FOOTER_LINKS = About/Privacy/Terms/Contact exactly; unbranched for all viewers (`site-footer.tsx`, `layout.tsx:178`) | Medium |
| Legal hygiene (G42) | 'Somalia' in 6 SO UI strings + 1 comment; mixed spelling within `so.ts:1584`; stale placeholder comments at `terms/page.tsx:14-15`, `en.ts:1653-1655` | Low |

### H. Emotional & visual identity

| Item | Current state (evidence) | Severity |
|---|---|---|
| Homecoming bookend (H43) | Narrative exists only in a code comment (`star-path.tsx:4-10`); finalCta renders last (`front-home.tsx:217`) | High |
| Somali performing on EN (H44) | Nothing; "Ku soo laabo gurigaaga" (`so.ts:1496`) is demonstrably the better sentence and costs zero new translation to surface | Medium (best cost/benefit in the set) |
| Temperature arc (H45) | Aurora stack blue/teal all the way down (`front.css:999-1003`); all content cards cold; the one warm treatment (`--accent`, `front.css:512-534`) used only on /membership Supporter tier | Medium |
| Mobile star-path (H46) | Collapsed to 1rem gutter below 880px (`front.css:1085-1106`) — signature asset absent on the audience's actual screens | High |
| Brand mark (H48) | Header is text wordmark + generic CSS spark (`front-nav.tsx:33`, `front.css:784-791`); unified-experience port (a44f095) shipped favicon assets only — no clean vector exists | Medium |

## §4 The work, sequenced

### 4.1 Quick wins (days; no founder-**decision** dependencies — but not founder-free: plain-register SO strings (items 10/11/14/15/17/19) self-ship flagged for the native batch under item 18's convention, which §5's voice-carrying-prose rule does not cover and is hereby stated as sanctioned; item 20 is Warya-operational — deploys are his)

1. **De-debris the vignettes** (S): move decorative strings + odometer digits into CSS generated content (`data-label` attrs + `content: attr(data-label)`; per-digit `::before`), labels still via `t()`. `vignettes.tsx`. Ships with a regression test pinning the containers' `aria-hidden` (§2-I 52) — the generated-content approach is screen-reader-safe only while that holds.
2. **Snippet fencing + descriptions** (S): `<span data-nosnippet>` around remaining vignette remnants; per-route descriptions ride item 3.
3. **Metadata composer** (S/M): `frontMetadata()` in `lib/seo.ts` (title/description/canonical + mirrored openGraph incl. explicit suffixed og:title + og:locale), applied to the 7 (front) pages, /waitlist, /labs + /capital teasers (dual-mode-neutral titles), reports. Root gains title.template `%s — Xidig`.
4. **Static bilingual OG card** (S): de-dynamic `opengraph-image.tsx` (remove force-dynamic + getT; import both locales' locked strings statically; EN+SO stacked). Edit directly — c4ef186 is committed; normal shared-worktree re-read caution only.
5. **Reports SEO + staging** (S): article OG, JSON-LD mainEntityOfPage/dateModified, sitemap lastModified from `Report.date`; teaser card with 2–3 real titles via `getAllReports()` and a **derived** count.
6. **Streaming + caching + event-query merge** (S each): Suspense the counter + event card (fallback=null, reserve line-height); `unstable_cache` both reads (close over `getSupabaseAdmin()` inside the cached fn — client args aren't serializable cache keys); merge featured/soonest into one query, keep the fallback branch.
7. **Region pin** (S): `"regions": ["dub1"]` in `vercel.json` **after confirming the production Supabase project is eu-west-1**; re-run live smoke.
8. **Bundle diet, tier 1 — two PRs, different risk classes.** **8a** (M): dynamic-gate app chrome behind the viewer branch (delivers FD§2's "no supabase-js" promise, live-verified ~65KB — the biggest single byte win; FD§2 itself calls this new construction, not a tweak). **8b** (M, own PR): per-locale lazy dictionary chunks — rewires `packages/i18n/src/translate.ts` app-wide and must preserve instant client-side toggle + EN-fallback semantics + the existing i18n tests. ~110–150KB combined realistic win. Split so a slip in 8b never stalls 8a or the ratchet (item 9 seeds at measured +5%, so neither blocks it).
9. **CI weight ratchet** (S): budget script seeded at measured-current **+5%**, ratcheted down per diet PR, floor 100KB; extend `front-door-weight.mjs` to parse `<img>` (fail eager same-origin without lazy; count eager bytes); add the organic.test.ts-style source scan banning raw `<img>`/next-image outside MediaSlot. (Warm-TTFB tripwire ships in the same PR as item 6. App-router chunk attribution via `.next/app-build-manifest.json`.)
10. **Homepage reorder** (M): the D20 ten-section order. Can land with current hero copy — structure does not block on the hero decision. Includes: owned-hook promotion + **deletion** of groupsTitle/Body/Keep (grep-confirmed sole consumer; no blockPlazaBody salvage needed — the memory line already exists there verbatim), directory folded into profiles, governance station added (absorbs the $1/mo one-liner — existing committed copy), Capital→coda, proof strip, honesty pledge de-polluted and moved above final CTA, PATH_D retuned to five swings; heading order re-verified with an outline pass after the restructure (§2-I 49).
11. **Competitor-mention rewrites** (S): groupsBody/groupsKeep die with item 10; blockSuuqBody close becomes channel-nameless (§5.2) in both `en.ts` and `so.ts:1479-1480`.
12. **blockCapitalBody split** (S): one pitch sentence + guardrail link (§5.4) in **both** `front-home.tsx` and `product/page.tsx` (separate SECTIONS constants); interim link target = the live securitiesDisclaimer banner on /capital. Deletes the last front-door "invest" root.
13. **Trust footer** (S): viewer-branch SiteFooter (viewer already resolved at `layout.tsx:141`); flat Explore + Trust groups, legalEntityNote, existing LanguageToggle; headingless = 0 new strings; signed-in unchanged; keep short (shared chrome).
14. **Platform note + manifest fix** (S): §5.3 line under the hero CTA row or in the Lite card; `manifest.ts:12` → §5.6 **bilingual, SO-first** — the Android install sheet is the surface the SO-default audience sees most, so an EN-only string there fights invariant 5 even though the manifest is a static route handler outside the i18n key system (hardcoded bilingual, SO half flagged to the item-18 native batch).
15. **How-we-count receipt + build-log module** (S): `/about#how-we-count` describing organic.ts + its tests, linked from the honesty section; soften aboutStory3 until an artifact exists; "Building in public" module of 3–5 dated git-verifiable milestones (reports port, verification, events, 10 Jul cutover) in the future rail slot, replaced rung-by-rung as floors clear.
16. **Contact smoke** (S, alpha-hardening): confirm CONTACT_INBOX set on prod; send a real message through /api/contact (route forwards without storing — a lost email is untraceable).
17. **Bilingual final CTA + glosses + dawn arc** (S each): render finalCta in both tongues with correct lang attrs (`createTranslator` one-liner, zero new translation); EN-first glosses at first mention ("Labs (Warshado)", "co-sign (Garab)"); warm the last two aurora radials + one dawn gradient behind `.xf-home-final` (~15 static CSS lines, re-verify muted-text contrast).
18. **Legal hygiene sweep** (S): normalize to 'Soomaaliya' (7 occurrences: 6 UI strings + `so.ts:1577` comment); update stale placeholder comments to the cff2209 facts. SO batch flagged to native reviewer; spelling ships now.
19. **Homecoming echo + star line** (S): "It's time to come home." as the early echo h2 (in the slot item 10 opens); "Xidig means star — the stars that guided us home." at the first station only — never in the hero.
20. **Redeploy latest main** (operational, blocking): none of c4ef186's OG work — nor its security headers (nosniff, X-Frame-Options DENY, CSP frame-ancestors, Referrer-Policy, Permissions-Policy), nor anything above — exists live until this known loose end is paid (live = cff2209; main tip = c4ef186, verified 11 Jul). Then verify the card in a real WhatsApp drop.

### 4.2 Phase B′ (merges into FD Phase B — scope changes to that phase)

FD Phase B keeps its existing scope (lib/stats, public /labs + /capital lists, Plaza highlights + spotlight consent, reports asset port, organic retrofit, front_door_counters) and **gains**:

- **Demo product frames** (M, gated): 1–2 server-only frames on /product (feed + profile) composed from the real shipped CSS classes (`globals.css` 40,885B + `front.css` 60,030B already load unconditionally, `layout.tsx:1-2`; `post-card.tsx`'s generic classes verified reusable), visible demo-label chip, no invented human names, class-existence drift test. Hard dependencies: honestyBody amendment lands **atomically** in the same change (§5.5), and Warya signs off concept + fixture copy first (W-4). Not one frame per block — 8 frames of EN+SO demo copy is too much for one native-review queue.
- **1–2 manual screenshots + the Lite live demo** (S/M): hand-captured, hand-optimized AVIF of the real app showing demo data, caption + designed alt EN+SO, via MediaSlot deferred-by-default; one image doubles as the landing's Lite demo — a real MediaSlot with prefs forced to the deferred branch for signed-out visitors (prefs is a prop, `media-slot.tsx:123,136`), so the "Muuji" tap IS the product demo; its client chunk is natively measured by the weight budget. No capture pipeline (§6).
- **Founder showcase strip** (M, content-first): founder profile card / first real post / first public Lab via existing public projections, each deep-linking to its real public page; absent below floor, never empty; after the feature blocks. Fetchers **in `lib/front`** (or extend the scan's directory list) — enforcement is constructed, not assumed (B12). Content-blocked, not code-blocked: renders nothing until Warya creates the first post/Lab. Also: actually link one real public Lab from labsTeaserNote when one exists (verified dangling promise).
- **Spotlight consent grows a quote bit** (M): separate opt-in quote-consent beside the FD§4 toggle, same scope + ≤15-min takedown SLA; founder-DM collection loop; "Founding voices" rail at ≥3 consented organic quotes; rail query drops deactivated/hidden authors; routed through `lib/front`.
- **Labs rail verifiability contract** (S, on the already-planned rail): every item deep-links to `/labs/[slug]`, real relative timestamp, Dormant never suppressed; build-log lines from `lab_updates` (a SOURCE_COLUMN_TABLES member — filter applies automatically).
- **Waitlist demand counter** (S, coupled): `countWaitlistDemand` in `lib/front/organic.ts` (updates_only=false, **excluding entries whose contact has since become a member** — converted entries stay in the table and would overstate), **counting only confirmed-contact entries** — `api/waitlist/route.ts` rate-limits only 5/hr/IP with no email/phone confirmation, and `waitlist_entries` aren't `users`, so the organic filter never touches them; without a confirmation bit the "N people waiting" figure is bot/typo-inflatable on the page that pledges real numbers (pass/fail as §2-C 19b). Rendered at ≥50, and only **after** a committed invite cadence exists (W-5) — "spots left" beside "people waiting" without stated mechanics reads more manufactured, not less.
- **/capital guardrail page** (M, legal-gated): "How backing works (and what it isn't)" as persistent furniture the public candidates list slots into — ladder; Garab never region-gated (`region-gate.ts:12-14`); Maalgeli three-way check + audit log + no raw IP; securitiesDisclaimer verbatim; link to /terms#capital (add section anchors). Never names "Xidig Venture Fund" (severability discipline). Rides the §9-Q3 legal lane. ~8–10 marketing.capitalHow* strings EN+SO (reuse ujeeddo/taageero vocabulary, never 'maalgashi').
- **Mobile star-path** (M): real mobile PATH_D + FrontMotion made matchMedia/visible-path-aware (~5 lines — geometry APIs work on display:none, so the naive version silently animates the hidden desktop curve); verify gold line legibility against stacked station text or route through gaps.
- **City constellation** (M): "one sky" typographic star-map, ~1–2KB deterministic SVG; caption anchors to the **diaspora**, never Xidig's footprint; city names become locale-aware keys (~14 strings: Muqdisho, Hargeysa…); extension of the hero's connection hook, never displacing the #2 slot.
- **Report + waitlist share cards** (S): text-on-brand per-slug report cards (asset-free — cover PNGs are Phase-B salvage, not in-repo); /waitlist static card with the always-true framing ("500 founding spots — limited" — the cap is a constant); live-N variant only as W-15.
- **Sentry anon-bundle spike** (M, scoped): deferring init() alone does NOT evict the SDK — `instrumentation-client.ts` exports `onRouterTransitionStart` at module scope; eviction needs a dynamic-import forwarding stub, and tree-shake flags would strip tracing for members too (shared bundle). Own spike with those constraints named; the 137KB vendor chunk is the prize.

### 4.3 Phase C′

- URL-visible locale variants + hreflang (the only path to EN homepage titles in EN SERPs) — L, reopened only if EN search demand outgrows the 14 EN reports.
- Automated screenshot capture pipeline — only if the demo frames prove insufficient (Playwright is not repo/CI tooling today).
- Edge/ISR restructure of the anonymous front door (cookie-keyed at the proxy, which already computes `hadAuthCookies`) — this **reverses FD§2's documented "no static home; v1 keeps them dynamic" decision** and requires a root-layout restructure (root layout awaits cookies()/headers() for lang/textsize/motion). Trigger: land 4.1 items 6–8 first, measure; if warm anon p75 still misses ~800ms or cold MISSes dominate at real traffic, bring the case to Warya (W-16).
- FD§C items unchanged (constellation graph, directory intelligence, on-page weight counter, gabay pass).

### 4.4 Needs-Warya decisions (numbered like FD§9)

1. **Hero copy** — pick among three candidates (§5.1); founder voice, same class as FD§9-Q1. If Candidate B, rework finalCta so the line doesn't appear verbatim twice.
2. **CTA rename** — "Request an invite" + matching waitlist H1 (extends FD§9-Q1). Recommendation: yes — it names the real artifact.
3. **honestyBody amendment wording** — the honesty promise is the brand centerpiece; softening it is a founder call (§5.5). Ships only atomically with the first demo surface.
4. **Demo-frame concept + fixture copy sign-off** — invented demo post text on the front door, even labelled, is a §9-class honesty-posture judgment.
5. **Invite cadence** — commit an operational cadence or don't; every cadence/batch/SMS sentence and the demand counter gate on this. No commitment → the copy stays silent (already honest).
6. **Monitored email + reply window** — Resend is send-only; receiving needs routing/forwarding to a real monitored inbox plus an answering commitment. Recommendation: the weaker checkable "a human reads and answers every message" if no number is committed. JSON-LD contactPoint + founder Person only after this + the name decision (per `org-schema.ts:67-69`'s own rule).
7. **Founder note/letter + name/photo** — the homepage "From the founder" section (C13), the /about letter styled as the page's one warm `--accent` card, the /about "Who runs Xidig" block, and founder-name-in-JSON-LD are all his self-consent; SO via native reviewer (voice-carrying prose).
8. **Build-in-public artifact** — repo-public requires a git-history secrets/ops audit (runbooks, moderation/rate-limit internals in-repo); a hand-written /changelog is cheaper but only if he commits to currency (a stale changelog is a fresh falsifiable claim). Until either: softened copy + the build-log module.
9. **Fund naming** — rename the member-side fund modal to intent vocabulary (lawyer-free, but reverses Phase 5's deliberate fund-first funnel) or soften the public line to "a fund is being formed" (legal-sign-off-first). Either way: record "legal sign-off before any fund-named public content — owner + date" in `docs/alpha-hardening.md` beside the DPIA gate.
10. **Bilingual indexing** — recommended default (a): Somali-canonical front door (og:locale so_SO + alternateLocale en_US), EN demand served by the reports; ships with the composer at zero build. (b) is Phase C′.
11. **Font** — drop Space Grotesk weight 500 (unilateral; the ~19–26KB saving is an **estimate** — measure the built woff2 sizes before presenting the number); removing the face entirely unwinds approved visual v2 — his call. FD§6's stale claim gets corrected either way.
12. **Brand mark redraw** — fidelity sign-off gate; wordmark fallback stays live. **Direction RULED 17 Jul (see `docs/brand-direction.md`):** the mark keeps the X form + somali-blues — the brand-rethink proposal's five-shard gold star as a replacement is rejected; the redraw brief is clean-vector-of-the-existing-X (~hundreds of bytes vs the 19KB trace, weave fingerprint kept, optionally separable arms for an assemble-on-open motion). Warya executes the redesign himself later; still open until his artwork lands.
13. **Horizon band** (optional, decorative-tier) — one in-house abstract dusk skyline ≤3KB inline SVG behind aesthetic sign-off; discard freely if it reads as clip-art. (Photography is formally rejected — invariants 1+4.)
14. **Budget re-scope clause** — if 100KB compressed proves unreachable after the full diet, re-scope the invariant with Warya explicitly rather than let it rot as a false claim.
15. **Live-N waitlist share card** — URL-keyed preview caches freeze numbers for days-to-weeks; a frozen wrong number violates invariant 1's spirit on the most-forwarded surface. Default: static "500 founding spots — limited". Live-N only as his explicit staleness-accepting choice.
16. **Edge-cache architecture change** — only if post-quick-win measurement warrants (4.3); reverses a documented FD§2 decision and must be surfaced as such.

## §5 Copy proposals

**Every string below is EN. ALL new or changed copy requires SO translation before the i18n coverage gate passes (invariant 5), and voice-carrying prose (hero, founder note) routes through the FD§9-Q7 native reviewer, not self-translation.**

### 5.1 Hero (needs-Warya, W-1) — replace heroTitle/heroSub (`en.ts:1541-1543`, `so.ts` mirrors)
- **Candidate A (literal):** "Connect with Somalis everywhere." — invariant 9's own verbatim hero assignment. Addresses the reader's diaspora, not a member count; no city-pair lines that would imply existing members at ~2.
- **Candidate B (bookend):** promote the shipped finalCta — "Come home to the Somali social app." — to the hero; the SO pair reuses `so.ts:1496` ("Ku soo laabo gurigaaga") **verbatim as a deliberate refrain**; finalCta reworked so the line doesn't repeat verbatim.
- **Candidate C (punchiest):** the punchiest one-promise variant from the hero-copy draft — Warya's pick among the three.
- **Sub (all candidates):** the member-owned hook, one clause ("not an algorithm" register — already shipped in blockOwnedTitle; names no competitor). The displaced positioning line ("The Somali social app for connection, discovery, and building.") survives as the meta description / /product line.

### 5.2 Competitor-mention rewrites (directive 8; quick-win)
- **groupsTitle/Body/Keep:** DELETED with the reorder (sole consumer is `front-home.tsx`; the community-memory idea already lives verbatim in blockPlazaBody: "Conversations become community memory, not scroll-past noise" — no salvage edit).
- **blockSuuqBody close:** "…then **contact them directly** when you're ready." (or "…message or contact them directly…"). Not "follow them" — the follow API's target enum is `['user','tag']` only (`api/follows/[targetType]/[targetId]/route.ts`); businesses cannot be followed. "Contact them directly" keeps the real shipped listing-contact-rail claim (`suuq/whatsapp-cta.tsx`, `contactHref` in `lib/listings.ts`) channel-nameless. SO mirrors at `so.ts:1468-1471/1479-1480`.
- **RULED (Warya, 11 Jul): Option B — channel-nameless, APPLIED.** Rationale: the standard share button opens the OS share sheet where any app can be chosen — the widest marketing spread. Implemented same day (uncommitted, main worktree): `action.shareWhatsApp` deleted (EN+SO) and the `wa.me` deep-link button removed from `share-actions.tsx` (native share sheet + copy-link remain); `suuq.whatsappCta` → "Message directly" / "Si toos ah ula hadal" (label only — the href still deep-links the listing's chosen contact channel, and `contact_click` analytics unchanged); `blockSuuqBody` close → "contact them directly" / "si toos ah ula xiriir" (the rewrite above, done ahead of the reorder). **One deliberate exception, flagged for override:** `profile.contactWhatsappLabel` ("WhatsApp number") is the member-side settings *input label* (`profile-form.tsx:345`) describing what the field technically is — renaming it channel-nameless would invite non-WhatsApp numbers into a field that generates `wa.me` links; it renders on no marketing surface. If strict-B is wanted there too, the rename must ship with a format hint. New SO strings are plain-register self-shipped, flagged to the native batch.

### 5.3 Expectation-setting + CTA (quick-win; CTA rename W-2)
- **CTA:** "Request an invite" · SO: **"Codso martiqaad"** (verified consistent with the established martiqaad vocabulary: waitlist.haveCode, auth.inviteCodeLabel, action.sendInvite). waitlist.title retitled to match.
- **marketing.betaExpectation** (new key, under the hero CTA row): "Private beta. Every request is reviewed by a person."
- **waitlist.subtitle:** "Xidig is in private beta. Leave your email or phone number — a person reviews the list by hand."
- **waitlist.joined:** "You're on the list. A person reviews every request and sends invites by hand — yours arrives as a single-use code." (No "when it's your turn": invites are admin-picked + code-bypassed, not FIFO — "turn" implies an ordering §6.2 establishes doesn't exist.)
- **Invite-code surfacing** (real mechanic — signup_grants + waitlist.haveCode): "Know a member? Ask for their code."
- **3-step what-happens-next** (waitlist page + post-submit): on the list → a person reviews the list and sends invites — yours arrives as a single-use code (no batch/cadence/ordering claim) → your Founding badge locks in at join (real per waitlist.foundingCounter).
- Killed from all of the above: "as spots open"/"the moment a spot opens" fake-fullness, "when it's your turn"/any turn-or-queue-order implication, "invites go out in small batches" (no system batches anything), any cadence sentence absent W-5. Phone lane stays channel-silent.
- **marketing.platformNote** (new key): "Works in any browser. On Android, add it to your home screen like an app — no app store needed." (Variant if preferred: "No download — works in any phone's browser, and adds to your home screen if you want it.") Never claim offline (`sw.js` is push-only; the install claim needs neither).

### 5.4 Capital guardrail line (quick-win, with the split)
- **blockCapitalBody** keeps one pitch sentence, then: "**No money moves on Xidig today — see how backing works.**" linking /capital (interim anchor: the live securitiesDisclaimer banner; post-legal-sign-off: the guardrails section). This edit deletes "Investment-intent", the only front-door use of the banned root. Applied in both front-home and /product renders. 1 revised SO string + 1 new link label EN+SO.

### 5.5 Honesty copy amendment (W-3; ships atomically with the first demo surface, never standalone)
- **marketing.honestyBody**, from the flat "no staged screenshots" to the invariant's actual clause, wording for Warya's sign-off along the lines of: "no screenshots passed off as real — anything marked *demo* is the real app showing demo data." An amended promise referencing demo material on a page with zero demos is its own dangling copy; an unamended promise beside a labelled demo is a self-contradiction. Same change, same commit.

### 5.6 Other locked strings
- **manifest.ts:12:** bilingual, **SO-first** (SO is the default locale and the Android install sheet is the surface that audience sees most): a Somali line mirroring the EN, then "The member-owned Somali social app — connect with Somalis everywhere." (replacing the stale "Where Somali builders connect, build, and fund — end to end."). The manifest is a static route handler outside the i18n key system, so the fix is a hardcoded bilingual string, not an EN-only one; the SO half is plain register, self-shipped and flagged to the item-18 native batch.
- **Homecoming echo h2:** "It's time to come home." (directive 8's permitted indirect implication; SO rhymes off the guri phrasing at `so.ts:1496`).
- **Star line, first station only:** "Xidig means star — the stars that guided us home."
- **Constellation caption (diaspora-anchored):** headline "From Mogadishu to Minneapolis — one sky"; caption anchors to the community ("Somalis are in all these cities; one sky over all of us") — never to Xidig's footprint.
- **Proof-strip Lite one-liner:** "Somali and English from day one; Lite mode for slow connections." (preserves the invariant-4 brand statement at one-liner weight).
- **Glossing rule (EN surfaces):** EN-first at first mention — "Labs (Warshado)", "co-sign (Garab)", "the directory (Suuq)". Somali-name-first is a SO-locale privilege (5 Jul naming review; 'Warshad' is the locked form).

## §6 Considered and rejected (the adversarial record)

Killed recommendations, with kill reasons — recorded so they are not relitigated:

1. **"Claim a founding spot" CTA alternative** — submitting the form claims/reserves nothing (`waitlist_entries` has no ranking/hold/reservation mechanic); a Claim button landing on a form that claims nothing is fake mechanics (invariant 1 spirit).
2. **"You're #N in line" queue position** — the waitlist endpoint deliberately returns an identical neutral response to members and duplicates so it is not a membership oracle (`api/waitlist/route.ts:42-49`); a position would reopen that hole or require faking one; and invites are admin-picked + code-bypassed, not FIFO — "#N" implies an ordering that does not exist.
3. **"Invites go out in small batches"** — operational promise with no system backing (the invite route is one-click per entry; nothing batches). Same species as the killed Friday-cadence line.
4. **"Follow them" in the Suuq rewrite** — businesses cannot be followed (follow target enum is user/tag only); over-claims against the section's people-AND-businesses subject.
5. **Testimonials / "3–5 real quotes" now (teardown item 3)** — no members to quote at ~2; invariant 1 makes invented quotes DOA. Answered instead by the founder note + build-log now and the consented quote pipeline for later.
6. **Screen recording** — 300–800KB per tap against a 2G brand promise (invariant 4).
7. **Automated Playwright screenshot pipeline (launch)** — built on a false premise ("playwright already available": no dependency in any package.json or node_modules; it exists only as an agent-environment plugin the founder's CI cannot run); disproportionate machinery for 1–2 hand-maintained images. Phase C′ at most.
8. **Demo frame per feature block (8 frames)** — a large new EN+SO fixture-copy surface for a one-founder native-review queue that already carries debt; 1–2 frames on /product.
9. **Third hero CTA "See what's being built →"** — a three-CTA hero undoes the one-promise discipline and elevates Labs above its directive-9 rung; the link lives at the Labs station / on /product once the public list clears its floor.
10. **blockPlazaBody salvage edit** — the "community memory" line already exists there verbatim; the edit would duplicate the page's own copy.
11. **Hardcoded report count ("14") in i18n copy** — goes stale into a fake number on the page that pledges real ones; derive from `getAllReports().length`.
12. **Live-N founding counter on the share card (as default)** — WhatsApp/FB preview caches are URL-keyed and freeze images for days-to-weeks; `revalidate` cannot reach them; frozen wrong numbers on the most-forwarded surface. Static always-true framing is the default (live-N = W-15).
13. **Repo-publication as a quick-win** — a security decision, not a copy change: unaudited git history, in-repo runbooks and moderation/rate-limit internals. The /changelog alternative carries an unpriced maintenance commitment (a stale changelog is a fresh falsifiable claim). Both → W-8.
14. **"A Resend-verified domain gives us a contact address"** — Resend is send-only; a verified sending domain creates no inbox. Receiving is a separate step plus an answering commitment (W-6); an unanswered address is fabricated responsiveness.
15. **Star-metaphor line under the hero sub** — the hero holds ONE promise (invariant 9); nothing new enters the hero. First station only.
16. **Somali-name-first glossing on EN surfaces ("Warshado — Labs")** — creates landing→app vocabulary dissonance (app chrome says "Labs" on EN by the 5 Jul naming review) and uses an unlocked plural ('Warshado' vs locked 'Warshad').
17. **"Commission 2–3 landmark silhouettes"** — nobody to commission at a one-founder shop; a slightly-off named landmark in the hero reads amateurish. Downgraded to one optional abstract in-house experiment behind sign-off (W-13).
18. **Hero/community photography** — formally rejected: invariants 1 (no community to photograph honestly) + 4 (weight).
19. **Dead social icons in the footer** — fabrication-adjacent until real operated accounts exist; then footer + org-schema sameAs together.
20. **Sentry lazy-init as the eviction mechanism** — `instrumentation-client.ts`'s module-scope `onRouterTransitionStart` export keeps the SDK statically imported; deferring init() evicts nothing. Re-scoped as a spike (4.2).
21. **CI TTFB tripwire "lands green today"** — false twice over: the −5% seed is red on arrival by construction, and the committed `.env.test` it relied on does not exist (CI never boots the app). Re-specced: +5% seed ratcheting down; warm-second-request TTFB, shipped with the streaming/caching PR.
22. **Edge-cache proxy rewrite as a Phase B default** — reverses FD§2's documented "no static home; v1 dynamic" decision and understates the root-layout obstacle (cookies()/headers() for lang/textsize/motion → route-group restructure the plan explicitly rejected as primary). Kept as a measured, Warya-approved trigger (4.3/W-16).
23. **"Enforcement is automatic via organic.test.ts" (founder strip)** — the scan reads source text of specific directories only; imports from `lib/profile-view.ts`/`lib/labs-api.ts` escape it (precedent: `front-home.tsx` imports un-scanned `lib/events/views`). Enforcement is constructed, not assumed.

24. **Standalone FAQ page (teardown item 10's "add FAQ")** — killed as a page, absorbed as substance: the two things a front-door FAQ would actually answer are already assigned — expectation-setting ("what happens after I submit?") to the §5.3 betaExpectation line + 3-step, and verification ("do these people exist?") to `/about#how-we-count`, the build-log module, and the G41 trust footer. A standalone FAQ is a new EN+SO surface with a standing staleness liability for a one-founder review queue, answering questions the page should answer inline.

25. **Directory-wedge hero (teardown item 2's remedy)** — the diagnosis stands (six features in the subhead fails the 3-second test) but the remedy is overturned by directive 9/invariant 9, which is final: the directory is a byproduct and never leads — no directory-led hero, no directory-led ordering. Replaced by the one connection promise (§5.1), with Suuq folded into the profiles station (D21).

**Evidence corrections recorded** (grounding/critic claims that failed verification, kept so the record stays honest): the grounding's "no opengraph-image route in repo" is stale (c4ef186, 4734a61); all "coordinate with the in-flight session / don't edit those files" caveats are obsolete (committed; clean status; normal shared-worktree caution only); the "95% bounce" figure was invented (the front door has zero analytics and bounce is dropped by design, FD§5.3); the TTFB upper bound stays 2.7–3.3s (the 4.2s outlier came from flaky sandbox networking; re-measured 3.07s); Hargeisa first-paint arithmetic is estimate, not measurement (the UK-vantage numbers already establish the conclusion); Sentry `includeLocalVariables` cold-start attribution is unmeasured inference; the cutover did **not** breach FD§9-Q3 (severed shipping was its sanctioned path — the debt is the ownerless forward gate); finalCta is not literally the last string on the page (button + footer follow); the woven divider appears on 4 sections, not 3; /product shares 7 keys via its own SECTIONS constant, not 8 via reuse; the Suuq station has equal billing, not greater (invariant-9 spirit violation, not letter); the honesty pledge sits ~eight sections from the hero counter, not two; the production Supabase region is **confirmed eu-west-1** (project `tbdryvhxxiqadseuxclm` "Dev Xidig App", the live DB — via Supabase API, 11 Jul) so the `dub1` Vercel pin is correctly co-located.

**Integration record (11 Jul push):** the three quick-win tasks (de-debris, perf, SEO) + directive-8 Option B + the fail-fast fix were cherry-picked linearly onto main and pushed live. A pre-push adversarial review caught one directive-8 miss the tasks did not cover: `marketing.groupsBody`/`groupsKeep` still named WhatsApp twice (the standard's plan was to *delete* them in the D20 reorder, item §4.1-10, which is NOT yet done) — rewritten channel-nameless (EN+SO) before push; the groups *section itself* still awaits the D20 reorder. Two review notes left as follow-ups: (a) the merged event query (`lib/events/views.ts`) can miss a soonest-organic event if >12 featured events are all AI-hosted — harmless at ~0 events, re-add a soonest-only fallback if event volume grows; (b) `countFoundingSpotsLeft` swallows errors to `null`, which `unstable_cache` then caches for one 600 s window (documented fail-soft; make the inner fn throw if a transient blip should never suppress the counter).
