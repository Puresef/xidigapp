import Link from 'next/link';
import type { ReactNode } from 'react';

import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaSkill } from '@/lib/aniga/view';
import { getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Xirfadaha — skills sized by endorsement depth (spec §3.2, §14).
 *
 * The count beside each skill is **distinct endorsers**, guaranteed by
 * `unique(endorser, endorsee, skill)`: a member cannot inflate it by
 * endorsing twice, and nobody can endorse on their own behalf. That is why it
 * survives on the visitor view while follower counts do not — A1 forbids
 * POPULARITY, and this is attested evidence. The two are not the same number
 * wearing different labels, and the trailing "Tiro raacayaal ma jirto" note
 * on the same page is what keeps the distinction legible to members.
 *
 * Depth is carried by SIZE, not by rank: the ramp has three steps and the
 * chips wrap as a cloud, so the eye reads "this is what they are known for"
 * without the module ever ordering people against each other. No ladder, no
 * position number, no progress-to-next.
 *
 * Neither the count nor the ramp is computed here — `rank` arrives resolved
 * and the array arrives ordered, so this component cannot invent a hierarchy
 * the data layer did not attest.
 */

/**
 * Depth ramp (frames 10a–10d / 8b). Three steps and no more: a per-rank size
 * would turn a cloud into a leaderboard, which is the reading §3.2 rules out.
 */
function chipClass(rank: number): string {
  if (rank <= 1) return 'xidig-askills__chip xidig-askills__chip--lead';
  if (rank <= 3) return 'xidig-askills__chip xidig-askills__chip--mid';
  return 'xidig-askills__chip xidig-askills__chip--tail';
}

export interface SkillsModuleProps {
  /** Rendered in the order given; `rank` drives size, never position. */
  skills: readonly AnigaSkill[];
  viewer: ModuleCardProps['viewer'];
  /** Where the owner goes to edit their skills. */
  addHref: string;
  /**
   * The visitor's "Marag-fur" control. Endorsing is a write against another
   * member's profile, so it arrives as a slot from the caller that owns that
   * request — same boundary the shell draws for the visibility toggle.
   */
  endorseAction?: ReactNode;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function SkillsModule({
  skills,
  viewer,
  addHref,
  endorseAction,
  visibilityToggle,
}: SkillsModuleProps) {
  const isOwner = viewer === 'owner';

  // Nothing endorsed and nothing the visitor could add: no node, same rule as
  // the rest of the module set. The owner still gets the card — an empty one
  // is the only place the "add a skill" move exists.
  if (skills.length === 0 && !isOwner) return null;

  const t = await getT();

  // A viewer who has already endorsed everything has nothing left to attest,
  // so the action goes rather than sitting there leading to an empty picker.
  const canEndorse = !isOwner && skills.some((skill) => !skill.endorsedByViewer);

  return (
    <ModuleCard
      moduleId="skills"
      titleKey={ANIGA_MODULE_TITLE_KEYS.skills}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      action={
        <span className="xidig-askills__meta">
          {t(isOwner ? 'profile.skillsMetaOwner' : 'profile.skillsMetaVisitor')}
        </span>
      }
      {...(isOwner ? { footnote: t('profile.skillsOwnerNote') } : {})}
    >
      <ul className="xidig-askills">
        {skills.map((skill) => (
          <li key={skill.skill} className="xidig-askills__item">
            <span
              className={`xidig-tag ${chipClass(skill.rank)}${
                skill.endorsedByViewer ? ' xidig-askills__chip--endorsed' : ''
              }`}
            >
              {skill.skill}
              {/* "×12" is a glance, not a sentence: it is hidden from AT and
                  the readable count follows it, so nobody hears "multiplication
                  sign twelve" where the evidence claim belongs. */}
              <b className="xidig-askills__count" aria-hidden="true">
                {t('profile.endorsementCount', { count: skill.endorsers })}
              </b>
              <span className="xidig-visually-hidden">
                {t('profile.endorserCount', { count: skill.endorsers })}
              </span>
              {/* A second element rather than a joined string: two independent
                  facts, and translated fragments are never concatenated. */}
              {skill.endorsedByViewer ? (
                <span className="xidig-visually-hidden">{t('profile.endorsed')}</span>
              ) : null}
            </span>
          </li>
        ))}
        {isOwner ? (
          <li className="xidig-askills__item xidig-askills__item--action">
            <Link
              className="xidig-button xidig-button--secondary xidig-askills__action"
              href={addHref}
            >
              {t('action.add')}
            </Link>
          </li>
        ) : null}
        {canEndorse && endorseAction ? (
          <li className="xidig-askills__item xidig-askills__item--action">{endorseAction}</li>
        ) : null}
      </ul>
    </ModuleCard>
  );
}

export default SkillsModule;
