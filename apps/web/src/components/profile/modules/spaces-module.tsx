import Link from 'next/link';
import type { ReactNode } from 'react';

import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import { getT } from '@/lib/locale';
import type { ProfilePinItem } from '@/lib/profile-view';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Warshadaha aan doortay / la doortay — the member's pinned Spaces (spec §3.8).
 *
 * No new store: this reads the Phase 4.5 `profile_pins` rows that
 * `ProfileView` already hydrates through the VIEWER's RLS, so a Space the
 * viewer cannot read has been dropped before this component sees it and the
 * cap of 3 is the table's, not a slice here. Pins carry posts and listings
 * too; this module is the Spaces view of that one list, which is why it
 * filters by kind rather than asking for a second query.
 *
 * The label is the whole difference between the two viewers: the owner reads
 * "the Spaces I chose" (first person — a statement of authorship, next to the
 * pencil that changes it), the visitor reads "the Spaces they chose" (a fact
 * about someone else). Same rows, and the frames give each its own key rather
 * than one key with a pronoun param.
 */

/** Beaker — the Warshad glyph the frames use for a Space row. */
function SpaceGlyph() {
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

function PencilGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16.5 3.9a2.2 2.2 0 0 1 3.1 3.1L8.4 18.2l-4.1 1 1-4.1Z" />
    </svg>
  );
}

export interface SpacesModuleProps {
  /** The member's `profile_pins`; the Space rows are picked out here. */
  pins: readonly ProfilePinItem[];
  viewer: ModuleCardProps['viewer'];
  /** Where the owner goes to change the selection (the pins picker). */
  editHref: string;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function SpacesModule({
  pins,
  viewer,
  editHref,
  visibilityToggle,
}: SpacesModuleProps) {
  const isOwner = viewer === 'owner';
  const spaces = pins.filter((pin) => pin.entityType === 'lab');

  // Nothing chosen and nobody who can choose: no node, same rule as the rest
  // of the module set. The owner keeps the card — the empty one is where the
  // "pick some" move lives.
  if (spaces.length === 0 && !isOwner) return null;

  const t = await getT();

  return (
    <ModuleCard
      moduleId="spaces"
      titleKey={isOwner ? 'profile.moduleSpacesOwn' : ANIGA_MODULE_TITLE_KEYS.spaces}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      action={
        isOwner ? (
          <Link
            className="xidig-icon-button xidig-aspaces__edit"
            href={editHref}
            aria-label={t('profile.editSpaces')}
          >
            <PencilGlyph />
          </Link>
        ) : null
      }
    >
      {spaces.length === 0 ? (
        // In-module empty rather than the house `EmptyState`: that component is
        // a `.xidig-section` card, and nesting one inside `.xidig-amodule`
        // double-frames the surface. Same call the Bandhig module made.
        <div className="xidig-aspaces__empty">
          <span className="xidig-aspaces__empty-body">{t('profile.spacesEmptyOwn')}</span>
          <Link className="xidig-button xidig-button--secondary" href={editHref}>
            {t('action.add')}
          </Link>
        </div>
      ) : (
        <ul className="xidig-aspaces">
          {spaces.map((space) => (
            <li key={space.entityId} className="xidig-aspaces__item">
              <Link href={`/labs/${space.slug}`} className="xidig-aspaces__row">
                <span className="xidig-aspaces__icon" aria-hidden="true">
                  <SpaceGlyph />
                </span>
                <span className="xidig-aspaces__text">
                  <span className="xidig-aspaces__name">{space.name}</span>
                  {/* Two independent facts on one meta line, joined by the
                      house interpunct — the kind, then the Space's own
                      one-liner. Never a translated sentence built from parts. */}
                  <span className="xidig-aspaces__meta">
                    {t('term.lab')}
                    {space.shortDescription ? ` · ${space.shortDescription}` : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ModuleCard>
  );
}

export default SpacesModule;
