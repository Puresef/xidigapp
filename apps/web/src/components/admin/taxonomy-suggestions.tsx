'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPatch } from '@/lib/api-client';

export interface Suggestion {
  id: string;
  kind: 'lane' | 'listing_category';
  term: string;
  note: string | null;
  created_at: string;
}

/**
 * Admin review of member term suggestions. Approve promotes the term into its
 * catalog (lanes / listing_categories) and removes it from the queue; decline
 * just clears it. Resolution is API-first (requireRole('admin') server-side) —
 * this list is the surface, never the control.
 */
export function TaxonomySuggestions({ initial }: { initial: Suggestion[] }) {
  const t = useT();
  const [items, setItems] = useState<Suggestion[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string, action: 'approve' | 'decline') {
    setBusy(id);
    try {
      await apiPatch('/api/admin/taxonomy-suggestions', { id, action });
      setItems((current) => current.filter((s) => s.id !== id));
    } catch {
      // Leave the row in place on failure; the admin can retry.
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="xidig-field__hint">{t('admin.taxonomyEmpty')}</p>;
  }

  return (
    <ul className="xidig-review-list">
      {items.map((item) => (
        <li key={item.id} className="xidig-review-list__row">
          <div>
            <strong>{item.term}</strong> <span className="xidig-tag">{item.kind}</span>
            {item.note ? <p className="xidig-field__hint">{item.note}</p> : null}
          </div>
          <div className="xidig-review-list__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={busy === item.id}
              onClick={() => resolve(item.id, 'approve')}
            >
              {t('action.approve')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy === item.id}
              onClick={() => resolve(item.id, 'decline')}
            >
              {t('action.decline')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
