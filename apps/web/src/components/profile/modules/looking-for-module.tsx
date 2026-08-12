import Link from 'next/link';
import type { ReactNode } from 'react';

import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaMatch } from '@/lib/aniga/view';
import { getT } from '@/lib/locale';

import { OPEN_TO_KEYS } from '../open-to';
import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Waxaan raadinayaa — what the member says they are looking for, and the
 * Spaces that answer it (spec §3.4).
 *
 * The module's whole claim is that its matching is legible: it reads only what
 * the member typed, and **every row states why it is there**. So a match whose
 * reason is empty is DROPPED rather than shown reason-less — an unexplained
 * row is indistinguishable from a recommendation engine, which is exactly what
 * the footnote promises this is not. Staying silent about a match costs
 * nothing; showing one without its reason spends the surface's credibility.
 *
 * Matches are owner-only. They are second-person suggestions ("matches YOUR
 * skills") computed against the profile owner, so on a visitor's screen they
 * would be both meaningless and a small leak of what the owner is being
 * offered. Visitors get the open-to tags, which are the published half.
 */

function FlaskGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.6 3.4h4.8" />
      <path d="M10.4 3.4v4.9L5.3 17.8a2.1 2.1 0 0 0 1.9 3h9.6a2.1 2.1 0 0 0 1.9-3L13.6 8.3V3.4" />
      <path d="M7.8 14.2h8.4" />
    </svg>
  );
}

export interface LookingForModuleProps {
  /** `open_to_kinds` slugs, rendered through the shared label map. */
  slugs: readonly string[];
  matches: readonly AnigaMatch[];
  viewer: ModuleCardProps['viewer'];
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function LookingForModule({
  slugs,
  matches,
  viewer,
  visibilityToggle,
}: LookingForModuleProps) {
  const isOwner = viewer === 'owner';
  // Trimmed, not merely non-null: a whitespace reason is an empty reason.
  const explained = isOwner ? matches.filter((match) => match.reason.trim() !== '') : [];

  // Nothing declared and nothing to suggest is not an empty state, it is an
  // absent module: the owner has not started this section, and a visitor never
  // meets a card whose only content would be its own title.
  if (slugs.length === 0 && explained.length === 0) return null;

  const t = await getT();

  return (
    <ModuleCard
      moduleId="looking_for"
      titleKey={ANIGA_MODULE_TITLE_KEYS.looking_for}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      // The note explains the matcher in the second person, so it belongs to
      // the only viewer who is shown matches at all.
      footnote={isOwner ? t('profile.lookingForNote') : null}
    >
      {slugs.length > 0 ? (
        <ul className="xidig-chip-row xidig-alooking__tags">
          {slugs.map((slug) => {
            const key = OPEN_TO_KEYS[slug];
            return (
              <li key={slug} className="xidig-tag">
                {/* An unknown slug renders raw rather than blank: a member who
                    picked something this build has no label for should still see
                    their own choice. Carried from the Phase 4.5 chips this
                    module replaced. */}
                {key ? t(key) : slug}
              </li>
            );
          })}
        </ul>
      ) : null}

      {explained.map((match) => (
        <div key={match.href} className="xidig-alooking__match">
          <span className="xidig-alooking__glyph" aria-hidden="true">
            <FlaskGlyph />
          </span>
          <span className="xidig-alooking__match-text">
            <span className="xidig-alooking__match-title">{match.title}</span>
            <span className="xidig-alooking__match-reason">
              {match.reason}
              {/* Two independent facts on one meta line, joined by the house
                  interpunct — not a translated sentence assembled from parts. */}
              {match.memberCount === null ? null : (
                <>
                  {' · '}
                  {t('lab.memberCount', { count: match.memberCount })}
                </>
              )}
            </span>
          </span>
          <Link
            className="xidig-button xidig-button--secondary xidig-alooking__view"
            href={match.href}
          >
            {t('profile.viewAction')}
          </Link>
        </div>
      ))}
    </ModuleCard>
  );
}

export default LookingForModule;
