'use client';

import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { apiPost } from '@/lib/api-client';
import type { TermSuggestionKind } from '@/lib/taxonomy/schemas';

/**
 * "Missing your sector? Suggest one." The governed escape hatch for the
 * shared-coordinate lists (lanes / categories): a member proposes a term, an
 * admin reviews it — never an instant public create (that would fragment the
 * shared filter axis). Fire-and-forget; a duplicate is treated as success.
 */
export function SuggestTerm({ kind }: { kind: TermSuggestionKind }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = term.trim();
    if (value.length < 2) return;
    setBusy(true);
    try {
      await apiPost('/api/taxonomy-suggestions', { kind, term: value });
      setDone(true);
      setTerm('');
      setOpen(false);
    } catch {
      // Non-blocking; the member can retry.
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="xidig-field__hint">{t('profile.suggestThanks')}</p>;

  if (!open) {
    return (
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-suggest__open"
        onClick={() => setOpen(true)}
      >
        {t('profile.suggestLane')}
      </button>
    );
  }

  return (
    <div className="xidig-suggest">
      <input
        className="xidig-field__input"
        value={term}
        maxLength={40}
        placeholder={t('profile.suggestPlaceholder')}
        onChange={(event) => setTerm(event.target.value)}
      />
      <button
        type="button"
        className="xidig-button xidig-button--secondary"
        disabled={busy || term.trim().length < 2}
        onClick={submit}
      >
        {t('action.suggest')}
      </button>
    </div>
  );
}
