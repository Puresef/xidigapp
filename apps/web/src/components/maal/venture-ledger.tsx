import Link from 'next/link';

import { formatNumber, formatRelativeTime, type Locale, type MessageKey } from '@xidig/i18n';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { Avatar } from '@/components/media/avatar';
import { SystemNotice } from '@/components/system-notice';
import { ROLE_KEYS } from '@/lib/labs/labels';
import type { LitePrefs } from '@/lib/lite/prefs';
import { getT } from '@/lib/locale';
import type {
  LedgerEventView,
  LedgerMemberRow,
  VentureLedger as VentureLedgerModel,
} from '@/lib/maal/views';

import { MaalLedgerFilters, MaalLedgerRetry } from './ledger-controls';

/**
 * The contribution & share ledger — frames 7d (desktop) and 7g (mobile).
 *
 * **Ruling 1 is the whole point of this file.** There is ONE ledger. One read
 * model (`getVentureLedger`), one component, one DOM: the desktop table and the
 * mobile card are the same nodes under two grid templates, exactly as the Maal
 * index row is. No second, thinner mobile query exists to drift away from this
 * one; no column is dropped at 402px; there is no "see the full ledger on
 * desktop" anywhere, because there is nothing bigger to go and see. What
 * changes with the viewport is where the seven columns sit, and nothing else.
 *
 * That is enforced structurally, not by convention:
 *   - every metric renders as a `.xidig-ledger-cell` carrying BOTH its value
 *     and its own label. The label is visible on the card layout and clipped
 *     (never `display: none`) on the table layout, where the column head shows
 *     it instead — so a screen reader gets "128, Saac" at every width;
 *   - `venture-ledger.test.tsx` asserts all seven columns are in the DOM from
 *     one render and that no metric cell is hidden by any media query.
 *
 * **The compliance notice sits at the top.** It is the first block after the
 * heading, not a footnote under the table: the share has no legal force until a
 * company exists, it never weights a vote, the ledger is append-only and
 * hash-chained, and a correction is a new event. Somebody reading this page to
 * decide whether to trust it must hit that paragraph before they hit a number.
 *
 * **A reversal renders as itself.** Muted, with the reversal arrow, the reason
 * the member gave and THE TYPE IT CORRECTS, sitting in the trail in its own
 * place in the chain — never as a gap where a row used to be, and never by
 * quietly editing the row it points at. A correction is visible history, so it
 * has to be readable as a correction OF something: a reversed introduction or
 * recorded sum described as "N hours" is a permanent misstatement on a table
 * nobody can edit.
 *
 * **The totals never blank.** State m4: when the detail trail fails to load,
 * the four stat cards and the member table stay exactly where they were — they
 * came from the tally, which succeeded — and the notice says the read failed
 * and that the ledger itself lost nothing. A money-adjacent number that
 * disappears because a second query timed out is a worse lie than an error.
 *
 * The only orange on this surface is the guul star on an attested event row —
 * an earned milestone mark, legal under badge canon 10a. No mascot: this file
 * is on the FORBIDDEN list in mascot-forbidden-surfaces.test.ts.
 */

const EVENT_KEYS: Record<LedgerEventView['type'], MessageKey> = {
  hours: 'maal.eventHours',
  code: 'maal.eventCode',
  design: 'maal.eventDesign',
  intro: 'maal.eventIntro',
  money: 'maal.eventMoney',
};

const TYPE_KEYS: Record<LedgerEventView['type'], MessageKey> = {
  hours: 'maal.typeHours',
  code: 'maal.typeCode',
  design: 'maal.typeDesign',
  intro: 'maal.typeIntro',
  money: 'maal.typeMoney',
};

/**
 * A reversal names the TYPE it corrects — the mirror of EVENT_KEYS, one key per
 * work_event_type. One shared "…{count} hours…" sentence would render a
 * reversed PR, design, introduction or recorded sum as hours, and on an
 * append-only ledger a row that misstates what it undid is permanent.
 */
const REVERSAL_KEYS: Record<LedgerEventView['type'], MessageKey> = {
  hours: 'maal.eventReversalHours',
  code: 'maal.eventReversalCode',
  design: 'maal.eventReversalDesign',
  intro: 'maal.eventReversalIntro',
  money: 'maal.eventReversalMoney',
};

/** The one dash on this surface: a cell with nothing true to put in it. */
const DASH = '—';

/** Money is a number, formatted — never a dictionary string that could drift. */
function money(cents: number, locale: Locale, currency = 'USD'): string {
  return formatNumber(cents / 100, locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

export async function VentureLedger({
  ledger,
  slug,
  labId,
  locale,
  prefs,
}: {
  ledger: VentureLedgerModel;
  slug: string;
  labId: string;
  locale: Locale;
  prefs: LitePrefs;
}) {
  const t = await getT();
  const { stats, weights } = ledger;

  const exportQuery = new URLSearchParams();
  if (ledger.filters.memberId) exportQuery.set('memberId', ledger.filters.memberId);
  if (ledger.filters.type) exportQuery.set('type', ledger.filters.type);

  return (
    <section className="xidig-section xidig-ledger">
      <header className="xidig-ledger__head">
        <span className="xidig-ledger__head-lines">
          <h2 className="xidig-ledger__title">{t('maal.tabLedger')}</h2>
          <span className="xidig-ledger__subtitle">
            {t('maal.ledgerSubtitle', { name: ledger.lab.name })}
          </span>
        </span>
        {/* Present at every width — the member's own copy of the agreement. */}
        <a
          className="xidig-button xidig-button--secondary xidig-ledger__export"
          href={`/api/labs/${labId}/contributions/export?${exportQuery.toString()}`}
        >
          <DownloadGlyph />
          {t('maal.exportCsv')}
        </a>
      </header>

      {/* Where eyes land, not a footnote. */}
      <SystemNotice tone="info" messageKey="maal.ledgerNotice" />

      <MaalLedgerFilters
        slug={slug}
        members={ledger.members.map((row) => ({
          userId: row.userId,
          name: row.member?.display_name ?? row.userId,
        }))}
        memberId={ledger.filters.memberId}
        type={ledger.filters.type}
        days={ledger.filters.days}
      />

      <div className="xidig-ledger__stats">
        <StatCard
          value={formatNumber(stats.totalHours, locale, { maximumFractionDigits: 1 })}
          labelKey="maal.statTotalHours"
        />
        <StatCard value={formatNumber(stats.eventCount, locale)} labelKey="maal.statEventsLogged" />
        <StatCard
          value={formatNumber(stats.contributorCount, locale)}
          labelKey="maal.statContributors"
        />
        {/* Recorded, never moved. Dashed, muted, and honest about being $0. */}
        <StatCard value={money(stats.moneyCents, locale)} labelKey="maal.statMoneyClosed" dashed />
      </div>

      <div className="xidig-ledger-table">
        <div className="xidig-ledger-head" aria-hidden="true">
          <span>{t('maal.colMember')}</span>
          <span>{t('maal.typeHours')}</span>
          <span>{t('maal.typeCode')}</span>
          <span>{t('maal.typeDesign')}</span>
          <span>{t('maal.typeIntro')}</span>
          <span>{t('maal.colUnits')}</span>
          <span>{t('maal.colShare')}</span>
        </div>
        <ul className="xidig-ledger-table__rows">
          {ledger.members.map((row) => (
            <LedgerMember key={row.userId} row={row} slug={slug} locale={locale} prefs={prefs} />
          ))}
        </ul>
      </div>

      {/* m4 — the totals above stayed; only the detail read failed. */}
      {ledger.trailError ? (
        <section className="xidig-card xidig-venture__card">
          <SystemNotice tone="info" messageKey="maal.ledgerErrorNotice" />
          <MaalLedgerRetry />
          <p className="xidig-venture__card-body">{t('maal.ledgerErrorFooter')}</p>
        </section>
      ) : (
        <section className="xidig-card xidig-venture__card">
          <div className="xidig-venture__card-head">
            <h3 className="xidig-venture__card-title">{t('maal.eventTrailTitle')}</h3>
            <span className="xidig-venture__card-note">
              {t('maal.eventTrailAll', { count: stats.eventCount })}
            </span>
          </div>
          <ul className="xidig-trail">
            {(ledger.trail ?? []).map((event) => (
              <TrailRow key={event.id} event={event} locale={locale} />
            ))}
          </ul>
        </section>
      )}

      <div className="xidig-ledger__cards">
        <section className="xidig-card xidig-venture__card">
          <h3 className="xidig-venture__card-title">{t('maal.weightsTitle')}</h3>
          {/* The four numbers are params: the members can vote a different
              scheme, and a hard-coded 8/12/10/25 would start lying the day
              they do. */}
          <p className="xidig-venture__card-body">
            {t('maal.weightsBody', {
              hours: formatNumber(weights.weights.hours, locale),
              code: formatNumber(weights.weights.code, locale),
              design: formatNumber(weights.weights.design, locale),
              intro: formatNumber(weights.weights.intro, locale),
            })}
          </p>
          <Link className="xidig-venture__card-link" href={`/labs/${slug}?tab=decisions`}>
            {t('maal.weightsLink')}
          </Link>
        </section>

        <section className="xidig-card xidig-venture__card xidig-venture__card--dashed">
          <h3 className="xidig-venture__card-title">
            <LockGlyph />
            {t('maal.moneyCardTitle')}
          </h3>
          <p className="xidig-venture__card-body">{t('maal.moneyCardBody')}</p>
        </section>
      </div>
    </section>
  );
}

async function StatCard({
  value,
  labelKey,
  dashed = false,
}: {
  value: string;
  labelKey: MessageKey;
  dashed?: boolean;
}) {
  const t = await getT();
  return (
    <div className={`xidig-ledger-stat${dashed ? ' xidig-ledger-stat--dashed' : ''}`}>
      <span className="num xidig-ledger-stat__value">{value}</span>
      <span className="xidig-ledger-stat__label">{t(labelKey)}</span>
    </div>
  );
}

/**
 * One member's whole line. Seven data cells, always all seven, at every width.
 *
 * The hours cell is the one that can be withheld — `hours === null` means the
 * venture's members voted hours to leads only, and the dash here is paired with
 * the venture TOTAL in the stat card above, which is exactly what
 * `maal.visHoursLeadsHint` promises ("Xubnaha kale waxay arkaan wadar"). Units
 * and share stay visible regardless: they are what the ledger is FOR, and
 * hiding them to make the fold airtight would hide the venture from itself.
 *
 * The fold takes the per-TYPE breakdown with it: `codeCount`/`designCount`/
 * `introCount` come back null alongside `hours`, because a count plus the
 * PUBLISHED weight of its type plus the member's units is a solvable equation
 * for the hidden hours. A withheld cell and an empty one both read as a dash —
 * and the column itself never leaves the document at either width (ruling 1).
 */
async function LedgerMember({
  row,
  slug,
  locale,
  prefs,
}: {
  row: LedgerMemberRow;
  slug: string;
  locale: Locale;
  prefs: LitePrefs;
}) {
  const t = await getT();
  const percent = formatNumber(row.share, locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <li className="xidig-ledger-row">
      <span className="xidig-ledger-row__member">
        {row.member ? (
          <Avatar
            name={row.member.display_name}
            handle={row.member.handle}
            src={row.member.avatar_thumb_url}
            blurhash={row.member.avatar_blurhash}
            size={28}
            prefs={prefs}
          />
        ) : null}
        <span className="xidig-ledger-row__member-lines">
          <span className="xidig-ledger-row__name">{row.member?.display_name ?? ''}</span>
          <span className="xidig-ledger-row__role">{row.role ? t(ROLE_KEYS[row.role]) : ''}</span>
        </span>
      </span>

      <span className="num xidig-ledger-row__share">
        <span className="xidig-visually-hidden">{`${t('maal.colShare')}: `}</span>
        {percent}
      </span>

      <span className="xidig-ledger-row__cells">
        <Cell
          className="xidig-ledger-cell--hours"
          value={
            row.hours === null
              ? DASH
              : formatNumber(row.hours, locale, { maximumFractionDigits: 1 })
          }
          label={t('maal.statHoursShort')}
        />
        <Cell
          className="xidig-ledger-cell--code"
          value={countCell(row.codeCount, locale)}
          label={t('maal.statPrShort')}
        />
        <Cell
          className="xidig-ledger-cell--design"
          value={countCell(row.designCount, locale)}
          label={t('maal.typeDesign')}
        />
        <Cell
          className="xidig-ledger-cell--intro"
          value={countCell(row.introCount, locale)}
          label={t('maal.statIntrosShort')}
        />
      </span>

      <span className="xidig-ledger-row__units">
        <span className="xidig-ledger-row__bar">
          <span
            className="xidig-ledger-row__bar-fill"
            style={{ width: `${Math.round(row.share * 100)}%` }}
          />
        </span>
        <span className="num xidig-ledger-row__units-value">
          {t('maal.unitsValue', { count: formatNumber(row.units, locale) })}
        </span>
      </span>

      <Link
        className="xidig-ledger-row__events"
        href={`/labs/${slug}?tab=ledger&member=${row.userId}`}
      >
        {t('maal.memberEventsLink', { count: row.eventCount })}
      </Link>
    </li>
  );
}

/**
 * One per-type count, rendered. `null` is the read model WITHHOLDING the
 * breakdown (the hours fold, see above), `0` is "none of this kind yet" — both
 * are a dash, because neither is a number this viewer can be shown. Written as
 * a helper rather than inline so the null branch survives the read model
 * changing shape under it.
 */
function countCell(value: number | null, locale: Locale): string {
  return value === null || value <= 0 ? DASH : formatNumber(value, locale);
}

/** One metric: its value AND its own label, at every width (see the ruling-1 note). */
function Cell({ className, value, label }: { className: string; value: string; label: string }) {
  return (
    <span className={`xidig-ledger-cell ${className}`}>
      <span className="num xidig-ledger-cell__value">{value}</span>
      <span className="xidig-ledger-cell__label">{label}</span>
    </span>
  );
}

/** One event in the chain. A reversal is a row, never a hole. */
async function TrailRow({ event, locale }: { event: LedgerEventView; locale: Locale }) {
  const t = await getT();

  const quantity = Math.abs(event.quantity);
  const params = {
    name: event.member?.display_name ?? '',
    count: formatNumber(quantity, locale, { maximumFractionDigits: 1 }),
    task: event.task?.title ?? '',
    // `money` quantities are CENTS in the ledger, as they are in the logger.
    amount: money(quantity, locale),
  };

  let sentence: string;
  if (event.isReversal) {
    // Named by the type it corrects — a reversed introduction is not "N hours".
    sentence = t(REVERSAL_KEYS[event.type], { ...params, reason: event.note ?? '' });
  } else if (event.type === 'code' && event.note === null) {
    // The quantity is a COUNT of approved PRs. Sliding it into "PR #{ref}"
    // would invent a pull-request number — "3 PRs" is not "PR #3" — and the
    // row can never be edited afterwards, so it says the true thing instead.
    sentence = t('maal.eventCodeCount', params);
  } else {
    sentence = t(EVENT_KEYS[event.type], { ...params, ref: event.note ?? '' });
  }

  return (
    <li className={`xidig-trail__row${event.isReversal ? ' xidig-trail__row--reversal' : ''}`}>
      <span className="xidig-trail__mark">
        {event.isReversal ? (
          // The reversal arrow. A correction announces itself.
          <span aria-label={t('maal.reversalTag')} role="img">
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h16M13 5l7 7-7 7" />
            </svg>
          </span>
        ) : event.attestationCount > 0 ? (
          <XidigIcon name="guul" variant="filled" size={14} label={t('maal.attestedAria')} />
        ) : (
          <span className="xidig-trail__mark-empty" aria-hidden="true" />
        )}
      </span>
      <span className="xidig-trail__text">
        {sentence}
        {!event.isReversal && event.attestationCount > 0
          ? ` — ${t('maal.attestationCount', { count: event.attestationCount })}`
          : ''}
      </span>
      <span className="xidig-trail__when">
        {formatRelativeTime(new Date(event.occurredAt), locale)}
      </span>
      <span className="xidig-visually-hidden">{t(TYPE_KEYS[event.type])}</span>
    </li>
  );
}

function DownloadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v10.5M7.5 11 12 15.5 16.5 11" />
      <path d="M5 19.5h14" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  );
}
