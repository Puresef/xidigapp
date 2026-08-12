import type { Locale } from '@xidig/i18n';

import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import { WORK_ORG_MODES } from '@/lib/maal/constants';
import type { VentureIndexRow } from '@/lib/maal/views';

import { MaalIndexRow } from './index-row';

/**
 * The Maal index list (frame 7a) — column head + rows.
 *
 * **Ruling 4 is structural here, not cosmetic.** A Koox (`space_mode='club'`)
 * is a social space and never appears on this index. `listVentureIndex` already
 * makes that impossible in the query — `WORK_ORG_MODES` is an `.in()` filter,
 * so a club is never fetched and never counted. This component holds the SAME
 * rule at its own boundary, because its prop type is a row list whose `mode` is
 * the full `space_mode` enum: anything that ever hands it a club (a new caller,
 * a future API shape, a test fixture) gets nothing rendered rather than a
 * social space quietly listed among work organisations. Two guards, one rule —
 * and the guard here is absence, never `display: none`.
 *
 * The column head is `aria-hidden` and desktop-only: it is visual scaffolding
 * for the 5-column grid, and every cell inside a row already carries its own
 * accessible text (the member count, the open-work sentence, the stage word).
 */
export async function MaalIndexList({
  rows,
  prefs,
  locale,
}: {
  rows: readonly VentureIndexRow[];
  prefs: LitePrefs;
  locale: Locale;
}) {
  const t = await getT();
  const workOrgs = rows.filter((row) => (WORK_ORG_MODES as readonly string[]).includes(row.mode));

  return (
    <div className="xidig-maal-table">
      <div className="xidig-maal-table__head" aria-hidden="true">
        <span>{t('maal.colName')}</span>
        <span>{t('maal.colStage')}</span>
        <span>{t('maal.colMembers')}</span>
        <span>{t('maal.colOpenWork')}</span>
        <span />
      </div>
      <ul className="xidig-maal-table__rows">
        {workOrgs.map((row) => (
          <MaalIndexRow key={row.id} row={row} prefs={prefs} locale={locale} />
        ))}
      </ul>
    </div>
  );
}
