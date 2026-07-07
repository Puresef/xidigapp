import type { MessageKey } from '@xidig/i18n';

/**
 * Enum → i18n key maps for Labs UI. Pure data (no server imports) so both RSCs
 * and client components can drive copy off a Space's columns. The Warshad ⇄ Koox
 * chrome swap is just CHROME_KEYS[space_mode] — reusing the locked term.lab /
 * term.club vocabulary (EN Lab/Club · SO Warshad/Koox).
 */

export const CHROME_KEYS: Record<'club' | 'lab', MessageKey> = {
  club: 'term.club',
  lab: 'term.lab',
};

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

/** Space History event_type → label. Falls back to lab.eventGeneric. */
export const EVENT_KEYS: Record<string, MessageKey> = {
  created: 'lab.eventCreated',
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
};

export function eventKey(eventType: string): MessageKey {
  return EVENT_KEYS[eventType] ?? 'lab.eventGeneric';
}
