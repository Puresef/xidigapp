import Link from 'next/link';

import { formatRelativeTime, type Locale } from '@xidig/i18n';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { Avatar } from '@/components/media/avatar';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import type { VentureIndexRow } from '@/lib/maal/views';

import { MaalIndexAction } from './index-action';

/**
 * One row of the Maal index (frame 7a). Server component; the join verb is the
 * only client island inside it.
 *
 * ONE component, ONE query, one set of markup: the desktop 5-column table and
 * the mobile card are the same DOM under two grid templates (`.xidig-maal-row`
 * in globals.css). A second mobile component is how a mobile surface quietly
 * loses a column.
 *
 * Anatomy, left to right: stage glyph tile → name + premise + meta line →
 * stage badge (+ the demotion sub-line) → member facepile with overflow →
 * open seats → the join verb.
 *
 * Two honesty rules this row renders, not styles:
 *
 *  - A DEMOTED space is a Warshad wearing its history: the Warshad badge, the
 *    "Dib loo celiyay Maal-nimada" sub-line, and the timeout explanation as its
 *    OWN sentence after the space's one-liner — never glued onto the member's
 *    own words, and never a badge that pretends the stage never happened.
 *  - The sprint line only renders while the sprint is still running. A finished
 *    sprint falls back to last activity rather than counting down past zero.
 *
 * ZERO orange: the stage tag is accent-soft, the glyph inherits, and no earned
 * guul-star exists on this surface to justify one (badge canon 10a covers the
 * ledger, not the index).
 */
export async function MaalIndexRow({
  row,
  prefs,
  locale,
}: {
  row: VentureIndexRow;
  prefs: LitePrefs;
  locale: Locale;
}) {
  const t = await getT();
  const isVenture = row.mode === 'venture';

  // Founder for a Maal, opener for a Warshad — the frame's own distinction.
  const meta: string[] = [];
  if (row.opener) {
    meta.push(
      t(isVenture ? 'maal.rowFounder' : 'maal.rowOpenedBy', { name: row.opener.display_name }),
    );
  }
  if (row.openerCity) meta.push(row.openerCity);
  meta.push(
    row.sprint && row.sprint.daysLeft >= 0
      ? t('maal.rowRound', { round: row.sprint.round, count: row.sprint.daysLeft })
      : t('maal.rowLastActivity', {
          time: formatRelativeTime(new Date(row.lastActivityAt), locale),
        }),
  );

  return (
    <li className="xidig-maal-row">
      <span className="xidig-maal-row__main">
        <span
          className={`xidig-maal-row__glyph xidig-maal-row__glyph--${isVenture ? 'venture' : 'lab'}`}
          aria-hidden="true"
        >
          {isVenture ? <XidigIcon name="maal" size={20} /> : <FlaskGlyph />}
        </span>
        <span className="xidig-maal-row__lines">
          <Link href={`/labs/${row.slug}`} className="xidig-maal-row__name">
            {row.name}
          </Link>
          {row.premise ? <span className="xidig-maal-row__premise">{row.premise}</span> : null}
          {/* Its own sentence — the space's premise stays the space's words. */}
          {row.demoted ? (
            <span className="xidig-maal-row__premise">{t('maal.demotedPremise')}</span>
          ) : null}
          <span className="xidig-maal-row__meta">{meta.join(' · ')}</span>
        </span>
      </span>

      <span className="xidig-maal-row__stage">
        {isVenture ? (
          <span className="xidig-tag xidig-maal-row__badge">
            {/* 12px → below the 16px floor, so the glyph draws three stalks
                and drops its two binding curves (ruling 8). */}
            <XidigIcon name="maal" size={12} />
            {t('maal.stageVenture')}
          </span>
        ) : (
          <span className="xidig-tag">{t('term.lab')}</span>
        )}
        {row.demoted ? (
          <span className="xidig-maal-row__substage">{t('maal.stageDemoted')}</span>
        ) : null}
      </span>

      <span className="xidig-maal-row__members">
        {row.memberPreview.length > 0 ? (
          // Decorative for AT — the count below is the accessible signal
          // (reading four names per row is noise, not information).
          <span className="xidig-facepile" aria-hidden="true">
            {row.memberPreview.map((member) => (
              <Avatar
                key={member.user_id}
                name={member.display_name}
                handle={member.handle}
                src={member.avatar_thumb_url}
                blurhash={member.avatar_blurhash}
                size={27}
                prefs={prefs}
              />
            ))}
          </span>
        ) : null}
        {row.memberOverflow > 0 ? (
          <span className="num xidig-maal-row__overflow" aria-hidden="true">
            +{row.memberOverflow}
          </span>
        ) : null}
        <span className="xidig-visually-hidden">
          {t('lab.memberCount', { count: row.memberCount })}
        </span>
      </span>

      <span className="xidig-maal-row__seats">
        {row.openToAnyone ? (
          <span className="xidig-maal-row__seats-quiet">{t('maal.openToAnyone')}</span>
        ) : row.openSeats > 0 ? (
          <>
            <span className="num">{t('maal.openSeats', { count: row.openSeats })}</span>
            {row.openSeatNames.length > 0 ? (
              <span className="xidig-maal-row__seat-names">{row.openSeatNames.join(' · ')}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="xidig-maal-row__seats-quiet" aria-hidden="true">
              {'—'}
            </span>
            <span className="xidig-visually-hidden">{t('maal.noOpenWork')}</span>
          </>
        )}
      </span>

      <span className="xidig-maal-row__action">
        <MaalIndexAction labId={row.id} slug={row.slug} action={row.action} />
      </span>
    </li>
  );
}

/**
 * The Warshad tile glyph. Deliberately NOT added to the D3 family
 * (components/icons/paths.ts): that map is brand canon and ruling 8 only
 * canonised the Maal glyph — a flask minted here would be a family member
 * nobody reviewed. Inline, decorative, and local to this row.
 */
function FlaskGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
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
