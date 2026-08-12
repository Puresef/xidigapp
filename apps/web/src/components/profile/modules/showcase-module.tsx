import Link from 'next/link';
import type { ReactNode } from 'react';

import type { MessageKey } from '@xidig/i18n';

import { Banner } from '@/components/banner';
import { AnimatedMark } from '@/components/brand/animated-mark';
import { XidigIcon } from '@/components/icons/XidigIcon';
import { MediaSlot } from '@/components/media/media-slot';
import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaShowcaseItem } from '@/lib/aniga/view';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Bandhig — the member's chosen grid (spec §3.1, states v1–v5).
 *
 * Two properties carry the whole module and neither is cosmetic:
 *
 *  1. **Pinned refs only.** The component renders exactly the array it is
 *     handed, in the order it is handed, and computes nothing. No "top", no
 *     "most", no recency tie-break — an engagement sort could not be written
 *     here without adding data this component does not receive (A5).
 *  2. **A visitor never meets an empty Bandhig.** With nothing pinned the
 *     module returns `null`, so the card itself is absent rather than showing
 *     a stranger a hole where a member's work would be. Emptiness is only
 *     addressed to the person who can fix it.
 *
 * Every tile routes through MediaSlot with the ref's real `estBytes`: Lite
 * defers the BYTES, never the tile, so the grid a Lite visitor sees has the
 * same shape and the same count as everyone else's (§22 / A15).
 *
 * The module also fails alone (v4). Its error state is local chrome, not a
 * thrown boundary, because a showcase that didn't load must not take a
 * profile's identity, bio and helper history down with it.
 */

/** Source kind → its chip label. Guul is the only one that may wear orange. */
const SOURCE_KEYS: Record<NonNullable<AnigaShowcaseItem['sourceKind']>, MessageKey> = {
  guul: 'plaza.typeWin',
  warshad: 'term.lab',
  war: 'plaza.typeUpdate',
};

/** `profile_showcase_position_range` caps a grid at 6 — so does its skeleton. */
const SHOWCASE_CAP = 6;

export interface ShowcaseModuleProps {
  /** Rendered verbatim, in this order. Pinned refs, nothing derived. */
  items: readonly AnigaShowcaseItem[];
  viewer: ModuleCardProps['viewer'];
  /** Names the chooser in the visitor footnote — the point of the module. */
  displayName: string;
  prefs: LitePrefs;
  /** Where the owner goes to pin something (the showcase editor). */
  addHref: string;
  /** The module's own async state. It resolves independently of the page. */
  status?: 'ready' | 'loading' | 'error';
  /** "Isku day" target — re-requesting the profile IS the retry. */
  retryHref?: string;
  /**
   * Pins saved on this device that have not reached the server yet (v5).
   * The queue is device-local by nature, so the "Tirtir" control arrives as a
   * slot from whoever owns it; the module owns only how the wait reads.
   */
  queued?: ReadonlyArray<{ key: string; discard?: ReactNode }>;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

/** Clock — the shared offline-queue glyph (same grammar as Codsi replies). */
function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8v4.4l2.8 1.7" />
    </svg>
  );
}

export async function ShowcaseModule({
  items,
  viewer,
  displayName,
  prefs,
  addHref,
  status = 'ready',
  retryHref,
  queued,
  visibilityToggle,
}: ShowcaseModuleProps) {
  const isOwner = viewer === 'owner';
  const queuedPins = queued ?? [];

  // A2's sibling: with nothing to show and nothing to fix, a visitor gets no
  // node at all. Checked BEFORE `getT()` so the absent module costs nothing.
  if (status === 'ready' && items.length === 0 && queuedPins.length === 0 && !isOwner) {
    return null;
  }

  const t = await getT();

  const card = (body: ReactNode, footnote?: ReactNode) => (
    <ModuleCard
      moduleId="showcase"
      titleKey={ANIGA_MODULE_TITLE_KEYS.showcase}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      {...(footnote === undefined ? {} : { footnote })}
    >
      {body}
    </ModuleCard>
  );

  // v1 — the skeleton is the loaded grid: same tiles, same gaps, same cap, so
  // nothing reflows when the pins arrive. Shimmer lives in `.xidig-skeleton`,
  // which is already gated on BOTH prefers-reduced-motion and data-motion.
  if (status === 'loading') {
    return card(
      <div
        className="xidig-ashowcase"
        role="status"
        aria-busy="true"
        aria-label={t('profile.loadingAria')}
      >
        <ul className="xidig-ashowcase__grid" aria-hidden="true">
          {Array.from({ length: SHOWCASE_CAP }, (_, i) => (
            <li key={i} className="xidig-ashowcase__tile">
              <span className="xidig-skeleton xidig-ashowcase__tile-skeleton" />
            </li>
          ))}
        </ul>
        <span className="xidig-skeleton xidig-skeleton--text xidig-ashowcase__note-skeleton" />
      </div>,
    );
  }

  // v4 — the module says what broke and offers the one move that helps. No
  // footnote: an explanation of a grid that isn't there would be noise.
  if (status === 'error') {
    return card(
      <Banner kind="error">
        <strong className="xidig-ashowcase__error-title">{t('profile.showcaseErrorTitle')}</strong>
        <span className="xidig-ashowcase__error-body">{t('profile.showcaseErrorBody')}</span>
        {retryHref ? (
          <Link className="xidig-button xidig-button--secondary" href={retryHref}>
            {t('profile.retryShort')}
          </Link>
        ) : null}
      </Banner>,
    );
  }

  const note = isOwner
    ? t('profile.showcaseOwnerNote')
    : t('profile.showcaseVisitorNote', { name: displayName });

  const queue =
    queuedPins.length > 0 ? (
      <ul className="xidig-ashowcase__queue" aria-label={t('profile.pinQueuedTitle')}>
        {queuedPins.map((pin) => (
          <li key={pin.key} className="xidig-ashowcase__queue-row">
            <span className="xidig-tag xidig-ashowcase__queue-chip">
              <ClockGlyph />
              {t('profile.pinQueuedTitle')}
            </span>
            <span className="xidig-ashowcase__queue-meta">
              {t('state.queuedNote')} {pin.discard}
            </span>
          </li>
        ))}
      </ul>
    ) : null;

  // v2 — owner only, by construction: the visitor path returned null above.
  if (items.length === 0) {
    return card(
      <>
        {queue}
        <div className="xidig-ashowcase__empty">
          <span className="xidig-ashowcase__empty-mark">
            <AnimatedMark mode="static" size={38} />
          </span>
          <strong className="xidig-ashowcase__empty-title">
            {t('profile.showcaseEmptyTitle')}
          </strong>
          <span className="xidig-ashowcase__empty-body">{t('profile.showcaseEmptyBody')}</span>
          <Link className="xidig-button xidig-button--secondary" href={addHref}>
            {t('action.add')}
          </Link>
        </div>
      </>,
      note,
    );
  }

  return card(
    <>
      {queue}
      <ul className="xidig-ashowcase__grid">
        {items.map((item) => {
          const sourceKey = item.sourceKind ? SOURCE_KEYS[item.sourceKind] : null;
          // Guul is an earned milestone, which is one of the four things trust
          // orange is for. Warshad and War are provenance, not achievement.
          const isGuul = item.sourceKind === 'guul';
          return (
            <li
              key={`${item.entityType}:${item.entityId}`}
              className={
                item.mediaUrl
                  ? 'xidig-ashowcase__tile'
                  : 'xidig-ashowcase__tile xidig-ashowcase__tile--text'
              }
            >
              {item.mediaUrl ? (
                <MediaSlot
                  kind="image"
                  className="xidig-ashowcase__slot"
                  src={item.mediaUrl}
                  thumbSrc={item.mediaThumbUrl ?? undefined}
                  blurhash={item.blurhash}
                  alt={item.title}
                  estBytes={item.estBytes ?? undefined}
                  prefs={prefs}
                />
              ) : null}
              {sourceKey ? (
                <span
                  className={`xidig-tag${isGuul ? ' xidig-tag--trust' : ''} xidig-ashowcase__chip`}
                >
                  {isGuul ? <XidigIcon name="guul" variant="filled" size={10} /> : null}
                  {t(sourceKey)}
                </span>
              ) : null}
              {/* One link per tile, laid over the slot rather than wrapping it:
                  a MediaSlot can contain the "Muuji" button, and a button
                  inside an anchor is neither valid nor operable. With media the
                  title names the link for AT; without media it IS the tile. */}
              <Link href={item.href} className="xidig-ashowcase__link">
                <span
                  className={item.mediaUrl ? 'xidig-visually-hidden' : 'xidig-ashowcase__title'}
                >
                  {item.title}
                </span>
              </Link>
            </li>
          );
        })}
        {isOwner ? (
          <li className="xidig-ashowcase__tile xidig-ashowcase__tile--add">
            <Link
              href={addHref}
              className="xidig-ashowcase__add"
              aria-label={t('profile.showcaseAddAria')}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5.5v13M5.5 12h13" />
              </svg>
              {t('action.add')}
            </Link>
          </li>
        ) : null}
      </ul>
      {/* v3 — Lite says what it did, in the same box: the grid is unchanged,
          only the bytes wait. Never a reason to render fewer tiles. */}
      {prefs.images ? null : (
        <p className="xidig-ashowcase__lite">{t('profile.showcaseLiteNote')}</p>
      )}
    </>,
    note,
  );
}

export default ShowcaseModule;
