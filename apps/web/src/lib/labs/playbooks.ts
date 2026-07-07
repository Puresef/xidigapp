import type { MessageKey } from '@xidig/i18n';

/**
 * Lab playbook starter set (§16, spec §1b). The DB seeds six `lab_playbooks`
 * rows (source='seed') whose `template` jsonb carries starter charter text
 * (problem_statement / hypothesis / success_definition). The SpaceForm playbook
 * picker fetches the active rows and pre-fills the charter fields from the
 * chosen template — the user then edits before submit.
 *
 * Copy that is SHOWN (the picker label + one-line hint) is localized via
 * @xidig/i18n keyed off the stable slug. The starter charter TEXT itself lives
 * in the DB template (English seed; a native SO pass / AI generation is Phase 8
 * debt) and is dropped verbatim into the editable textareas.
 */

/** The six seeded slugs, in display order. Stable — used as i18n key suffixes. */
export const PLAYBOOK_SLUGS = [
  'community',
  'startup',
  'research',
  'local-service',
  'creative',
  'technical',
] as const;

export type PlaybookSlug = (typeof PLAYBOOK_SLUGS)[number];

/** slug → i18n label key (the picker option text). EN+SO returned in structured output. */
export const PLAYBOOK_LABEL_KEYS: Record<PlaybookSlug, MessageKey> = {
  community: 'lab.playbookCommunity',
  startup: 'lab.playbookStartup',
  research: 'lab.playbookResearch',
  'local-service': 'lab.playbookLocalService',
  creative: 'lab.playbookCreative',
  technical: 'lab.playbookTechnical',
};

/** slug → i18n one-line hint key (what this archetype is for). */
export const PLAYBOOK_HINT_KEYS: Record<PlaybookSlug, MessageKey> = {
  community: 'lab.playbookCommunityHint',
  startup: 'lab.playbookStartupHint',
  research: 'lab.playbookResearchHint',
  'local-service': 'lab.playbookLocalServiceHint',
  creative: 'lab.playbookCreativeHint',
  technical: 'lab.playbookTechnicalHint',
};

/** The charter fields a playbook template pre-fills. */
export interface PlaybookTemplate {
  problem_statement?: string;
  hypothesis?: string;
  success_definition?: string;
}

/** A playbook as consumed by the picker (subset of the lab_playbooks row). */
export interface Playbook {
  id: string;
  slug: string;
  name: string;
  template: PlaybookTemplate;
}

function isPlaybookSlug(slug: string): slug is PlaybookSlug {
  return (PLAYBOOK_SLUGS as readonly string[]).includes(slug);
}

/**
 * Order a fetched playbook set by the canonical PLAYBOOK_SLUGS order so the
 * picker is deterministic regardless of DB row order. Unknown slugs (future
 * additions) fall to the end, preserving their relative order.
 */
export function orderPlaybooks(rows: Playbook[]): Playbook[] {
  const rank = (slug: string) => {
    const i = PLAYBOOK_SLUGS.indexOf(slug as PlaybookSlug);
    return i === -1 ? PLAYBOOK_SLUGS.length : i;
  };
  return [...rows].sort((a, b) => rank(a.slug) - rank(b.slug));
}

/** Label key for a slug, falling back to a generic key for unseen slugs. */
export function playbookLabelKey(slug: string): MessageKey {
  return isPlaybookSlug(slug) ? PLAYBOOK_LABEL_KEYS[slug] : 'lab.playbookGeneric';
}

/** Hint key for a slug (empty-safe for unseen slugs). */
export function playbookHintKey(slug: string): MessageKey | null {
  return isPlaybookSlug(slug) ? PLAYBOOK_HINT_KEYS[slug] : null;
}
