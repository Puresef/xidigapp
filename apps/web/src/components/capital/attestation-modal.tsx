'use client';

import { useId, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { Dialog } from '../dialog';

/**
 * Somalia self-attestation modal (§17, compliance-critical). The THIRD gate
 * input — the member must actively confirm "I am based in Somalia" before an
 * invest-intent action proceeds. Profile country + geo-IP country are checked
 * server-side; this only captures the attestation checkbox. The gate is
 * ALWAYS re-evaluated server-side (this checkbox never grants on its own).
 *
 * Presentational dialog: the parent owns open/close and receives the confirmed
 * boolean via onConfirm. Cancelling never attests. Escape/backdrop/corner-X
 * follow the Cancel button's rules: inert while pending, never attesting.
 */
export function AttestationModal({
  open,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const checkboxId = useId();
  const [checked, setChecked] = useState(false);

  return (
    <Dialog
      open={open}
      title={t('capital.attestTitle')}
      onClose={() => {
        if (!pending) onCancel();
      }}
    >
      <p className="xidig-card__body">{t('capital.attestBody')}</p>

      <label className="xidig-checkbox" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>{t('capital.attestCheckbox')}</span>
      </label>

      <div className="xidig-modal__actions">
        <button
          type="button"
          className="xidig-button xidig-button--primary"
          disabled={!checked || pending}
          onClick={onConfirm}
        >
          {t('capital.attestConfirm')}
        </button>
        <button
          type="button"
          className="xidig-button xidig-button--secondary"
          disabled={pending}
          onClick={onCancel}
        >
          {t('action.cancel')}
        </button>
      </div>
    </Dialog>
  );
}
