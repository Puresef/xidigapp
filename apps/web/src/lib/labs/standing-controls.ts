/**
 * Which Space / candidate controls a viewer is OFFERED, from the Space mode,
 * their role and their ACCOUNT standing (owner ruling, 11 Sep: the UI must not
 * invite actions the server refuses).
 *
 * The server refuses a non-active account (the deletion grace) every
 * escalation — promotion, Candidate handoff, candidate edit/submit, Lab
 * creation — and every Venture-state change: Venture settings, the decision
 * log, membership (requireActiveUser / requireActiveForVenture). Ordinary
 * Club/Lab management stays open to the grace, so those controls stay.
 * Server enforcement is independent of this; this only keeps surfaces honest.
 */

export interface SpaceControlFacts {
  spaceMode: 'club' | 'lab' | 'venture';
  /** The viewer leads this Space. */
  isLead: boolean;
  /** Lead, core or member (not an observer). */
  isContributor: boolean;
  /** isActiveAdmin(ctx.appUser). */
  activeAdmin: boolean;
  /** ctx.appUser.status === 'active'. */
  accountActive: boolean;
}

export interface SpaceControls {
  /** The Settings link (the settings page is refused outright on a Venture in grace). */
  showSettingsLink: boolean;
  /** The decision-log composer. */
  canRecordDecision: boolean;
  /** Promote to Lab / put forward as a Candidate. */
  canEscalate: boolean;
}

export function spaceControls(f: SpaceControlFacts): SpaceControls {
  const ventureLocked = f.spaceMode === 'venture' && !f.accountActive;
  return {
    showSettingsLink: (f.isLead && !ventureLocked) || f.activeAdmin,
    canRecordDecision: f.isContributor && !ventureLocked,
    canEscalate: f.accountActive && (f.isLead || f.activeAdmin),
  };
}

export function candidateControls(f: { isEditor: boolean; accountActive: boolean }): {
  canEdit: boolean;
} {
  return { canEdit: f.isEditor && f.accountActive };
}
