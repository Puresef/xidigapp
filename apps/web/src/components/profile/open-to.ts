import type { MessageKey } from '@xidig/i18n';

/**
 * "Open to" chip labels (open_to_kinds lookup, Phase 4.5 §1b). Pure data —
 * shared by the server-rendered profile chips and the client-side directory
 * filter. Order mirrors the lookup's sort_order; an unknown slug (a future
 * seed the app hasn't shipped labels for yet) renders as its raw slug.
 */
export const OPEN_TO_SLUGS = [
  'cofounding',
  'hiring',
  'hire_me',
  'investing',
  'mentoring',
  'collaborating',
] as const;

export const OPEN_TO_KEYS: Record<string, MessageKey> = {
  cofounding: 'profile.openToCofounding' as MessageKey,
  hiring: 'profile.openToHiring' as MessageKey,
  hire_me: 'profile.openToHireMe' as MessageKey,
  investing: 'profile.openToInvesting' as MessageKey,
  mentoring: 'profile.openToMentoring' as MessageKey,
  collaborating: 'profile.openToCollaborating' as MessageKey,
};
