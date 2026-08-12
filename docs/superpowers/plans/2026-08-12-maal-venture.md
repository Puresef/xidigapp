# Maal — venture workspace (P1 dispatch, F2 §5)

Design source: `Maal Venture.dc.html` (7a–7g) + `Maal States.dc.html` (m1–m5), Claude Design project
`c4df5944-176f-4042-b19e-2df58c8eac1d`. `Maal Capital.dc.html` is SUPERSEDED (compliance copy only).
Binding: `DECISIONS-2026-08-06.md` rulings **1, 2, 4, 5, 8**; `docs/maal-f2-prereqs.md` (all sections);
`HANDOFF-P1.md` rows "Maal index/overview/work/ledger/capital"; PRD §14 + §16.

Date: 12 Aug 2026. Branch: `claude/full-quality-experience`.

---

## 1. What exists vs what this dispatch builds

**Exists.** Spaces/Labs (Phase 4): `labs` (`space_mode enum('club','lab')`), `lab_members`,
`lab_updates`/`lab_artifacts`/`lab_decisions`/`lab_events`, promote-only ladder
(`POST /api/labs/[id]/promote`), dormancy sweep `mark_dormant_labs()` (28d, marks only),
`/labs` + `/labs/[slug]?tab=` + `/labs/[slug]/settings`. Capital (Phase 5): `venture_candidates`,
`/capital`, `/c/[id]`. `governance_log_entries` table (no reader, no writer).

**Does not exist** (verified by recon, and by `docs/maal-f2-prereqs.md` §3): any `venture`/Maal stage,
any work board, any contribution ledger, any hash chain, any capital section, and **no system-timeout
demotion code anywhere**. The three `it.todo` specs in `packages/db/src/phase4-labs.test.ts:460-467`
are the only todos in the repo.

---

## 2. Architecture decisions (both FLAGGED — the design implies them, DECISIONS never ruled)

### D1 — Maal = `space_mode = 'venture'`; the Maal index takes over `/capital`

`nav.capital` is locked EN "Capital" / SO **"Maal"** (`packages/i18n/src/vocabulary.test.ts:19`) and
`/capital` is a locked rail destination (`rail-nav.test.tsx:48-55`). Frame 7a is titled "Maal" and
lists staged work orgs. So the Maal index **is** `/capital` — no new route, no nav edit, no locked
test touched (same discipline as ruling 6).

The Phase-5 candidate board moves to **`/capital/candidates`** (same filters, same cards, linked from
the Maal index and from `/c/[id]`). Nothing is deleted.

**Flag F1 for Warya:** confirm `/capital` = Maal index and candidates at `/capital/candidates`.
The alternative (candidates stay at `/capital`, Maal index at a new `/maal`) costs a rail-test change
and contradicts the locked SO label.

### D2 — the venture workspace lives on `/labs/[slug]`, not a new route tree

PRD §16: "Switching mode is a Space setting, not a rebuild"; promotion "never deletes its history".
Changing the URL on promotion would break every existing link, the OG image, and history. So 7b/7c/7d/
7f/7g are **tabs on the existing space detail**, shown only when `space_mode='venture'`:

| Frame | Tab | Route |
|---|---|---|
| 7b / 7e | Guud | `/labs/[slug]` (overview, venture-enriched) |
| 7c | Shaqo | `/labs/[slug]?tab=work` |
| 7d / 7g | Wax-ku-darsi | `/labs/[slug]?tab=ledger` |
| 7f | Maalgashi | `/labs/[slug]?tab=capital` |

Existing tabs (updates=Wada-hadal, artifacts=Lifaaqyo, decisions=Go'aanno, members, history) stay.

**Deviation D2a (flagged):** the frames' tab row has **Kulamo** (meetings) which has no repo
equivalent — events already surface on the overview via `UpcomingEventsSection`. Not built as a tab.

**Deviation D2b (flagged):** the frames show the rail's **Maal** item active on 7a–7d. On
`/labs/[slug]` the rail marks **Warshad** active (`isActive` is path-prefix based). Left as-is —
changing it would mean special-casing the rail on space_mode, and the venture genuinely lives in the
Warshad route tree.

---

## 3. Data model (migration `20260813000000_maal_venture.sql`)

All new tables: RLS enabled, SELECT-only policies, **all writes API-only** (service role after route
authz) — the Phase 4/5 write model. Column-scoped grants where a column must not leak.

1. `alter type space_mode add value 'venture'` — Maal. (`club`=Koox, `lab`=Warshad, `venture`=Maal.)
2. `labs` gains: `goal_statement text`, `goal_target int`, `goal_unit text`, `goal_progress int`,
   `venture_since timestamptz`, `ledger_visibility lab_visibility default 'members'`,
   `hours_visibility lab_visibility default 'members'`, `demoted_at timestamptz`,
   `demotion_warned_at timestamptz`.
3. `lab_members` gains `requested_workstream_id uuid` (7e: applicants pick a workstream).
4. `venture_workstreams` — `id, lab_id, name, owner_user_id null, status enum('active','waiting'), position, created_at, updated_at`.
5. `venture_tasks` — `id, lab_id, workstream_id null, title, status venture_task_status
   enum('open','claimed','submitted','attested','verified'), assignee_user_id null, created_by_user_id,
   created_at, updated_at`. Board columns: Qorshe=`open`, Socda=`claimed`,
   "Marag & ansixin"=`submitted|attested`, Dhammaystiran=`verified`.
6. **`work_events`** — the ledger. Append-only, hash-chained, per-lab chain:
   `id, lab_id, seq bigint, member_user_id, event_type work_event_type
   enum('hours','code','design','intro','money','reversal'), quantity numeric(12,2), unit_weight int,
   units int, task_id null, note text, occurred_at timestamptz, recorded_at, recorded_by_user_id,
   reverses_event_id null, prev_hash text, hash text`.
   - `hash = encode(sha256(convert_to(payload,'UTF8')),'hex')` computed in a BEFORE INSERT trigger.
     **`sha256` is pg_catalog (PG11+) — deliberately NOT pgcrypto's `digest()`**, because
     `create extension pgcrypto` is a no-op on Supabase where it already lives in `extensions`, so
     `public.digest` would not resolve under `set search_path = ''`.
   - `seq` assigned in the same trigger (`max(seq)+1` per lab, advisory-locked on `lab_id`).
   - Immutability: existing `public.forbid_mutation()` trigger for **UPDATE and DELETE**, plus
     `revoke update, delete ... from service_role`. Corrections are a **new `reversal` event** with
     `reverses_event_id` set and negative `units`.
   - `public.verify_work_chain(p_lab_id uuid) returns table(ok boolean, broken_seq bigint)`.
7. `work_event_attestations` — `(work_event_id, attester_user_id)` PK, `created_at`. "Marag".
   CHECK-enforced app-side: a lead cannot attest their own event (recusal).
8. `venture_weight_schemes` — `id, lab_id, weights jsonb, decision_id null, effective_from,
   created_at`. Seeded on promotion with the frame defaults (hours 8, code 12, design 10, intro 25,
   money 0). Changing weights is a `lab_decisions` vote → new row (read-model, history untouched).
9. `venture_capital_needs` — `id, lab_id, amount_cents bigint, currency char(3), purpose text,
   decision_id null, declared_at, created_at`. 7f "Baahida la sheegay". **No pledge table** — pledges
   are disabled controls only; building the table would imply money movement.

Share % is a **read model**: `units / sum(units) per lab`, computed in a SECURITY DEFINER tally
function (no internal readability guard — the Phase-5 lesson, `phase5-capital-state`).

---

## 4. Demotion — the system-timeout path (ruling 2, prereqs §3)

- Thresholds (`apps/web/src/lib/labs/constants.ts`): dormancy **28d** (existing, unchanged, the early
  warning), demotion warning **70d**, demotion **84d**. 84d matches 7a's demoted row
  ("Firfircoonidii ugu dambeysay 3 bilood ka hor").
- `public.demote_timed_out_ventures()` — service_role only, `returns setof uuid`. Sets
  `space_mode='lab'`, `demoted_at=now()`; **touches nothing else** — ledger, tasks, workstreams,
  members, decisions, `lab_events`, `promoted_at`, `venture_since` all survive.
- Writes, in one transaction: a `lab_events` row `event_type='demoted_timeout'` and a **published**
  `governance_log_entries` row (`category='stage_demotion'`).
- Warning pass at 70d writes `demotion_warned_at` + a `lab_demotion_warning` notification (advance
  notice = "ogeysiis hore").
- Runs from the existing `/api/cron/labs` sweep next to `markDormantAndNudge`.
- **No user-facing demotion endpoint** — the existing negative RLS test stays; three new positive
  tests replace the `it.todo`s.
- **Remedy = re-promotion; there is no appeal, by ruling (12 Aug 2026).** A timeout demotion is a
  system lifecycle/governance action, not a `mod_action` — nothing was judged, so there is nothing to
  contest. Every artefact survives, and the venture returns to Maal by meeting the conditions again.
  No appeal type will be built for this path and no copy may offer one.
- Lands in ONE commit with the PRD §16 amendment and the `rls-phase4` test rescope (ruling 2).

---

## 5. Screens

- **7a `/capital`** — filter chips (Dhammaan/Maal/Warshad/Kuwa aan ku jiro), sort (Firfircoonida),
  desktop table + mobile card rows, stage badge from `space_mode`, per-join-mode verb
  (Fur/Codso/Ku biir/Fiiri), demoted substage line, the footer law paragraph.
  **Koox is excluded by the query, and by a structural test** (ruling 4).
- **7b overview** — charter + goal meter, workstreams table with named owner/open seat, decision log
  (post-close tallies only), members rail, applications rail (Aqbal/Diid), visibility toggles,
  dormant-capital rail card.
- **7c work** — 4-column board, workstream filter, week meter, contribution logger, lead recusal.
- **7d/7g ledger** — the compliance notice (verbatim), 4 stat cards incl. `$0`, member table
  (desktop) / member cards + event trail (mobile), weights card, money card, CSV export, sheet
  filters. **Full capability on both surfaces (ruling 1)** — enforced by a structural parity test.
- **7f capital** — lock notice, declared need + decision, pledge form present and **disabled**,
  "Waxa hadda shaqeeya" checklist, no date anywhere.
- **States m1–m5** — index skeleton, teaching empty, dormant notice, ledger read error (totals kept),
  offline contribution queue (localStorage, TTL, true timestamps, Tirtir).
  **Flag F3: `Maal States.dc.html` has no Lite frame.** Lite = cover/icon deferred through MediaSlot;
  every ledger/board/capital capability identical (Lite defers bytes, never features).

## 6. i18n

New namespace **`maal.*`** — must be classified in `LAUNCH_FLOOR_NAMESPACES`
(`packages/i18n/src/coverage.ts`) or CI fails, and launch-floor means SO is mandatory at 100%.
Every string in §2 of the spec extract becomes a key. `capital.*` is already launch-floor.
No `Intl.RelativeTimeFormat` — `formatRelativeTime` + dictionary-owned `time.*` only.

## 7. Gates to keep green

`pnpm lint` (incl. `xidig-i18n/no-hardcoded-copy`), `pnpm typecheck`, `pnpm test` (incl.
`globals-tokens.test.ts` AA + focus-visible/active/disabled coverage lists, `coverage.test.ts`,
`vocabulary.test.ts`, `migrations.test.ts` RLS-on-every-table, `rail-nav`/`app-nav` nav locks,
`mascot-forbidden-surfaces` — **new money-critical Maal components get added to FORBIDDEN**),
`pnpm build`. Zero orange in Maal except earned guul-stars (badge canon 10a).

---

## Flags for Warya (never silently resolved)

- **F2 — CLOSED by ruling, 12 Aug 2026.** No appeal type will be built for timeout demotion: it is a
  system lifecycle/governance action, not a `mod_action`, so there is nothing to contest. The remedy is
  re-promotion, and it is real because every artefact survives. "Rafcaan" / "appeal" is now removed from
  `maal.indexLaw`, `maal.dormantFooter` (both locales), PRD §16, and the notification copy.
  **Design-side follow-up:** `DECISIONS-2026-08-06.md` ruling 2 and the `Maal States.dc.html` /
  `Maal Venture.dc.html` frames still say the demotion is appealable — the frames' own copy is now the
  stale artifact, and should be updated to the re-promotion wording on the next design pass.
- **F1** `/capital` becomes the Maal index; candidate board → `/capital/candidates`. (D1)
- **F3** no Lite frame exists for Maal; built per standing Lite rules. (§5)
- **F4** "Kulamo" tab in the frames has no repo mechanic — not built. (D2a)
- **F5** rail marks Warshad (not Maal) active on the venture workspace. (D2b)
- **F6** demotion thresholds 70d warn / 84d demote are **inferred** from 7a's copy — PRD §16 records
  them; change the numbers there if they are wrong.
- **F7** `Maal States.dc.html`'s intro line still says "dormant (encouragement, never demotion —
  PRD §16)"; the m3 frame body was updated for ruling 2 but the intro was not. Design-side fix.
- **F8** weight defaults (8/12/10/25) come from 7d's copy — they are the seeded scheme, member-votable.

### Raised by the adversarial review (19 confirmed of 46 raised), all fixed — two need your eye

- **F10 — the hours toggle cost the per-type columns.** With `hours_visibility='leads'` the ledger used
  to null only `hours` while still showing units and the published weights, so any member could recover
  another member's exact hours with one subtraction and one division — the toggle's own copy ("other
  members see a total") was false. Fixed by folding the whole per-type breakdown for other members;
  units and share stay. Cost: under that toggle, other members now see `—` in the Koodh / Naqshad /
  Xiriir columns too. The alternative is retiring the toggle.
- **F11 — "publicly logged" vs a private Space.** The demotion entry published the venture's name and
  slug to a log every member can read, including for a private Space. Fixed by naming the venture only
  when it was already public or listed, and publishing the same entry anonymously otherwise. Whether an
  anonymous entry satisfies §16's "publicly logged" is your ruling, not mine.
- **F12** the trust-orange `.xidig-capital-entry` card on `/labs` now points at the Maal index. DESIGN.md
  §2 still enumerates "Capital entry" as sanctioned orange, which predates the reframe from funding
  board to work organisation; the P1 colour law says zero orange in Maal. The finance-chart glyph on
  that card *was* fixed (ruling 8's finance-imagery ban) — the orange was left for you, since amending
  DESIGN.md is your call.
- **F13** `recordWeightScheme` is the one Maal service function with no API route: changing the weights
  needs a `lab_decisions` vote to point at, and there is no ballot table behind `lab_decisions` yet.
  Related: `DecisionView.tally` is always `null` for the same reason.
- **F14** `maal.eventMoney` and the four CSV header keys (`Tartiib`, `Waqtiga`, `Marag`, `Qoraal`) are
  composed Somali, not frame-verbatim — native review batch.
- **F15** no `time.today` key exists ("Maanta" in 7g's trail); event stamps render "4 saacadood ka hor"
  instead. Same compact-time gap already open from the search-results dispatch — one ruling settles both.
- **F16** `maal.ledgerNoticeCompact` is now unused (the full notice renders at every width — a legal
  paragraph must not be weaker on the surface most members use). Keep or retire.
