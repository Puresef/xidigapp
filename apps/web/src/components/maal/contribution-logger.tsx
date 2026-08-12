'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

import { formatNumber, formatRelativeTime, type MessageKey } from '@xidig/i18n';
import { useLocale, useT } from '@xidig/i18n/react';

import { Dialog } from '@/components/dialog';
import { ApiRequestError, apiPost } from '@/lib/api-client';
import type { PlainError } from '@/lib/errors';
import {
  enqueue,
  flushContributionQueue,
  listForLab,
  remove as removeQueued,
  subscribe as subscribeQueue,
  type QueuedContribution,
  type QueuedContributionType,
} from '@/lib/maal/contribution-queue';
import { WORK_EVENT_TYPES, WORK_NOTE_MAX } from '@/lib/maal/constants';

import { PlainErrorBanner } from '../auth/plain-error';

/**
 * "Diiwaangeli wax-ku-darsi" — the self-log (frame 7c) and state m5.
 *
 * **Self-logged means self-logged.** This form is the ONLY way an hour reaches
 * the ledger: the app runs no timer, watches no activity, and derives nothing.
 * What the member types is a statement they are making about their own work,
 * and every word around it is written that way.
 *
 * The offline path (m5) is where that statement has to survive a bad network:
 *
 *  - the form stays fully writable with no connection — Lite defers bytes and
 *    the network defers delivery, but neither ever removes a write path;
 *  - a submit that fails while `navigator.onLine` is false parks the log with
 *    the TRUE moment the member entered it, and that timestamp is what the
 *    replay sends. The chip says so in words ("Waqtiga dhabta ah ee aad gelisay
 *    ayaa la kaydinayaa, ma aha waqtiga dirista") and the queue module means it;
 *  - a 4xx/5xx is an ANSWER, not a network failure. It is surfaced verbatim and
 *    never queued — the ledger is append-only, so a log the server refused must
 *    not sit around promising to append itself later;
 *  - Tirtir withdraws a parked log before it goes out. Once it IS out, the only
 *    correction is a reversal event, which is the whole point of the chain.
 *
 * The queue flushes on `window 'online'` AND once on mount while already
 * online: a reload never fires 'online', so mount is the only chance to unstick
 * a queue parked before the reload. `flush()` is single-flight, so several
 * mounted islands share one pass rather than double-appending.
 *
 * A flush that ends badly SAYS SO. `sent` refreshes the page, but `refused`
 * (the server answered no) and `expired` (aged past the queue's TTL, never
 * sent) are the two ways a parked log can disappear, and a ledger that loses a
 * member's work quietly is worse than one that errors. Both surface as a
 * sentence with the next step in it; neither offers a retry, because a refused
 * log was already answered and an expired one has to be re-entered by hand.
 *
 * **Money is entered in whole currency units and stored in CENTS.** That
 * conversion happens exactly once, at the submit boundary, and it is the same
 * number that goes to the API and into the offline queue — so a replayed log
 * is identical to the one that would have gone out live. The field says its
 * unit in its own label and echoes the exact figure that will be appended,
 * because the ledger is append-only: "$500 recorded as $5.00" survives only as
 * a public reversal event, forever.
 */

const TYPE_KEYS: Record<QueuedContributionType, MessageKey> = {
  hours: 'maal.typeHours',
  code: 'maal.typeCode',
  design: 'maal.typeDesign',
  intro: 'maal.typeIntro',
  money: 'maal.typeMoney',
};

/**
 * The ledger's currency. One venture-wide code, matching the default the ledger
 * and the capital section render `amount_cents` with (`venture_capital_needs`
 * carries its own `currency`; a per-venture ledger currency is not modelled).
 */
const LEDGER_CURRENCY = 'USD';

/** What a typed amount becomes in the ledger: cents for money, the count itself
 *  for hours/PRs/designs/introductions. The ONE conversion, in one place. */
function toLedgerQuantity(amount: number, type: QueuedContributionType): number {
  return type === 'money' ? Math.round(amount * 100) : amount;
}

export function MaalContributionLogger({
  labId,
  tasks,
}: {
  labId: string;
  tasks: ReadonlyArray<{ id: string; title: string }>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const moneyHintId = useId();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QueuedContributionType>('hours');
  const [quantity, setQuantity] = useState('');
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainError | null>(null);
  // null on the server and the first client paint (hydration-stable); the
  // effects below sync both from the browser.
  const [queued, setQueued] = useState<QueuedContribution[]>([]);
  const [offline, setOffline] = useState(false);
  // What the last flush lost, if it lost anything. Never a retry offer: a
  // refused log was answered and an expired one must be re-entered.
  const [lost, setLost] = useState<{ refused: number; expired: number } | null>(null);

  useEffect(() => {
    const sync = () => setQueued(listForLab(labId));
    sync();
    return subscribeQueue(sync);
  }, [labId]);

  useEffect(() => {
    const syncOnline = () => setOffline(!navigator.onLine);
    syncOnline();
    const runFlush = () => {
      syncOnline();
      void flushContributionQueue().then((result) => {
        // Both endings mean "your parked log is not in the ledger" — the two
        // reasons need different words, so they are counted separately.
        setLost(
          result.refused > 0 || result.expired > 0
            ? { refused: result.refused, expired: result.expired }
            : null,
        );
        if (result.sent > 0) router.refresh();
      });
    };
    if (navigator.onLine && listForLab(labId).length > 0) runFlush();
    window.addEventListener('online', runFlush);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', runFlush);
      window.removeEventListener('offline', syncOnline);
    };
  }, [labId, router]);

  function submit() {
    const amount = Number(quantity);
    if (!Number.isFinite(amount) || amount <= 0) return;
    // THE boundary. Whole currency units in, cents out — once, here, and the
    // same value is what the queue would replay. Everything downstream (the
    // API, the ledger, the CSV) is already in ledger units.
    const ledgerQuantity = toLedgerQuantity(amount, type);
    // The member's own statement of WHEN — captured at submit, sent verbatim
    // however long the log sits in the queue.
    const occurredAt = new Date().toISOString();
    const chosenTask = tasks.find((task) => task.id === taskId) ?? null;
    const body = {
      type,
      quantity: ledgerQuantity,
      taskId: taskId === '' ? null : taskId,
      note: note.trim() === '' ? null : note.trim(),
      occurredAt,
    };

    setBusy(true);
    setError(null);
    apiPost(`/api/labs/${labId}/contributions`, body)
      .then(() => {
        setOpen(false);
        setQuantity('');
        setNote('');
        router.refresh();
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError) {
          // A definitive server answer — surfaced, never queued, even if
          // navigator.onLine is stale (the response proves a round trip).
          setError(cause.plain);
          return;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueue({
            id: `${occurredAt}-${Math.random().toString(36).slice(2, 10)}`,
            labId,
            type,
            // Ledger units, exactly as the live POST above would have sent.
            quantity: ledgerQuantity,
            taskId: body.taskId,
            note: body.note,
            occurredAt,
            label: chosenTask?.title ?? t(TYPE_KEYS[type]),
            queuedAt: Date.now(),
          });
          setOpen(false);
          setQuantity('');
          setNote('');
          return;
        }
        setError({ code: 'server_error', message: '' });
      })
      .finally(() => setBusy(false));
  }

  const isMoney = type === 'money';
  const typedAmount = Number(quantity);
  // What the ledger will actually hold, said back in the member's own units.
  // Only once there is a real number to echo — an empty field states nothing.
  const moneyPreview =
    isMoney && quantity.trim() !== '' && Number.isFinite(typedAmount) && typedAmount > 0
      ? t('maal.logAmountMoneyPreview', {
          amount: formatNumber(toLedgerQuantity(typedAmount, 'money') / 100, locale, {
            style: 'currency',
            currency: LEDGER_CURRENCY,
          }),
        })
      : null;

  return (
    <>
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-board__action"
        onClick={() => setOpen(true)}
      >
        <ClockGlyph />
        {t('maal.logContribution')}
      </button>

      {/* m5's top bar. A statement of the network, not of the feature: the
          form below it stays writable. */}
      {offline ? (
        <p className="xidig-board__offline" role="status">
          {t('maal.offlineBar')}
        </p>
      ) : null}

      {/* A parked log that did not make it in. Same queue grammar as the chip
          above, error voice: what happened, and what it means for the ledger.
          The refused/expired split is the whole point — one says the server
          answered no, the other says it was never sent and has to be typed
          again. Dismissed by hand: it must not vanish on the next render. */}
      {lost ? (
        <div className="xidig-maal-queue xidig-maal-queue--lost" role="alert">
          <p className="xidig-maal-queue__count">{t('state.errorTitle')}</p>
          {lost.refused > 0 ? (
            <p className="xidig-maal-queue__note">
              {t('maal.queueRefused', { count: lost.refused })}
            </p>
          ) : null}
          {lost.expired > 0 ? (
            <p className="xidig-maal-queue__note">
              {t('maal.queueExpired', { count: lost.expired })}
            </p>
          ) : null}
          <span className="xidig-maal-queue__actions">
            <button
              type="button"
              className="xidig-button xidig-button--secondary"
              onClick={() => setLost(null)}
            >
              {t('action.dismiss')}
            </button>
          </span>
        </div>
      ) : null}

      {queued.length > 0 ? (
        <div className="xidig-maal-queue">
          <p className="xidig-maal-queue__count">
            <ClockGlyph />
            {t('maal.queuedCount', { count: queued.length })}
          </p>
          <ul className="xidig-maal-queue__list">
            {queued.map((entry) => (
              <li key={entry.id} className="xidig-maal-queue__item">
                <span className="xidig-maal-queue__lines">
                  <span className="xidig-maal-queue__chip">{t('state.queuedChip')}</span>
                  <span className="xidig-maal-queue__note">
                    {t('maal.queuedNote', { label: entry.label })}
                    {` · ${formatRelativeTime(entry.queuedAt, locale)}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="xidig-button xidig-button--secondary"
                  onClick={() => removeQueued(entry.id)}
                >
                  {t('action.delete')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('maal.logContribution')}
        presentation="sheet"
      >
        <div className="xidig-maal-form">
          {error ? <PlainErrorBanner error={error} /> : null}

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.logTaskLabel')}</span>
            <select
              className="xidig-field__input"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              <option value="">{t('maal.optionNone')}</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.logTypeLabel')}</span>
            <select
              className="xidig-field__input"
              value={type}
              onChange={(event) => setType(event.target.value as QueuedContributionType)}
            >
              {WORK_EVENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(TYPE_KEYS[value])}
                </option>
              ))}
            </select>
          </label>

          {/* The money case is EXPLICIT. Hours/PRs/designs/introductions are
              counts and need no unit; money is the one entry whose unit the
              ledger and the member disagree about, so the label carries the
              currency, the step is a cent, and the hint below states the unit
              and echoes the exact amount that will be appended. */}
          <label className="xidig-field">
            <span className="xidig-field__label">
              {isMoney
                ? t('maal.logAmountMoneyLabel', { currency: LEDGER_CURRENCY })
                : t('maal.logAmountLabel')}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={isMoney ? '0.01' : '0.25'}
              className="xidig-field__input"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              {...(isMoney ? { 'aria-describedby': moneyHintId } : {})}
            />
            {isMoney ? (
              <span className="xidig-field__hint" id={moneyHintId}>
                {t('maal.logAmountMoneyHint', { currency: LEDGER_CURRENCY })}
                {moneyPreview === null ? '' : ` · ${moneyPreview}`}
              </span>
            ) : null}
          </label>

          <label className="xidig-field">
            <span className="xidig-field__label">{t('maal.csvNote')}</span>
            <input
              type="text"
              className="xidig-field__input"
              maxLength={WORK_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <div className="xidig-maal-form__actions">
            <button
              type="button"
              className="xidig-button xidig-button--primary"
              disabled={busy || quantity.trim() === ''}
              onClick={submit}
            >
              {t('maal.logSubmit')}
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

/** The clock — the queued-log marker, shared by the button and the chip. */
function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8v4.4l2.8 1.7" />
    </svg>
  );
}
