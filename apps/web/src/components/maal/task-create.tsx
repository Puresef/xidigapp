'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '@xidig/i18n/react';

import { ApiRequestError, apiPost } from '@/lib/api-client';
import { Dialog } from '@/components/dialog';
import type { PlainError } from '@/lib/errors';
import { TASK_TITLE_MAX } from '@/lib/maal/constants';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * "Hawl" — put a new card on the board (frame 7c header).
 *
 * A sheet rather than an inline row: a task belongs to a workstream, and the
 * choice of which box it lands in is part of writing it down, not an
 * afterthought to be fixed later. The card is created UNCLAIMED — it lands in
 * Qorshe and someone picks it up — because writing a task and doing it are two
 * decisions and the board is where the second one is made in the open.
 */
export function MaalTaskCreate({
  labId,
  workstreams,
}: {
  labId: string;
  workstreams: ReadonlyArray<{ id: string; name: string }>;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [workstreamId, setWorkstreamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);

  function submit() {
    setBusy(true);
    setError(null);
    apiPost(`/api/labs/${labId}/tasks`, {
      title: title.trim(),
      workstreamId: workstreamId === '' ? null : workstreamId,
    })
      .then(() => {
        setOpen(false);
        setTitle('');
        router.refresh();
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof ApiRequestError ? cause.plain : { code: 'server_error', message: '' },
        );
      })
      .finally(() => setBusy(false));
  }

  return (
    <>
      <button
        type="button"
        className="xidig-button xidig-button--primary xidig-board__action"
        onClick={() => setOpen(true)}
      >
        <PlusGlyph />
        {t('maal.newTask')}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('maal.newTask')}
        presentation="sheet"
      >
        <div className="xidig-maal-form">
          {error ? <PlainErrorBanner error={error} /> : null}

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.logTaskLabel')}</span>
            <input
              type="text"
              className="xidig-field__input"
              maxLength={TASK_TITLE_MAX}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.colWorkstream')}</span>
            <select
              className="xidig-field__input"
              value={workstreamId}
              onChange={(event) => setWorkstreamId(event.target.value)}
            >
              <option value="">{t('maal.optionNone')}</option>
              {workstreams.map((stream) => (
                <option key={stream.id} value={stream.id}>
                  {stream.name}
                </option>
              ))}
            </select>
          </label>

          <div className="xidig-maal-form__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={busy || title.trim().length === 0}
              onClick={submit}
            >
              {t('action.abuur')}
            </button>
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              disabled={busy}
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

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}
