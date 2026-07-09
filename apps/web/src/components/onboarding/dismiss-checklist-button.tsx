'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Dismisses the first-session checklist (§20) — writes onboarding_state.
 * checklistDismissed via the API (API-first: UI never writes the DB directly),
 * then refreshes so the server-rendered Home drops the card. Label is passed in
 * (already translated) so this client component carries no hardcoded copy.
 */
export function DismissChecklistButton({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss(): Promise<void> {
    setBusy(true);
    try {
      await fetch('/api/me/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklistDismissed: true }),
      });
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="xidig-button" onClick={dismiss} disabled={busy}>
      {label}
    </button>
  );
}
