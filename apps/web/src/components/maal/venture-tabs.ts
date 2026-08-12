import type { MessageKey } from '@xidig/i18n';

/**
 * The venture workspace tab row (plan decision D2, frames 7b–7g).
 *
 * A Maal is a Warshad that switched on the org tools — so the workspace is
 * TABS ON THE EXISTING SPACE DETAIL, never a new route tree. Promotion must not
 * change a URL: every existing link, the OG image and the Space's own history
 * hang off `/labs/[slug]`, and PRD §16 says switching mode is a setting, not a
 * rebuild.
 *
 * Two things this module owns, because a page component would forget them one
 * at a time:
 *
 *  1. **Order.** The frames put Shaqo directly after Guud and Wax-ku-darsi /
 *     Maalgashi at the end — the venture reads as an organisation, not as a Lab
 *     with three bolt-ons. `members` and `history` keep their existing places at
 *     the tail.
 *  2. **Who sees what.** 7e is the non-member view and it is explicit: "Shaqada,
 *     faylalka, iyo diiwaanka wax-ku-darsiga waxay u furan yihiin xubnaha
 *     kaliya". Those tabs are ABSENT for a non-member, not disabled — a disabled
 *     tab advertises a room and then locks it, which is the opposite of what the
 *     "Waxa dadweynahu arkaan" card promises. `capital` joins them because
 *     `venture_capital_needs` is a members-or-mods table.
 *
 * The labels come from `maal.tab*` where the frames gave the venture its own
 * register (Guud / Wada-hadal / Lifaaqyo) and from `lab.tab*` where the word is
 * already the same one (Go'aanno / Xubno / Taariikh) — one canonical word per
 * concept, so a rename cannot disagree with itself.
 */

/** Tabs a Koox or a Warshad shows — unchanged by this dispatch. */
export const SPACE_TABS = [
  'overview',
  'updates',
  'artifacts',
  'decisions',
  'members',
  'history',
] as const;

/** The three tabs a venture adds (D2). */
export const VENTURE_ONLY_TABS = ['work', 'ledger', 'capital'] as const;

export type SpaceTab = (typeof SPACE_TABS)[number] | (typeof VENTURE_ONLY_TABS)[number];

/** Venture order: Guud · Shaqo · Wada-hadal · Lifaaqyo · Go'aanno · Wax-ku-darsi · Maalgashi. */
const VENTURE_TAB_ORDER = [
  'overview',
  'work',
  'updates',
  'artifacts',
  'decisions',
  'ledger',
  'capital',
  'members',
  'history',
] as const satisfies readonly SpaceTab[];

/** Members-only on a venture (7e). Absent from a stranger's render, not disabled. */
const MEMBERS_ONLY_TABS = new Set<SpaceTab>(['work', 'artifacts', 'ledger', 'capital']);

/**
 * The ledger has a SECOND gate on top of membership: `ledger_visibility`, which
 * the members themselves set on the 7b rail. When they voted it to leads only,
 * `resolveVentureViewer` returns `canReadLedger: false` for a plain member and
 * the read model answers 403 — so the tab must not be offered either. Same
 * doctrine as 7e: absent, not disabled, because the absence IS the members'
 * decision rather than an error the member has to walk into.
 */

export const SPACE_TAB_KEYS: Record<SpaceTab, MessageKey> = {
  overview: 'lab.tabOverview',
  updates: 'lab.tabUpdates',
  artifacts: 'lab.tabArtifacts',
  decisions: 'lab.tabDecisions',
  members: 'lab.tabMembers',
  history: 'lab.tabHistory',
  work: 'maal.tabWork',
  ledger: 'maal.tabLedger',
  capital: 'maal.tabCapital',
};

/** The venture register — the frames' own words for the shared tabs. */
export const VENTURE_TAB_KEYS: Record<SpaceTab, MessageKey> = {
  ...SPACE_TAB_KEYS,
  overview: 'maal.tabOverview',
  updates: 'maal.tabUpdates',
  artifacts: 'maal.tabArtifacts',
};

/**
 * The tab row for one viewer of one Space.
 *
 * `isVenture` false → the existing six, untouched. True → the venture order,
 * minus the members-only tabs when the viewer is neither a member nor a
 * platform mod, and minus the ledger when the members voted it to leads only.
 */
export function spaceTabs({
  isVenture,
  isMember,
  canReadLedger = true,
}: {
  isVenture: boolean;
  isMember: boolean;
  /** `VentureViewer.canReadLedger` — false folds the ledger tab away. */
  canReadLedger?: boolean;
}): readonly SpaceTab[] {
  if (!isVenture) return SPACE_TABS;
  const tabs = isMember
    ? VENTURE_TAB_ORDER
    : VENTURE_TAB_ORDER.filter((tab) => !MEMBERS_ONLY_TABS.has(tab));
  return canReadLedger ? tabs : tabs.filter((tab) => tab !== 'ledger');
}

/** Resolve `?tab=` against what this viewer may actually open. */
export function resolveTab(raw: unknown, tabs: readonly SpaceTab[]): SpaceTab {
  return tabs.find((tab) => tab === raw) ?? 'overview';
}
