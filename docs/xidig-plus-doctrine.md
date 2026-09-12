# Xidig Plus doctrine — owner rulings, mechanics conflict, smallest safe slice

**Status (12 Sep 2026, second pass):** P1 is **implemented on
`claude/integration-plus-retention`**, following the owner's second-pass
rulings (§1C).

- `383f6c3`: steps 1–4 and step 6. The paused paths refuse neutrally, the
  tier is never consulted, and live tallies leave the API. Includes migration
  `20260912100000` (the tally is server-only).
- `5b5e808`: step 5, migration `20260912100100` (the five rows removed).
  **Deploy-order gated**: apply it only after the app is deployed. It is not
  applied to Dev.

- `1aa147f`: the §1D follow-up. Declaring a Venture's capital need and the
  automatic Venture → Lab timeout demotion are both paused. No migration.

**Still gated:** the non-paid eligibility model (P3), which now also carries
any future capital-need model; ordinary-project parity (P2); legal wording and
the `TERMS_VERSION` bump for the ToS clause; and native Somali review of every
new string.

§2 and §3 below describe the pre-P1 state (`384b840`) and are kept as the
audit record.

The original branch (`claude/packet-b-support-taageer-xidig-plus`, `8749ba0`)
still carries names and copy only.

**Authority:** the owner-edited Notion PRD "PRD Relook — Xidig: Social &
Collaboration Platform", §24 (updated 12 Sep). Where it conflicts with older
repo records (`prd.md`, the planning docs, migration comments), the
owner-edited PRD wins.

## 1. Owner rulings (12 Sep 2026)

### A. Naming — this branch (`384b840`), accepted and pushed

The owner accepted the direction of `384b840`. It was pushed on 12 Sep as a
normal new-branch push.

- **Support action:**
  - English: default "Support", active "Supporting", removal "Remove support",
    count "N people support this".
  - Somali, **provisional** (native review, G34): "Taageer" / "La taageeray" /
    "Ka noqo taageerada".
- **Paid tier:** English "Xidig Plus". Somali does **not** use "Taageere" for
  the paid tier in this slice, because it collides with the Support/Taageer
  action. The Somali tier noun stays gated.
- **Garab** remains only as internal, legacy or cultural context, unless native
  review deliberately restores it.
- **Internal identifiers may remain** where schema or analytics continuity
  matters: `cosign`, `post_cosigns`, `post_cosigned`, `/api/posts/{id}/cosign`,
  `action.garab*`, `GarabButton`, the `garab` icon, tier id `supporter`,
  `is_supporter()`, `is_supporter_only`, `not_supporter`.

**Spot-check (12 Sep): the core strings comply.** Evidence: en.ts:85-88,
so.ts:83-88, and the tier display name in `20260912000000:18`. Four items
remain for native or owner review; none is a ruling-A violation:

- The only Somali "Taageere" left is the Early Backer badge (so.ts:773,
  "Taageere Hore"). It is allowlisted in `vocabulary.test.ts:93` as a
  capital-era badge, not the tier, but it now sits next to the Support
  action's word.
- The SO count "{count} qof ayaa taageeray" is past tense ("supported"); the
  EN is present ("support this").
- `lab.eventCandidateCreated` reads "Put forward as a Venture" (en.ts:1584),
  which blurs Candidate and Venture.
- The "Lab Lead" badge ("Hoggaamiye Warshad") is awarded on **every** Space
  creation, Club or Lab (`apps/web/src/app/api/labs/route.ts:135-136`). It
  is a credibility label that does not match what the member did.

### B. Xidig Plus doctrine and the mechanics conflict

Xidig Plus is **patronage, resource and convenience only**. It does not buy
trust, verification, ranking, governance votes, capital access, candidate
powers, Lab/project creation or professional credibility.

- The current implementation still gates the candidate vote, putting
  candidates forward and Lab creation behind the paid tier. **This conflicts
  with the doctrine.**
- Do not sell those powers in copy.
- The mechanics need a **separate implementation slice** (§4 plans it).
- Until it lands, label eligibility **neutrally as under review**, and do not
  describe it as a paid benefit.

Rulings for the future mechanics:

1. **Candidate vote.** Not a paid-tier benefit. Xidig Plus must not determine
   voting eligibility. Treat it as eligibility-under-review until a non-paid
   eligibility rule is implemented. Recommended future direction: active
   eligible members; one account/person, one **advisory** project-review vote;
   hidden live tallies and anti-abuse controls. It is not binding governance,
   and it is not Xidig Plus.
2. **Candidate submission (putting candidates forward).** Not a paid-tier
   benefit. It should become submission for review by an active
   project/Space owner or an admin, subject to platform criteria and review.
   No automatic capital or funding activation.
3. **Lab/project creation.** Ordinary collaboration and project creation must
   not be paid-gated, and free users must be able to complete a real project.
   Xidig Plus may raise resource or owned-Space limits only. Where the current
   "Lab" is entangled with the Candidate/Venture/capital ladder, split ordinary
   Projects from capital/candidate escalation **before** broadening.

**Constraint:** do not broaden candidate, governance or capital access without
an approved non-paid eligibility model.

### C. Second-pass rulings (12 Sep 2026): the P1 questions answered

- **Final policy (unchanged):** Xidig Plus must not gate governance,
  candidate votes, candidate submission, Lab/project creation, capital paths,
  verification, ranking, trust or professional credibility. It provides only
  patronage, resource and convenience benefits.
- **"Pause, don't broaden" is the first slice.** Do not simply open Lab
  creation to free users while Lab is entangled with Candidate/Venture/capital
  escalation.
- **Lab creation and promotion:** paused wherever they function as an
  escalation, capital or candidate lane. **Implemented:** paused for everyone,
  admins included. No admin carve-out was ruled.
- **Existing Labs** keep ordinary management and collaboration continuity
  only. **Existing Lab leads do NOT keep special candidate, Venture or capital
  escalation rights** by virtue of the old Plus mechanics. Implemented: the
  handoff and Venture promotion are paused for every lead (question 2
  answered).
- **Candidate voting:** paused and neutralised as "eligibility under review"
  until a non-paid model is approved. Implemented.
- **Candidate submission:** move toward review submission by an active
  Space/project owner or admin under platform criteria, not paid status. If
  that cannot be done safely in the first slice, pause it. **Implemented as a
  pause**, because no platform criteria exist. `POST /api/candidates` is
  retired (question 3 answered).
- **Live tallies:** strip them from the normal API/UI at the same time the
  vote is paused, and close the direct tally function. Implemented (question
  4 answered): `candidate_vote_tally` is server-only, and `service_role` is
  the one narrowly scoped path. No app route reads it while the vote is
  paused.
- **Row deletion:** only after the app no longer depends on the rows.
  Implemented as a separate, deploy-order-gated commit and migration.
- **ToS and legal copy:** product-facing and public tier-list copy uses
  neutral interim language. For ToS clauses, use the smallest interim
  placeholder that stops promising forbidden powers, mark it for legal review
  and versioning, and claim no final legal wording. Implemented (questions 5
  and 6 answered): only the "which unlocks …" claim was removed. The clause
  is marked LEGAL REVIEW PENDING **in the source** (a dictionary comment; the
  public page shows no marker), and `TERMS_VERSION` and the public "Last
  updated" date are unchanged, pending legal.
- Native Somali and legal review remain required, and nothing is claimed
  final.

### D. Third-pass rulings (12 Sep 2026): the two questions P1 left open

**1. Capital-need declaration: paused.**

- Even though no money moves and no tier is consulted, it is capital-adjacent
  and can imply an active funding or escalation path.
- Recorded capital-need data stays preserved and read-only for authorised
  users. Historical records are not deleted.
- CTAs and copy that invite a new declaration are removed or neutralised,
  with wording like "capital pathway under review".
- Any future capital-need model stays gated under the capital/P3 review path,
  with legal and product approval.

**Implemented (`1aa147f`):**

- `POST /api/labs/[id]/capital` refuses a lead or manager, admins included,
  with `capital_pathway_under_review` 403. The refusal is CTA-free. It comes
  after the active-account guard and the leadership check, so anyone else
  still gets `forbidden`.
- Nothing is parsed, rate-limited, written, logged or emitted.
- The only insert path (`declareCapitalNeed`) and its input schema are gone.
  Clients never held insert rights on `venture_capital_needs`.
- `GET` still returns a need recorded before the pause.
- There was no declare form in the UI. The capital tab's "What works today"
  row no longer claims the declared need works; it now reads "paused while
  the capital pathway is under review".

**2. Timeout demotion: paused.**

- Automatic Venture → Lab demotion is paused while re-promotion and
  escalation are paused. A one-way automated demotion would be unfair, and it
  could corrupt project state while the ladder is under review.
- Existing state and history are preserved.
- If needed, the mutation is replaced by a private "needs review" marker or
  operator note. Public state does not change automatically.
- Owner reminders and check-ins may continue only if they do not demote,
  shame, widen access or imply wrongdoing.

**Implemented (`1aa147f`):**

- The daily Labs sweep calls neither `warn_timed_out_ventures()` nor
  `demote_timed_out_ventures()`. The sweep's warning notice promised a return
  to Lab, so it stops too: it would now be untrue, and its stamp exists only
  to arm the demotion.
- Both RPCs stay in the schema, service-role only and uncalled.
- Existing `demotion_warned_at` and `demoted_at` values, past Governance Log
  entries and past notifications are untouched.
- **The private marker is a read-only count.** The cron response carries
  `venturesPastTimeout`, a head-only count of Ventures idle past 84 days, for
  operator review. It writes nothing, stamps nothing and notifies no one. No
  new column and no migration.
- **The check-in that continues** is the existing 28-day dormancy nudge
  (`mark_dormant_labs`: a marker and "revive it with an update"). It never
  changed a stage.
- **Copy:** the index law, the dormancy notice and footer, and the
  pre-pause warning notice (it renders at read time) no longer promise
  automatic demotion. They say the stage does not change on its own while
  the stage rules are under review. The notice for a demotion that really
  happened stays, as true history.
- The overview model's unrendered `demotion` deadline field is removed.

**Before any un-pause:** a Venture warned before the pause keeps its old
`demotion_warned_at`, and the demote RPC's grace check would count that as
notice already given. Re-warn from a clean stamp first. Never resume the
demote pass straight onto a stale warning.

**Tests:**

- `apps/web/src/app/api/labs/capital-demotion-pause.test.ts`:
  - every manager role is refused with no write, rate limit, emit or tier
    lookup;
  - non-managers get `forbidden`, and `GET` still reads;
  - the cron never calls warn or demote and never updates;
  - the count is head-only;
  - source scans: no `venture_capital_needs` write, no warn/demote `rpc(...)`,
    no new demotion notification, no app update of a Venture to `lab`
    (Club → Lab only, guarded on `space_mode='club'`), and no tier check in
    either path.
- `vocabulary.test.ts`: no copy promises an automatic demotion or invites a
  new need, in either locale. A self-check confirms the pre-slice strings
  fail it.

## 2. Where the paid tier still decides a forbidden power (pre-P1 audit record)

Read-only audit of `384b840`, 12 Sep. Each finding was re-checked at file:line
by an independent verifier. Tier id `supporter` = Xidig Plus. The `free` tier
holds **no** capability rows, and no other tier exists.

**Where it is enforced.** Every paid gate below is enforced in the **app
route**. The capability is read through the `has_capability()` RPC
(active-only). At the DB, client writes to `labs`, `venture_candidates` and
`candidate_votes` are revoked, so there is no direct PostgREST bypass
(`packages/db/supabase/migrations/20260704200000_phase1_auth.sql:512`;
`20260706200000_phase4_labs.sql:198`). **No** RLS policy, trigger or SQL
function calls `has_capability`. The only DB-enforced tier gate is
`supporter_spaces` (row 7).

| #   | Mechanic                                                                  | Paid gate                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Ruling       |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Candidate vote: cast **and** retract; whether the vote panel shows at all | `vote_candidate`                                      | `apps/web/src/app/api/candidates/[id]/vote/route.ts:34`; `apps/web/src/app/c/[id]/page.tsx:115`; seed `schema.sql:1279`                                                                                                                                                                                                                                                                                                                                                                                                                               | B1 ✗         |
| 2   | Candidate creation via `POST /api/candidates`                             | `builder_path`                                        | `apps/web/src/app/api/candidates/route.ts:52`. Admits **any** active non-observer member of **any** Space (`space_mode` is selected, never checked). No UI caller; nobody is notified.                                                                                                                                                                                                                                                                                                                                                                | B2 ✗         |
| 3   | Lab creation (`POST /api/labs`, `mode='lab'`)                             | `create_lab`                                          | `apps/web/src/app/api/labs/route.ts:99`; seed `schema.sql:1277`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | B3 ✗         |
| 4   | Club → Lab promotion                                                      | `create_lab`                                          | `apps/web/src/app/api/labs/[id]/promote/route.ts:80`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | B3 ✗         |
| 5   | **Escalation through the Lab rung** (the back door)                       | indirect: members reach a Lab through `create_lab`    | Candidate handoff (`promote/route.ts:86`) and Venture promotion (`promote/route.ts:65`) need only lead/admin + `space_mode='lab'`, with no capability and no review. Listed Labs appear on the capital-branded Maal index (`apps/web/src/lib/maal/constants.ts:18`; `is_listed` defaults to true). Escalation never re-checks the tier. A Lab can also arise without the lead's own Plus: an admin promotes any Club using the **admin's** `create_lab`, and the Venture timeout demotes to Lab whatever the tier. On Dev all 3 Labs have free leads. | B2/B3 ✗      |
| 6   | `governance_rights`, `investor_path` granted to the paid tier             | dormant (enforced nowhere)                            | Seed `schema.sql:1280,1282`. **Advertised publicly**: `list_visible_tiers()` (callable by anon) returns the tier's full capabilities array, including `create_lab`, `vote_candidate`, `governance_rights`, `builder_path` and `investor_path` (`20260704200000_phase1_auth.sql:170-189`).                                                                                                                                                                                                                                                             | B ✗          |
| 7   | Plus-only Spaces                                                          | `supporter_spaces`, **DB-enforced** in `can_read_lab` | `20260706200000_phase4_labs.sql:103-116`. Applies only to signed-in **non-members** reading a `visibility='members'` Space; the lead, mods, active members and public Spaces bypass it. The lead or a platform admin can set `is_supporter_only` through the API; there is no UI control, and no copy discloses it.                                                                                                                                                                                                                                   | ? owner (Q4) |

**Not paid-gated, but relevant to B1/B2:**

- **Live tallies are readable.** `candidate_vote_tally` is EXECUTE-granted to
  `authenticated`, with no readability or eligibility check
  (`20260707000000_phase5_capital.sql:169`). `GET /api/candidates/[id]` (and
  the PATCH/submit/decision responses) return `voteTally` to every reader of
  the candidate (`apps/web/src/app/api/candidates/[id]/route.ts:46`). Only the
  `/c/[id]` page hides it. B1's "hidden live tallies" is not met.
- **Submission auto-opens the vote.** Submit (creator, lead/core or admin; no
  capability) opens a 7-day vote window
  (`apps/web/src/app/api/candidates/[id]/submit/route.ts`). A creator who has
  left the Space can still submit.
- **One vote per account, not per person.** Only a unique
  `(candidate_id, voter_user_id)` constraint (`schema.sql:896`). Ballots from
  deleted accounts still count.
- **Who holds Plus is readable.** `profiles.membership_tier_id` is in the
  member column grant and the profiles SELECT policy is `using (true)`, so any
  signed-in member can list Plus holders over PostgREST
  (`20260704200000_phase1_auth.sql:438`). No UI shows it. The only owner read
  path is `/api/me/export` under the caller's RLS, so a column revoke would
  need that read moved first.
- **Capital stays contained (aligned).** Invest/gate/fund-interest refuse every
  caller with `capital_unavailable`; a reviewer decision never writes
  `funded_at` (A2).
- **Grace accounts on this lineage.** Active-only `has_capability` already
  keeps a `pending_deletion` account from creating or promoting a Lab. It does
  not stop the ungated escalations: handoff, Venture promotion, submit and
  ledger writes all use `requireUser`. The deletion branch adds
  `requireActiveUser` to those paths.
- **No regression tests for escalation.** Nothing on this branch tests
  `/promote` (the `lab`/`candidate`/`venture` targets), `POST /api/candidates`,
  `isCandidateManager` or submit. The only Lab-gate test is the `create_lab`
  403 (`apps/web/src/app/api/labs/route.test.ts:345`).
- A draft candidate's id and name reach `lab_events` (`candidate_created`),
  which anyone who can read the Space can read directly, although
  `can_read_candidate` hides drafts.
- The applied migration `20260912000000` says the tier rows gate "candidate
  submission" (lines 12-13). In fact they gate candidate **creation**
  (`builder_path`); submit is ungated. Record only — applied migrations are
  never edited.

**Aligned:** `elevated_limits` (5 posts/10 comments free vs 25/50 Plus) is a
resource allowance. `join_unlimited_labs` and `intelligence_updates` are
granted but enforced or built nowhere. No per-user owned-Space or join limit
exists; the only Lab limit is 5 creations/day for everyone
(`apps/web/src/lib/labs/constants.ts:52`). So "Plus raises owned-Space limits"
has no free baseline yet.

**Is the Lab entangled?** Yes (B3's condition is met). Mechanically, a **Club
is already a complete free ordinary project**. It has updates, artifacts, the
decision log, roles, join/invite/request, skill needs, collaborations, Space
events and media, with no paid gate and no mode check. What Lab mode adds is
the escalation rungs in row 5, plus creation-time charter, playbook and sprint
stamping. **Granting `create_lab` to free members would therefore broaden
candidate and Venture escalation** and flood the capital index. The
ordinary-project gaps are UI, not paid gates: no UI to accept requests,
invite, set roles or remove members; no lead transfer; no close/complete
control; the task board only runs in Venture mode.

## 3. Copy that sells or states the paid gate (pre-P1 audit record)

Class **A** sells a forbidden power as a Plus benefit. Class **B** states the
current paid gate as a requirement rather than neutrally as "under review".

| Copy                                                                                                       | Text (EN; SO twin carries the same meaning)                                                                             | Class                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marketing.termsFeesBody` (en.ts:1995-1996, so.ts:1903-1904) — public `/terms`                             | "Xidig Plus membership — which unlocks creating Labs, putting candidates forward, and voting in community governance —" | **A**. Legal text: 12 Sep "renamed only → legal review". Pinned by `vocabulary.test.ts:130-132`.                                                                                                        |
| `not_supporter` CTA `action.upgradeSupporter` (`apps/web/src/lib/errors.ts:180-182`; en.ts:116, so.ts:119) | "Upgrade for $1/month" → `/settings`                                                                                    | **A**. An upsell on every Lab, candidate and vote refusal. `/settings` has no upgrade and billing is not live.                                                                                          |
| `error.notSupporter` (en.ts:275, so.ts:1123)                                                               | "Creating a Lab requires Xidig Plus."                                                                                   | **B**. It is also the message for **vote** and **candidate** refusals (wrong reason). Those reach a user only via raw API JSON or a stale vote panel.                                                   |
| `lab.modeLabHint` (en.ts:1433)                                                                             | "Serious — a charter-backed venture track. Needs Xidig Plus."                                                           | **B**. It also frames the paid Lab as the "serious" venture track; `vocabulary.test.ts:172` allowlists its wording. The Labs empty state says "open a Lab to build a venture" (en.ts:1426, so.ts:1349). |
| `lab.createSupporterNote` (en.ts:1434, so.ts:1357)                                                         | "Creating a Lab requires Xidig Plus."                                                                                   | **B**. `/labs/new` never pre-checks, so a free member fills in the charter and then hits the 403 + upsell.                                                                                              |
| `capital.voteEligibilityNote` (en.ts:1757)                                                                 | "Eligibility is under review. Current access requires Xidig Plus."                                                      | **B**, **owner-ruled 12 Sep**. Pinned by `vocabulary.test.ts:121-125` and `vote-panel.test.tsx:32-44`.                                                                                                  |
| `capital.submitHint` (en.ts:1732-1733; so.ts:1649)                                                         | "Submitting opens a 7-day candidate vote and sends it to reviewers. … current voting access requires Xidig Plus."       | **B** (derivative of the ruled note). Also untrue in both locales: nothing notifies reviewers on submit.                                                                                                |
| `lab.settingsPromoteHint` (en.ts:1558-1559) and the home Labs block                                        | "Clubs promote to Labs by completing the charter."                                                                      | A hidden paywall: silent about the `create_lab` gate.                                                                                                                                                   |
| `marketing.capitalTeaserBody` (en.ts:1890-1891)                                                            | candidates "face a member vote"                                                                                         | Inaccurate while only paid holders can vote. (`capital-teaser.test.ts:55-58` is weaker than its comment: `eligib` and `return` sit inside `\b…\b`, so "eligibility" and "returns" never match.)         |
| `error.postLimit`/`commentLimit` (`apps/web/src/lib/errors.ts:146`)                                        | "free members can post 5 times per day … upgrade for higher limits"                                                     | A truthfulness gap, not a doctrine conflict. It is shown to Plus members at their higher cap too, and no upgrade exists.                                                                                |
| `membership` intro (en.ts:1913)                                                                            | "One community, two levels." (SO "Hal bulsho, laba heer.")                                                              | Mild tension with the doctrine; never ruled on.                                                                                                                                                         |
| Membership teaser / plan card (en.ts:1853, 1917-1919)                                                      | real allowances + "Xidig Plus does not buy trust, verification, ranking, governance rights or capital access."          | **Aligned.** The "never sells" lock checks only these two EN keys, not their SO twins or any key above.                                                                                                 |

**Docs:** `prd.md` (owner-canonical; calls itself the single source of truth)
still describes the paid tier as buying Lab creation, candidate votes,
governance rights and the Builder/Investor paths. It specs the upgrade CTA
twice: `prd.md:717`, "You need a Supporter membership to do this. Upgrade for
$1/month →", and `:742`.
`docs/social-app-extras-plan.md:22` ladders paid membership into governance.
`docs/phase-0-schema-notes.md:151` says RLS gates on `has_capability`; no
policy does.

## 4. Smallest safe slice — P1 "take Plus out of the decision: pause, don't broaden" (implemented; see Status)

**Principle:** remove the paid tier as the determinant. Where an approved
non-paid rule exists and it **narrows** access, use it. Everywhere else,
**pause** with neutral "under review" copy. Nothing becomes broader, and
every intermediate or rolled-back state gives at most today's access.

> **As implemented** (owner rulings §1C; corrected after the 12 Sep adversarial
> review). The steps below are the plan; this is what actually shipped:
>
> - **Step 1:** shipped, including the post-limit copy ("upgrade for higher
>   limits" is gone). The ToS clause got only the owner's smallest interim
>   change: the "which unlocks …" claim was removed. The suggested placeholder
>   wording and the `TERMS_VERSION` bump were NOT applied; they belong to the
>   legal review. The public `/terms` "Last updated" date is legal's call too.
> - **Step 2:** Lab creation and promotion are paused for **everyone**, with
>   no active-admin interim.
> - **Step 3:** `POST /api/candidates` is retired. **Submission is PAUSED for
>   every manager.** It was not narrowed to an active lead/admin, because no
>   platform criteria exist (owner ruling). Leads of existing Labs keep no
>   handoff and no Venture promotion; every `/promote` target is paused.
> - **Step 4:** the vote is paused. Submit writes nothing, so it opens no
>   window. The app-side tally strip shipped. Withdrawing your own ballot works
>   window or not, and the paused notice offers a "Retract vote" control to a
>   pre-pause voter.
> - **Steps 5–6:** shipped as written (`5b5e808`, `20260912100000`).
> - **Also shipped, from the review:**
>   - public and app surfaces that still invited paused actions are
>     neutralised (the `/capital` CTA and subtitle, the Maal teaser, law,
>     empty state and dormancy footer, the Venture-demotion notice, the
>     ledger-locked error, the front-door Labs block, the candidate editor
>     subtitle and the board's empty state);
>   - the Dev seed test no longer requires Plus for ballots;
>   - the guards that went vacuous once no tier held the rows are hardened.
> - **Left open at P1, then ruled (§1D) and paused in `1aa147f`:**
>   - capital-need declaration on existing Ventures;
>   - the Venture → Lab timeout demotion.
>
> On the base: the integration branch holds the retention line, Packet B and
> naming, as recommended here.

**Base (owner call; merges are gated).** Build P1 on **one integration
branch** shared with the retention work (`docs/retention-implementation-plan.md`
on `claude/retention-doctrine`). It holds the retention line (`cbcc297`, which
contains `94dfc01`, `998f991`, `82daa4c` and `7162c1c`), Packet B (`42d10e3`)
and this branch (`384b840`). Do not build P1 on `384b840` alone. Both lanes
edit `en.ts`/`so.ts` and add migrations after `20260912000000`, so reserve
migration numbers and sequence the dictionary changes. Reasons:

- This lineage has no `requireActiveUser` and no `has_entitlement`. Any path
  P1 leaves open (submit, handoff) needs an active-account check.
- Most files P1 edits changed only on the deletion side: `lib/errors.ts`,
  `space-form.tsx`, `space-settings-form.tsx`, `app/labs/new/page.tsx`,
  `app/c/[id]/edit/page.tsx`. Building on naming alone multiplies conflicts.
  Both sides changed `app/c/[id]/page.tsx`, the capital badge and rubric, and
  both dictionaries.
- A semantic conflict needs fixing in the merge commit. The deletion
  branch's `client-lifecycle-gate.test.ts:258-265` calls
  `candidate_interest_counts` as a member, but Packet B
  (`20260911001000`) revoked that.
- New migrations sort after `20260912000000`. P1 must **never re-create**
  `has_capability`, `is_supporter`, `has_entitlement`, `can_read_lab` or
  `candidate_vote_tally`: a naming-side body would sort after the deletion
  branch's and undo grace entitlements.
- **Fallback:** if integration is not approved yet, only step 1 (copy and
  refusals) may start on `384b840`.

### Steps (in this order)

1. **Neutral refusals and copy.** This changes no mechanics, and it is the
   ruling's "until fixed, label neutrally".
   - Replace `not_supporter` with three CTA-free codes:
     `lab_eligibility_under_review`, `put_forward_under_review` and
     `vote_eligibility_under_review`. Switch the four throw sites
     (`labs/route.ts:100`, `promote/route.ts:80`, `candidates/route.ts:53`,
     `vote/route.ts:34`). Retire the "Upgrade for $1/month" CTA from them.
   - The Lab option on `/labs/new` and the settings promotion ladder show the
     neutral state, and are offered only where the server would accept.
   - Copy (EN drafts; every SO change is provisional pending native review):
     - `error.notSupporter`, `lab.modeLabHint` (drop "Needs Xidig Plus" and
       "venture track"), `lab.createSupporterNote`,
       `lab.settingsPromoteHint`, the Labs empty state
       ("open a Lab to build a venture");
     - `capital.voteEligibilityNote` → "Eligibility is under review." (this
       drops the owner-ruled "Current access requires Xidig Plus" — owner
       question 5);
     - `capital.submitHint` drops the vote promise, Plus and the untrue
       "sends it to reviewers";
     - `marketing.capitalTeaserBody` drops "face a member vote";
     - `error.postLimit`/`commentLimit` stop saying "upgrade for higher
       limits": no upgrade exists, and Plus members see it at their higher
       cap too.
   - **ToS fees clause → legal.** Suggested placeholder: "optional patronage
     that helps keep Xidig running and raises your daily posting and comment
     allowances", plus the already-approved "does not buy" sentence.
     - It needs legal sign-off **and** a `TERMS_VERSION` bump with a
       re-acceptance path before release. `TERMS_VERSION` is still
       `'2026-07-04-draft'` (`apps/web/src/lib/auth/constants.ts:25`).
     - Bundle it with the retention lane's content-licence clause (en.ts:1979,
       "ends when you delete the content or your account") and the
       legal-blocked deletion copy (`5f3d3b3`), so there is one bump and one
       legal pass.
     - Flip `vocabulary.test.ts:130-132`.
   - Widen the lock to both locales: no value pairs Xidig Plus with Labs,
     candidates, voting, governance or capital, except the "does not buy"
     sentence. No CTA on any vote, candidate or Lab refusal.
   - Rollback: revert the commit.
2. **Pause the Lab rung.** The Club stays the free ordinary project.
   - Lab creation (`POST /api/labs`, `mode='lab'`) and Club→Lab promotion
     are refused with `lab_eligibility_under_review` instead of
     `hasCapability('create_lab')`. **Recommended interim:** an **active
     admin** can still create a Lab or promote a Club, judged by role, never
     by tier. That rule is non-paid, narrower than today, and platform-reviewed.
     A full pause for everyone is the alternative (owner question 1).
   - Club creation is untouched (grace members keep it, per the 11 Sep
     grace ruling).
   - Existing Labs and Ventures are untouched.
3. **One way to put a candidate forward, narrower than today (B2).**
   - Retire `POST /api/candidates`: the `builder_path` entrance, open to any
     member of any Space, with no UI caller and no notice.
   - The lead/admin handoff (`/promote target='candidate'`) stays; it is
     already non-paid.
   - Submit is limited to the **active** Space lead or an **active** admin,
     re-checking current membership. It goes to the review queue only; A2
     keeps capital refused.
   - **Default: existing active Lab leads keep the handoff and Venture
     promotion unchanged.** These are non-paid lead/admin rules, so leaving
     them does not broaden anything. Re-checking leads whose Plus has
     lapsed, or going admin-only until P3 criteria exist, is owner
     question 2.
   - Every admitted escalation writes an audit row. None does today.
4. **Pause the candidate vote (B1).** No approved non-paid rule exists, so a
   pause is the only way to take Plus out without broadening.
   - The vote route refuses a cast with `vote_eligibility_under_review` for
     everyone and never consults the tier. It moves to `requireActiveUser`,
     so any future rule is active-only.
   - A member may still withdraw their own existing ballot, window or not
     (data control, the A2 retraction precedent). Owner question: do old
     ballots still count?
   - `/c/[id]` drops the tier call and shows the paused note to every
     signed-in member, with no tally.
   - **The app-side tally strip ships with the pause.** Every stored ballot
     was cast by a Plus holder, so an API that still publishes the tally
     would present a paid-only electorate's result as a "member vote".
     `voteTally` leaves every non-reviewer response: the GET and PATCH
     responses in `apps/web/src/app/api/candidates/[id]/route.ts:48,110`, the
     submit response in `…/[id]/submit/route.ts:60`, and the decision
     response.
   - Smallest version: submit keeps stamping the window (no lifecycle
     change), and the copy stops promising a vote.
5. **Remove the paid rows (data-only migration, after steps 2–4 are
   deployed).**
   - `delete from public.tier_capabilities where tier_id = 'supporter' and
capability in ('create_lab','vote_candidate','governance_rights','builder_path','investor_path');`
   - Enum values stay: `has_capability` rejects unknown values
     (`20260901000200:22`). No function is re-created. Plus keeps
     `elevated_limits`, `supporter_spaces` (Q4), `join_unlimited_labs` and
     `intelligence_updates`.
   - Effect: `list_visible_tiers()` stops advertising the five, and
     `has_capability` answers false for everyone.
   - Update the `ACTIVE_ONLY_CAPABILITIES` comment in the deletion branch's
     `entitlements.ts`: held by no tier.
   - Rollback: a forward-fix migration re-inserts the five rows with
     `on conflict do nothing` (the `20260901000300:10-13` pattern). If the
     app is reverted while the rows are gone, the gates freeze for everyone;
     nothing broadens.
6. **Close the direct tally RPC (separate, owner-approved; B1 hygiene).**
   - A grant-only migration revokes EXECUTE on `candidate_vote_tally(uuid)`
     from signed-in clients; `service_role` keeps it, and the app already
     calls it that way. The app-side strip already shipped in step 4.
   - Rollback: a forward-fix re-grant.

**Tests.**

- Add:
  - no tier holds an active-only capability, and the Plus capabilities
    equal the ORDINARY set;
  - the public catalog lists only ORDINARY capabilities;
  - no vote, candidate or Lab refusal carries a CTA;
  - the tier is never consulted on vote, promote, candidate create, submit
    or Lab create;
  - Plus and free members are refused alike;
  - grace accounts are refused;
  - `POST /api/candidates` is gone;
  - submit by a non-lead creator is refused;
  - no non-reviewer response carries `voteTally`;
  - `candidate_vote_tally` is not executable by `authenticated` (step 6);
  - the escalation regression net this branch has never had: every
    `/promote` target and mode precondition, `isCandidateManager`, submit.
- Flip on this lineage:
  - `supporter-capability.test.ts:76-82`;
  - `migrations.test.ts:184` (move the `:195-217` canary to
    `elevated_limits`);
  - `auth-foundation.itest.ts:420-446` (its `:435-446` block re-inserts
    `create_lab`, so rewrite it);
  - `apps/web/src/app/api/labs/route.test.ts:345-371`;
  - `vote-panel.test.tsx:32-44`;
  - `vocabulary.test.ts:121-132` and `:172` (the `lab.modeLabHint`
    allowlist);
  - `phase5-capital.test.ts:320-327` (step 6);
  - the `seedSupporter` docstring (`testing/factories.ts:50`);
  - the Dev seed test that requires every seeded voter to be on the
    `supporter` tier (`apps/web/src/lib/seed/test-community/data.test.ts:183`).
    Seeded Dev text still says "Supporter".
- Flip from the deletion lineage:
  - `grace-entitlements.test.ts:101` (a suite-level positive control),
    `:148` and `:210`;
  - `client-lifecycle-gate.test.ts:249-257` and `:332-340` (step 6);
  - `standing-controls.test.ts:16-22` (only if escalation goes admin-only).

**Audit and data.** No Lab, candidate, ballot or Venture is deleted. The step-5
migration header lists the removed rows and cites ruling B. The applied
`20260912000000` is left unedited.

**Blast radius:** billing is not live (the ToS clause says so), so no paying
member loses anything. On Dev: 15 active Plus members, 9 ballots, 0 open vote
windows, 2 candidates (1 draft, 1 in review), 3 Labs (all with free leads),
3 Ventures.

### Deliberately NOT in P1

- An eligibility model for the advisory vote (B1) or escalation review
  criteria (B2). That is **P3**, and it needs owner-approved rules.
- **P2, ordinary-project parity for Clubs.** It can run in parallel with P1,
  and it only widens ordinary collaboration:
  - optional charter, playbook and sprint on Club creation
    (`lib/labs/schemas.ts:108`, `lib/labs/service.ts:99-108`,
    `space-form.tsx:230-302`);
  - membership management in the members tab or settings (reusing
    `POST /api/labs/[id]/members`);
  - a stage/complete control;
  - lead transfer (a new action; owner question);
  - an optional non-ledger task board.

  This is where the Club is reframed as the ordinary Project. It needs a
  ruling on "Koox is social-only".

- Q4 (`supporter_spaces`), billing, `elevated_limits`, capital, the Maal index
  keying, DB triggers, internal identifier renames, and any deletion of
  existing records.

## 5. Open owner questions

Questions 1–6 were answered on 12 Sep (§1C). The capital-need declaration and
the timeout demotion were ruled the same day (§1D). Still open:

1. Q4 Plus-only Spaces (`supporter_spaces`, DB-enforced), and whether
   `intelligence_updates` (an email perk, never built) is a convenience or an
   information advantage.
2. Does "Koox is social-only" (ruling 4) still stand now that the Club is
   mechanically the free ordinary project? This is P2.
3. Should ballots from deleted accounts keep counting? They are restricted
   records now, and no tally is shown.
4. P3: the approved non-paid eligibility model for the advisory vote, and the
   platform criteria for review submission. Until then both stay paused. It
   now also carries the capital pathway: any future capital-need model, with
   legal and product approval, and whether and how the stage timeout resumes.
   A resumption must re-warn first; see §1D.
5. Native review of every new provisional SO string ("waa la hakiyay inta
   xaq-u-yeelashada dib loo eegayo" and the rest). `capital.voteNotEligible`
   ("Hadda xaq uma lihid") was removed.
6. Legal review: the ToS fees clause wording and the `TERMS_VERSION` bump with
   a re-acceptance path, bundled with the content-licence and deletion copy.
