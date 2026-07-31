'use client';

import { useState } from 'react';

import { formatDate } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Dialog } from '../dialog';

/**
 * The Verified Business chip as a BUTTON (Task 11): tapping it opens a small
 * dialog that says honestly what verification checked (§14 — a community
 * verifier confirmed the business is real via video call / premises video /
 * documents; explicitly NOT a quality rating) and when ("Checked: {date}",
 * from the denormalized verified_at). verifiedAt tolerates null — seeded or
 * pre-backfill rows simply omit the date line rather than inventing one.
 *
 * Renders only the chip + dialog so the card and the /l/[id] detail header
 * share one truth. button.xidig-tag styling already exists (globals.css).
 */
export function VerifiedExplainer({ verifiedAt }: { verifiedAt?: string | null }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="xidig-tag xidig-tag--trust"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t('suuq.verifiedBusiness')}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('suuq.verifiedBusiness')}>
        <p className="xidig-card__body">{t('suuq.verifiedExplainerBody')}</p>
        {verifiedAt ? (
          <p className="xidig-card__meta">
            {t('suuq.verifiedCheckedDate', { date: formatDate(new Date(verifiedAt), locale) })}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
