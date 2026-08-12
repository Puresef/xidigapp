import type { ReactNode } from 'react';

import type { MessageKey } from '@xidig/i18n';

import type { AnigaModuleId } from '@/lib/aniga/modules';
import { getT } from '@/lib/locale';

/**
 * The frame every Aniga v3 module renders inside (spec §2) — and the single
 * place the owner/visitor chrome split is enforced.
 *
 * Owner chrome (the drag grip and the eye toggle) is rendered CONDITIONALLY,
 * never CSS-hidden. Acceptance A2 asks for absence from the visitor DOM: a
 * `display:none` eye is still an eye to a screen reader, to view-source, and
 * to anyone flipping a class in devtools.
 *
 * `lockedByFlag` is the ruling-7 state: the module is built, a platform flag
 * holds it shut, and the owner toggle is REFUSED rather than quietly hidden.
 * The refusal is honest markup — a real button, `aria-pressed="false"`,
 * `disabled` — so the control the owner expects is visibly present and
 * visibly inert, and the chip beside the label reads as plain system state
 * ("Booqdayaasha: damsan"), never as a teaser.
 *
 * This stays a server component. The only interactive owner control is the
 * eye, and a card cannot honestly own that write: `set_profile_modules`
 * replaces the WHOLE ordered set, which a single module does not hold. So the
 * live toggle arrives as a slot from the owner-side caller that does hold it
 * (the module manager's state), while the locked eye — permanently disabled
 * by definition — needs no client JS at all and is rendered here.
 */

/** Frame-verbatim (10a). Owner-directed system state, not a promise. */
const FLAG_OFF_KEY: MessageKey = 'profile.moduleVisitorsOff';
const HIDDEN_A11Y_KEY: MessageKey = 'profile.moduleHiddenA11y';

export interface ModuleCardProps {
  moduleId: AnigaModuleId;
  titleKey: MessageKey;
  viewer: 'owner' | 'member' | 'anon';
  /** Renders the dashed border + locked chip + inert eye. */
  lockedByFlag?: boolean;
  /** Right-aligned header slot (e.g. "+ Ku dar", "Marag-fur"). */
  action?: ReactNode;
  /** Muted explanatory paragraph under the body. */
  footnote?: ReactNode;
  /**
   * The owner's live visibility toggle, supplied by whoever holds the full
   * module set (see the note above). Ignored for visitors, and superseded by
   * the inert eye while `lockedByFlag` — a flag-held module has nothing to
   * toggle. Additive to the frozen ModuleCard contract; a caller that omits
   * it simply gets no eye, and the module manager stays the toggle surface.
   */
  visibilityToggle?: ReactNode;
  children: ReactNode;
}

export async function ModuleCard({
  moduleId,
  titleKey,
  viewer,
  lockedByFlag = false,
  action,
  footnote,
  visibilityToggle,
  children,
}: ModuleCardProps) {
  const t = await getT();
  const isOwner = viewer === 'owner';
  // Visitors never reach a flag-locked module (publishedModules drops it), and
  // if a caller ever bypassed that projection the dashed frame and the chip
  // would be leaking a platform decision to someone it is not addressed to.
  const locked = isOwner && lockedByFlag;
  const labelId = `aniga-module-${moduleId}-label`;

  const eye = locked ? (
    <button
      type="button"
      className="xidig-icon-button xidig-amodule__eye"
      aria-label={t(HIDDEN_A11Y_KEY)}
      aria-pressed={false}
      disabled
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4l16 16M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6 8.2A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5" />
      </svg>
    </button>
  ) : isOwner ? (
    visibilityToggle
  ) : null;

  return (
    <section
      className={locked ? 'xidig-amodule xidig-amodule--locked' : 'xidig-amodule'}
      data-module={moduleId}
      aria-labelledby={labelId}
    >
      <div className="xidig-amodule__head">
        {isOwner ? (
          <svg
            className="xidig-amodule__grip"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        ) : null}
        <h2 className="xidig-amodule__label" id={labelId}>
          {t(titleKey)}
        </h2>
        {locked ? <span className="xidig-tag xidig-amodule__flag">{t(FLAG_OFF_KEY)}</span> : null}
        {action || eye ? (
          <div className="xidig-amodule__actions">
            {action}
            {eye}
          </div>
        ) : null}
      </div>
      <div className="xidig-amodule__body">{children}</div>
      {footnote ? <p className="xidig-amodule__note">{footnote}</p> : null}
    </section>
  );
}
