'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { LEDGER_DEFAULT_DAYS, WORK_EVENT_TYPES, type WorkEventType } from '@/lib/maal/constants';

/**
 * The ledger's filters and its one retry (frames 7g and state m4).
 *
 * Ruling 1 again: these are the SAME filters the desktop table takes — member,
 * contribution type, window — reaching the same `ledgerQuerySchema` on the same
 * read. They live in a sheet at every width rather than a phone-only drawer,
 * because a filter row that exists on one viewport and not the other is a
 * capability difference wearing a layout costume.
 *
 * The filter state lives in the URL, not in this component: a filtered ledger
 * is a thing a member can send to another member, and a share % that depends on
 * invisible local state is not a number anyone can check.
 */

const WINDOWS = [30, LEDGER_DEFAULT_DAYS, 365] as const;

export function MaalLedgerFilters({
  slug,
  members,
  memberId,
  type,
  days,
}: {
  slug: string;
  members: ReadonlyArray<{ userId: string; name: string }>;
  memberId: string | null;
  type: WorkEventType | null;
  days: number;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftMember, setDraftMember] = useState(memberId ?? '');
  const [draftType, setDraftType] = useState<string>(type ?? '');
  const [draftDays, setDraftDays] = useState(String(days));

  const memberName =
    members.find((entry) => entry.userId === memberId)?.name ?? t('maal.filterAll');
  const typeName = type ? t(TYPE_KEYS[type]) : t('maal.filterAll');

  function apply() {
    const query = new URLSearchParams({ tab: 'ledger' });
    if (draftMember !== '') query.set('member', draftMember);
    if (draftType !== '') query.set('type', draftType);
    if (draftDays !== String(LEDGER_DEFAULT_DAYS)) query.set('days', draftDays);
    setOpen(false);
    router.push(`/labs/${slug}?${query.toString()}`);
  }

  return (
    <>
      <div className="xidig-ledger__filters">
        <button
          type="button"
          className="xidig-tag xidig-ledger__filter-trigger"
          aria-pressed={open}
          onClick={() => setOpen(true)}
        >
          <FilterGlyph />
          {t('maal.filterSheet')}
        </button>
        <span className="xidig-tag">{t('maal.filterMember', { value: memberName })}</span>
        <span className="xidig-tag">{t('maal.filterType', { value: typeName })}</span>
        <span className="xidig-tag">{t('maal.filterDays', { count: days })}</span>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('maal.filterSheet')}
        presentation="sheet"
      >
        <div className="xidig-maal-form">
          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.colMember')}</span>
            <select
              className="xidig-field__input"
              value={draftMember}
              onChange={(event) => setDraftMember(event.target.value)}
            >
              <option value="">{t('maal.filterAll')}</option>
              {members.map((entry) => (
                <option key={entry.userId} value={entry.userId}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.logTypeLabel')}</span>
            <select
              className="xidig-field__input"
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
            >
              <option value="">{t('maal.filterAll')}</option>
              {WORK_EVENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(TYPE_KEYS[value])}
                </option>
              ))}
            </select>
          </label>

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.filterDays', { count: days })}</span>
            <select
              className="xidig-field__input"
              value={draftDays}
              onChange={(event) => setDraftDays(event.target.value)}
            >
              {WINDOWS.map((value) => (
                <option key={value} value={String(value)}>
                  {t('maal.filterDays', { count: value })}
                </option>
              ))}
            </select>
          </label>

          <div className="xidig-maal-form__actions">
            <button type="button" className="xidig-button xidig-button--primary" onClick={apply}>
              {t('maal.filterSheet')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => setOpen(false)}
            >
              {t('action.cancel')}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/**
 * State m4's one button. It re-runs the SAME request — nothing is repaired,
 * nothing is reconstructed locally — because the ledger did not lose anything
 * and there is nothing here to fix except the read.
 */
export function MaalLedgerRetry() {
  const t = useT();
  const router = useRouter();
  return (
    <button
      type="button"
      className="xidig-button xidig-button--secondary"
      onClick={() => router.refresh()}
    >
      {t('action.retry')}
    </button>
  );
}

/** `work_event_type` → its label key. A closed map, never string arithmetic. */
const TYPE_KEYS: Record<WorkEventType, MessageKey> = {
  hours: 'maal.typeHours',
  code: 'maal.typeCode',
  design: 'maal.typeDesign',
  intro: 'maal.typeIntro',
  money: 'maal.typeMoney',
};

function FilterGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
