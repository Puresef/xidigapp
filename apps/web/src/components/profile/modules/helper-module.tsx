import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatRelativeTime } from '@xidig/i18n';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { Avatar } from '@/components/media/avatar';
import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaHelperEntry } from '@/lib/aniga/view';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getLocale, getT } from '@/lib/locale';

import type { ModuleCardProps } from './module-card';
import { ModuleCard } from './module-card';

/**
 * Caawimo — resolved Codsiyo, credited by the person who asked (spec §3.7, §14).
 *
 * Every line on this surface has to be checkable by someone who does not
 * trust the member: "Qofka codsiga leh ayaa xaqiijiyay — ma aha wax la iska
 * sheegtay". So the row is built out of four externally-verifiable facts and
 * nothing else — the resolved chip, when it resolved, the ask itself (a link
 * anyone can open), and the asker who closed it, named. There is no helper
 * score, no total, no streak: a number would be a claim the row could not
 * substantiate, and one unverifiable element would cost the other four their
 * credibility.
 *
 * That is also why an entry with no crediting asker is DROPPED rather than
 * shown anonymously. `loadHelper` already refuses to emit one, and this guard
 * is the second lock on the same door: the asker IS the evidence, so a row
 * without one is a self-report wearing a trust chip.
 *
 * Empty means absent — for the owner too. There is no "0 asks helped" state to
 * design here; a card whose only content is its own title reads as a zeroed
 * counter, which every empty state in this spec refuses to draw (a2).
 */

/**
 * The type promises an asker; this guards the ROW, not the type. A projection
 * bug or a deleted account must cost one entry, never the module's claim.
 */
function isCredited(entry: AnigaHelperEntry): boolean {
  return (entry.creditedBy?.displayName ?? '').trim() !== '';
}

export interface HelperModuleProps {
  /** Asker-credited resolutions, newest first. Rendered in the order given. */
  entries: readonly AnigaHelperEntry[];
  viewer: ModuleCardProps['viewer'];
  /** Names the helper in the explainer — the claim is about this member. */
  displayName: string;
  /** Asker avatars ride the Lite ladder like every other identity disc. */
  prefs?: LitePrefs | undefined;
  /** Owner visibility toggle, forwarded to the shell. */
  visibilityToggle?: ReactNode;
}

export async function HelperModule({
  entries,
  viewer,
  displayName,
  prefs,
  visibilityToggle,
}: HelperModuleProps) {
  const credited = entries.filter(isCredited);
  // Checked before `getT()` so an absent module costs nothing to decide.
  if (credited.length === 0) return null;

  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <ModuleCard
      moduleId="helper"
      titleKey={ANIGA_MODULE_TITLE_KEYS.helper}
      viewer={viewer}
      visibilityToggle={visibilityToggle}
      // The explainer is the trust claim, so it is addressed to everyone —
      // the visitor is the one who needs to know who attested this.
      footnote={t('profile.helperNote', { name: displayName })}
    >
      <ul className="xidig-ahelper">
        {credited.map((entry) => (
          <li key={entry.postId} className="xidig-ahelper__item">
            {/* The ask itself is the receipt: the row links to the Codsi so a
                reader can check the resolution rather than take it on faith. */}
            <Link href={`/p/${entry.postId}`} className="xidig-ahelper__row">
              <span className="xidig-ahelper__head">
                {/* Earned milestone — one of the four things trust orange is
                    for. The guul star is the class glyph, not decoration. */}
                <span className="xidig-tag xidig-tag--trust xidig-ahelper__chip">
                  <XidigIcon name="guul" variant="filled" size={12} />
                  {t('plaza.askFulfilled')}
                </span>
                <time className="xidig-ahelper__time" dateTime={entry.resolvedAt}>
                  {formatRelativeTime(new Date(entry.resolvedAt), locale)}
                </time>
              </span>
              <span className="xidig-ahelper__title">{entry.title}</span>
              <span className="xidig-ahelper__credit">
                <Avatar
                  name={entry.creditedBy.displayName}
                  handle={entry.creditedBy.handle}
                  src={entry.creditedBy.avatarUrl}
                  size={18}
                  prefs={prefs}
                  className="xidig-ahelper__avatar"
                />
                {/* One key, both facts: "X ayaa xaqiijiyay · City" is a
                    sentence in Somali, never two fragments glued together. */}
                {entry.creditedBy.city
                  ? t('profile.helperCreditedByCity', {
                      name: entry.creditedBy.displayName,
                      city: entry.creditedBy.city,
                    })
                  : t('profile.helperCreditedBy', { name: entry.creditedBy.displayName })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ModuleCard>
  );
}

export default HelperModule;
