'use client';

import { useT } from '@xidig/i18n/react';

import { LISTING_MAX_SERVICES } from '@/lib/listings';

/**
 * Services/menu editor (§18, Phase 4.5): name + optional price label rows,
 * ≤20, replace-all on save. Controlled — the form owns the rows and filters
 * out empty names on submit.
 */

export interface ServiceRow {
  name: string;
  priceLabel: string;
}

export function ListingServicesEditor({
  value,
  onChange,
}: {
  value: ServiceRow[];
  onChange: (rows: ServiceRow[]) => void;
}) {
  const t = useT();

  function setRow(index: number, patch: Partial<ServiceRow>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="xidig-field">
      <legend className="xidig-field__label">{t('suuq.servicesLabel')}</legend>
      <p className="xidig-field__hint">{t('suuq.servicesHint', { max: LISTING_MAX_SERVICES })}</p>
      <div className="xidig-row-editor">
        {value.map((row, index) => (
          <div key={index} className="xidig-row-editor__row">
            <input
              className="xidig-field__input"
              aria-label={t('suuq.serviceNameLabel')}
              placeholder={t('suuq.serviceNameLabel')}
              maxLength={120}
              value={row.name}
              onChange={(e) => setRow(index, { name: e.target.value })}
            />
            <input
              className="xidig-field__input"
              aria-label={t('suuq.servicePriceLabel')}
              placeholder={t('suuq.servicePriceLabel')}
              maxLength={40}
              value={row.priceLabel}
              onChange={(e) => setRow(index, { priceLabel: e.target.value })}
            />
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              aria-label={t('a11y.removeRow')}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              {t('action.remove')}
            </button>
          </div>
        ))}
        {value.length < LISTING_MAX_SERVICES ? (
          <button
            type="button"
            className="xidig-button xidig-button--secondary"
            onClick={() => onChange([...value, { name: '', priceLabel: '' }])}
          >
            {t('action.add')}
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
