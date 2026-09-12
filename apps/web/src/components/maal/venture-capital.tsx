import { formatNumber, formatRelativeTime, type Locale, type MessageKey } from '@xidig/i18n';

import { SystemNotice } from '@/components/system-notice';
import { getT } from '@/lib/locale';
import type { VentureCapital as VentureCapitalModel } from '@/lib/maal/views';

/**
 * The capital section — frame 7f.
 *
 * Everything here is BUILT. The escrow is not, and this page says so in those
 * words: "Xidig weli ma laha amaan (escrow) — waxaan diidnay inaan lacagta
 * dadka gacanta ku qabano ka hor inta aan taas la dhisin." That is a refusal we
 * made, stated as a refusal.
 *
 * Which is why the pledge control is present and DISABLED rather than absent:
 * a member is entitled to see the shape of the thing they will one day use, and
 * to see exactly where it stops. The input and the button are in the DOM,
 * `disabled`, with the reason sitting next to them — never behind a tooltip,
 * never on a page you have to go and find.
 *
 * And what is NOT here is as deliberate as what is:
 *
 *   **no date. no countdown. no waitlist. no "coming soon".** There is no
 *   estimate, no progress bar toward a launch, no email capture, no "be the
 *   first to know". The footer is the whole promise: "Ma ballanqaadno taariikh.
 *   Marka amaanku diyaar noqdo, waxaan idin ogeysiinaynaa — ilaa markaas,
 *   shaqada ayaa muhiim." Anything warmer than that would be marketing a
 *   capability we refused to ship, and `venture-capital.test.tsx` asserts the
 *   controls are present-and-disabled precisely so nobody later "fixes" this
 *   surface by deleting the honest half.
 *
 * Money-critical: no mascot (FORBIDDEN list), and zero orange.
 */

/** Every row of "Waxa hadda shaqeeya", with whether it is actually working. */
const CHECKLIST: ReadonlyArray<{ key: MessageKey; done: boolean }> = [
  { key: 'maal.worksLedger', done: true },
  // Paused (owner ruling, 12 Sep): no new capital need can be declared. A need
  // recorded before the pause still renders above, read-only.
  { key: 'maal.worksNeed', done: false },
  { key: 'maal.worksMoneyWeight', done: true },
  { key: 'maal.worksPledgeLocked', done: false },
  { key: 'maal.worksEscrow', done: false },
];

export async function VentureCapital({
  capital,
  locale,
}: {
  capital: VentureCapitalModel;
  locale: Locale;
}) {
  const t = await getT();
  const { need, decision } = capital;

  return (
    <section className="xidig-section xidig-capital-section">
      <SystemNotice tone="info" messageKey="maal.escrowNotice" />

      {need ? (
        <section className="xidig-card xidig-venture__card">
          <h2 className="xidig-venture__card-title">{t('maal.needTitle')}</h2>
          <p className="xidig-card__body">{need.purpose}</p>
          <dl className="xidig-need">
            <dt>{t('maal.needAmount')}</dt>
            <dd className="num">
              {formatNumber(need.amount_cents / 100, locale, {
                style: 'currency',
                currency: need.currency,
                maximumFractionDigits: 0,
              })}
            </dd>
            <dt>{t('maal.needPurpose')}</dt>
            <dd>{need.purpose}</dd>
            <dt>{t('maal.needDecision')}</dt>
            <dd>
              {decision
                ? `${decision.title} · ${formatRelativeTime(new Date(decision.decidedAt), locale)}`
                : formatRelativeTime(new Date(need.declared_at), locale)}
            </dd>
          </dl>
        </section>
      ) : null}

      {/* Built, present, and inert — with the reason beside it, not behind it. */}
      <section className="xidig-card xidig-venture__card xidig-venture__card--dashed">
        <h2 className="xidig-venture__card-title">{t('maal.pledgeTitle')}</h2>
        <div className="xidig-pledge">
          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.needAmount')}</span>
            <input
              type="text"
              className="xidig-field__input"
              value={formatNumber(0, locale, {
                style: 'currency',
                currency: need?.currency ?? 'USD',
                maximumFractionDigits: 0,
              })}
              aria-label={t('maal.pledgeAmountAria')}
              disabled
              readOnly
            />
          </label>
          <button type="button" className="xidig-button xidig-button--primary" disabled>
            {t('maal.pledgeCta')}
          </button>
        </div>
        <p className="xidig-venture__card-body">{t('maal.pledgeLockNote')}</p>
      </section>

      <section className="xidig-card xidig-venture__card">
        <h2 className="xidig-venture__card-title">{t('maal.worksNowTitle')}</h2>
        <ul className="xidig-works">
          {CHECKLIST.map((item) => (
            <li
              key={item.key}
              className={`xidig-works__row${item.done ? '' : ' xidig-works__row--pending'}`}
            >
              <span className="xidig-works__mark" aria-hidden="true">
                {item.done ? <CheckGlyph /> : <PendingGlyph />}
              </span>
              <span>{t(item.key)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* No date. This sentence is the whole promise. */}
      <p className="xidig-capital-section__footer">{t('maal.capitalFooter')}</p>
    </section>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/** A circle with a bar — "not yet", never a cross (nothing here failed). */
function PendingGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M8.6 12h6.8" />
    </svg>
  );
}
