import type { MessageKey } from '@xidig/i18n';

/**
 * Enum → i18n key maps for Labs UI. Pure data (no server imports) so both RSCs
 * and client components can drive copy off a Space's columns. The Warshad ⇄ Koox
 * chrome swap is just CHROME_KEYS[space_mode] — reusing the locked term.lab /
 * term.club vocabulary (EN Lab/Club · SO Warshad/Koox).
 */

/**
 * Dynamic chrome per stage. Maal (F2 §5) added the third rung: 'venture' reads
 * from the `maal.*` namespace rather than `term.*` because the frames give the
 * stage its own tag copy (EN Venture · SO Maal) — one canonical word per stage,
 * so a rename can never disagree with itself.
 */
export const CHROME_KEYS: Record<'club' | 'lab' | 'venture', MessageKey> = {
  club: 'term.club',
  lab: 'term.lab',
  venture: 'maal.stageVenture',
};

/** §16 venture ladder in order — drives the card stage stepper. */
export const STAGE_ORDER = ['idea', 'building', 'validating', 'launched'] as const;

export const STAGE_KEYS: Record<'idea' | 'building' | 'validating' | 'launched', MessageKey> = {
  idea: 'lab.stageIdea',
  building: 'lab.stageBuilding',
  validating: 'lab.stageValidating',
  launched: 'lab.stageLaunched',
};

export const ROLE_KEYS: Record<'lead' | 'core' | 'member' | 'observer', MessageKey> = {
  lead: 'lab.roleLead',
  core: 'lab.roleCore',
  member: 'lab.roleMember',
  observer: 'lab.roleObserver',
};

export const VISIBILITY_KEYS: Record<'private' | 'members' | 'public', MessageKey> = {
  private: 'lab.visPrivate',
  members: 'lab.visMembers',
  public: 'lab.visPublic',
};

export const VISIBILITY_HINT_KEYS: Record<'private' | 'members' | 'public', MessageKey> = {
  private: 'lab.visPrivateHint',
  members: 'lab.visMembersHint',
  public: 'lab.visPublicHint',
};

export const JOIN_MODE_KEYS: Record<'open' | 'request' | 'invite', MessageKey> = {
  open: 'lab.joinOpen',
  request: 'lab.joinRequest',
  invite: 'lab.joinInvite',
};

/**
 * Space History event_type → label. Falls back to lab.eventGeneric.
 *
 * Every event_type the app writes must appear here. A missing entry is not a
 * cosmetic gap: it renders as the anonymous "Activity" line, and the history
 * tab is the surface a member opens precisely to find out WHAT happened.
 */
export const EVENT_KEYS: Record<string, MessageKey> = {
  created: 'lab.eventCreated',
  // Stage-neutral: `promoted` now covers two rungs. eventKey() sharpens it from
  // the event's own metadata when the caller has it.
  promoted: 'lab.eventPromoted',
  settings_changed: 'lab.eventSettingsChanged',
  update_published: 'lab.eventUpdatePublished',
  update_crossposted: 'lab.eventUpdateCrossposted',
  artifact_added: 'lab.eventArtifactAdded',
  decision_recorded: 'lab.eventDecisionRecorded',
  member_joined: 'lab.eventMemberJoined',
  member_left: 'lab.eventMemberLeft',
  member_invited: 'lab.eventMemberInvited',
  member_removed: 'lab.eventMemberRemoved',
  join_requested: 'lab.eventJoinRequested',
  request_declined: 'lab.eventRequestDeclined',
  member_role_changed: 'lab.eventMemberRoleChanged',
  marked_dormant: 'lab.eventMarkedDormant',
  candidate_created: 'lab.eventCandidateCreated',
  collab_proposed: 'lab.eventCollabProposed',
  collab_accepted: 'lab.eventCollabAccepted',
  collab_declined: 'lab.eventCollabDeclined',
  collab_ended: 'lab.eventCollabEnded',
  skill_need_added: 'lab.eventSkillNeedAdded',
  skill_need_removed: 'lab.eventSkillNeedRemoved',
  // Maal (F2 §5). `demoted_timeout` is the one the venture's members will look
  // for: it is written by demote_timed_out_ventures(), never by a person, and
  // it is the most consequential row a venture's history can carry.
  demoted_timeout: 'maal.eventDemotedTimeout',
  goal_updated: 'maal.eventGoalUpdated',
  visibility_changed: 'maal.eventVisibilityChanged',
  workstream_added: 'maal.eventWorkstreamAdded',
  workstream_changed: 'maal.eventWorkstreamChanged',
  workstream_removed: 'maal.eventWorkstreamRemoved',
  task_added: 'maal.eventTaskAdded',
  task_changed: 'maal.eventTaskChanged',
  task_moved: 'maal.eventTaskMoved',
  contribution_reversed: 'maal.eventContributionReversed',
  weights_changed: 'maal.eventWeightsChanged',
  capital_need_declared: 'maal.eventCapitalNeedDeclared',
};

/**
 * The label for one history row. `metadata` is optional and is the event's own
 * `lab_events.metadata` — pass it where you have it.
 *
 * Only `promoted` reads it, because that single event_type now covers two rungs
 * (Koox → Warshad and Warshad → Maal). With metadata the row names the rung it
 * actually was; without it the row says "Promoted" rather than asserting the
 * wrong one, which is what a hardcoded "Promoted to Lab" did to every Maal
 * promotion.
 */
export function eventKey(eventType: string, metadata?: unknown): MessageKey {
  if (eventType === 'promoted') {
    const to =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).to
        : undefined;
    if (to === 'venture') return 'maal.eventPromotedVenture';
    if (to === 'lab') return 'lab.eventPromotedLab';
    return 'lab.eventPromoted';
  }
  return EVENT_KEYS[eventType] ?? 'lab.eventGeneric';
}
