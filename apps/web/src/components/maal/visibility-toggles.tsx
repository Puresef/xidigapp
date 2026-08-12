'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch } from '@/lib/api-client';
import { toast } from '@/lib/toast';

/**
 * The member-set visibility rail (frame 7b, "Muuqaalka").
 *
 * These three rows are the venture telling its members what it shows and to
 * whom, and the footer states whose choice that is: "Xubnaha ayaa doortay.
 * Xidig ma dooranayo — mana jiro wax si qarsoodi ah loo diiwaangeliyo." The
 * copy is not decoration — Xidig genuinely sets none of these, and the two
 * switches below write straight to the venture's own columns.
 *
 * Row 1 (the public page) is deliberately NOT a switch here. `labs.visibility`
 * is a Space-wide setting with its own form and its own consequences (listing,
 * OG image, anonymous projection), and `PATCH /api/labs/[id]/venture` does not
 * take it. A switch that silently wrote a different column, or a switch that
 * looked identical to the other two and did nothing, would both be worse than a
 * stated fact plus a link to the one place that owns it.
 *
 * Optimistic with a real rollback: the switch flips immediately, and a failed
 * PATCH puts it back and says so. A visibility control that keeps showing the
 * state you asked for after the write failed is telling you your ledger is
 * private when it is not.
 */
export function MaalVisibilityToggles({
  labId,
  settingsHref,
  publicPage,
  ledgerOpenToMembers,
  hoursLeadsOnly,
}: {
  labId: string;
  settingsHref: string;
  publicPage: boolean;
  ledgerOpenToMembers: boolean;
  hoursLeadsOnly: boolean;
}) {
  const t = useT();
  const [ledger, setLedger] = useState(ledgerOpenToMembers);
  const [hours, setHours] = useState(hoursLeadsOnly);
  const [busy, setBusy] = useState(false);

  function patch(body: Record<string, string>, revert: () => void) {
    setBusy(true);
    apiPatch(`/api/labs/${labId}/venture`, body)
      .catch(() => {
        revert();
        toast('state.errorTitle');
      })
      .finally(() => setBusy(false));
  }

  return (
    <section className="xidig-card xidig-venture__card">
      <h2 className="xidig-venture__card-title">{t('maal.visibilityTitle')}</h2>

      {/* Stated, not switched — the Space settings form owns this one. */}
      <div className="xidig-vis-row">
        <span className="xidig-vis-row__lines">
          <span className="xidig-vis-row__label">{t('maal.visPublicPage')}</span>
          <span className="xidig-vis-row__hint">{t('maal.visPublicPageHint')}</span>
        </span>
        <Link className="xidig-venture__card-link" href={settingsHref}>
          {t(publicPage ? 'lab.visPublic' : 'lab.visMembers')}
        </Link>
      </div>

      <VisibilitySwitch
        label={t('maal.visLedgerMembers')}
        hint={t('maal.visLedgerMembersHint')}
        checked={ledger}
        disabled={busy}
        onToggle={(next) => {
          setLedger(next);
          patch({ ledgerVisibility: next ? 'members' : 'leads' }, () => setLedger(!next));
        }}
      />

      <VisibilitySwitch
        label={t('maal.visHoursLeads')}
        hint={t('maal.visHoursLeadsHint')}
        checked={hours}
        disabled={busy}
        onToggle={(next) => {
          setHours(next);
          patch({ hoursVisibility: next ? 'leads' : 'members' }, () => setHours(!next));
        }}
      />

      <p className="xidig-vis-footer">{t('maal.visibilityFooter')}</p>
    </section>
  );
}

/**
 * A real switch: `role="switch"` + `aria-checked`, named by the row's own
 * label (aria-labelledby), so the control announces "Wax-ku-darsi furan
 * xubnaha, switch, on" rather than a nameless toggle.
 */
function VisibilitySwitch({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div className="xidig-vis-row">
      <span className="xidig-vis-row__lines">
        <span className="xidig-vis-row__label" id={labelId}>
          {label}
        </span>
        <span className="xidig-vis-row__hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        className="xidig-vis-switch"
        disabled={disabled}
        onClick={() => onToggle(!checked)}
      >
        <span className="xidig-vis-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
