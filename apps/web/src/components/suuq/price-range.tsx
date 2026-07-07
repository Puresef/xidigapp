'use client';

import { useT } from '@xidig/i18n/react';

import { formatPriceRange } from '@/lib/listings';

/**
 * Price range 1–4 (§18, Phase 4.5), rendered as "$".."$$$$". The dollar
 * glyphs are a visual scale, not a currency claim — the aria-label carries
 * the actual meaning for screen readers.
 */

export function PriceRangeDisplay({ level }: { level: number | null | undefined }) {
  const t = useT();
  if (typeof level !== 'number' || level < 1) return null;
  return (
    <span
      className="xidig-tag xidig-price-range"
      aria-label={t('suuq.priceRangeAria', { level: String(Math.min(level, 4)) })}
    >
      {formatPriceRange(level)}
    </span>
  );
}

export function PriceRangeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (level: number | null) => void;
}) {
  const t = useT();
  return (
    <div className="xidig-field">
      <label className="xidig-field__label" htmlFor={id}>
        {t('suuq.priceRangeLabel')}
      </label>
      <select
        id={id}
        className="xidig-field__input"
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      >
        <option value="">{t('suuq.priceRangeNone')}</option>
        {[1, 2, 3, 4].map((level) => (
          <option key={level} value={String(level)}>
            {formatPriceRange(level)}
          </option>
        ))}
      </select>
    </div>
  );
}
