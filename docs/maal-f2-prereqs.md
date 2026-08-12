# Maal F2 — prerequisites (decided)

Recorded 12 Aug 2026. Supersedes `.superpowers/sdd/maal-f2-prereqs.md` (deleted — that note
framed the demotion question as open with options a/b/c for Warya to choose; it is not open
anymore).

## 1. Doctrine — DECIDED, not up for debate

- Warshad graduates into Maal when the required venture/work conditions are met.
- Maal auto-demotes back to Warshad through the system timeout path.
- Demotion is system-driven, never user-initiated.
- Demotion must be publicly logged in the Governance Log.
- Demotion must not erase the venture's work history, ledger, contribution record, or prior
  decisions — it changes current stage/status only; it never rewrites history.
- Member votes remain one-verified-member-one-vote.
- Reputation may gate nomination/eligibility where already specified, but never gives vote
  weight.
- Ledger units are economic/contribution records, not reputation points.
- Koox never appears on the Maal index.

## 2. Repository doctrine — brought into line (12 Aug 2026)

These files previously carried the superseded framing and have been corrected in this pass.
The old wording is deliberately not reproduced here: it is refuted, and repeating it invites
someone to treat it as a live alternative.

- `prd.md` §16 — merit ladder + system-timeout demotion, publicly logged, history-preserving.
- `docs/rls-phase4-labs.md` — invariant restated as: user-initiated demotion forbidden,
  system-role timeout demotion allowed and logged.
- `packages/db/supabase/migrations/20260706200000_phase4_labs.sql` — comments only (the
  migration is already applied to Dev; zero executable lines changed).
- `apps/web/src/lib/labs/sweeps.ts`, `apps/web/src/lib/labs/schemas.ts` — comments only.
- `packages/db/src/phase4-labs.test.ts` — see §4.

## 3. What is and isn't built — read carefully before touching code

`mark_dormant_labs()` (in the phase4 Labs migration) marks dormancy only: it sets
`dormant_since` and writes a `marked_dormant` history event. It does not change stage. **No
system-timeout demotion code exists in this repository today** — not on the Club/Lab dormancy
path, and not on the Venture (Maal) → Lab (Warshad) path.

Maal F2 must therefore **build**, not just document:

- The system-role timeout demotion path (Maal → Warshad on inactivity/timeout criteria).
- Its Governance Log entry (public).
- The history-preserving stage change (ledger, contribution record, and prior decisions stay
  intact; only current stage/status changes).
- Real tests converting the three pending/todo specs in `packages/db/src/phase4-labs.test.ts`
  into tests that exercise the actual system-driven demotion path.

Do not mark any of the above green until the code lands. Documentation and comment fixes in
this pass describe the decided doctrine; they are not a substitute for the implementation.

## 4. Carried-forward Maal rulings

- Ruling 1: full filterable ledger on mobile AND desktop — no reduced mobile summary.
- Ruling 4: Koox never on the Maal index (staged work orgs only: Warshad → Venture).
- Ruling 5: ledger units are economic and member-voted; reputation gates nomination only —
  never vote weight, never economic units.
- `Maal Capital.dc.html` is superseded — compliance copy reference only; `Maal Venture.dc.html`
  (7a–7g) is current.

## 5. Dev migration state

Aniga's and Munaasabado's migrations are applied on Dev. Fariimo's `20260810000000_fariimo_voice`
and `20260810003000_fariimo_silent_decline` are still pending — a plain `supabase db push` may
skip them, so use `--include-all` or apply directly.
