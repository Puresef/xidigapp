'use client';

import { useT } from '@xidig/i18n/react';
import type { MessageKey } from '@xidig/i18n';

import { DAY_KEYS, type DayKey, type OpeningHours } from '@/lib/listings';

/**
 * Per-day opening hours editor (§18, Phase 4.5). One open/close interval per
 * day plus a "closed" toggle — v1 keeps it to a single interval (the jsonb
 * shape allows up to 3 for a future split-shift editor; the display already
 * renders any number). Controlled: the form owns the OpeningHours value.
 */

export const DAY_LABEL_KEYS: Record<DayKey, MessageKey> = {
  mon: 'suuq.dayMon',
  tue: 'suuq.dayTue',
  wed: 'suuq.dayWed',
  thu: 'suuq.dayThu',
  fri: 'suuq.dayFri',
  sat: 'suuq.daySat',
  sun: 'suuq.daySun',
};

export const EMPTY_OPENING_HOURS: OpeningHours = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

const DEFAULT_INTERVAL = { open: '09:00', close: '17:00' };

export function OpeningHoursEditor({
  value,
  onChange,
}: {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
}) {
  const t = useT();

  function setDay(day: DayKey, intervals: OpeningHours[DayKey]) {
    onChange({ ...value, [day]: intervals });
  }

  return (
    <fieldset className="xidig-field">
      <legend className="xidig-field__label">{t('suuq.hoursLabel')}</legend>
      <p className="xidig-field__hint">{t('suuq.hoursHint')}</p>
      <div className="xidig-row-editor">
        {DAY_KEYS.map((day) => {
          const interval = value[day][0] ?? null;
          const open = interval !== null;
          return (
            <div key={day} className="xidig-row-editor__row xidig-hours-editor__row">
              <span className="xidig-hours-editor__day">{t(DAY_LABEL_KEYS[day])}</span>
              <label className="xidig-hours-editor__closed">
                <input
                  type="checkbox"
                  checked={!open}
                  onChange={(e) => setDay(day, e.target.checked ? [] : [{ ...DEFAULT_INTERVAL }])}
                />{' '}
                {t('suuq.closedDay')}
              </label>
              {open ? (
                <>
                  <input
                    type="time"
                    className="xidig-field__input"
                    aria-label={`${t(DAY_LABEL_KEYS[day])} — ${t('suuq.openTimeLabel')}`}
                    value={interval.open}
                    onChange={(e) => setDay(day, [{ ...interval, open: e.target.value }])}
                  />
                  <input
                    type="time"
                    className="xidig-field__input"
                    aria-label={`${t(DAY_LABEL_KEYS[day])} — ${t('suuq.closeTimeLabel')}`}
                    value={interval.close}
                    onChange={(e) => setDay(day, [{ ...interval, close: e.target.value }])}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
