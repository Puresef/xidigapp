'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { MessageKey } from '@xidig/i18n';
import { useT } from '@xidig/i18n/react';

import { PlainErrorBanner } from '@/components/auth/plain-error';
import { Banner } from '@/components/banner';
import { Dialog } from '@/components/dialog';
import { ApiRequestError, apiPut } from '@/lib/api-client';
import { ANIGA_MODULE_TITLE_KEYS } from '@/lib/aniga/modules';
import type { AnigaModuleId, AnigaModuleState } from '@/lib/aniga/modules';
import type { PlainError } from '@/lib/errors';

/**
 * Module manager — the owner's control over what a visitor meets and in what
 * order (spec §1 "Module manager", frames 10e mobile / 10b desktop, state v7).
 *
 * Two surfaces, one state machine, and the difference between them is only
 * WHEN the write leaves:
 *
 *  - `sheet` (mobile, 10e): edits are local until "Kaydi habaynta". A phone
 *    reorder is a sequence of taps, and saving each one would put a member on
 *    a metered connection through eight round trips to move one row.
 *  - `rail` (desktop, 10b): every change saves at once — the card sits beside
 *    the live profile and says so ("Isbeddelku wuu degdegaa"), so a Save button
 *    would be a second promise where the frame makes only one.
 *
 * Three properties are load-bearing:
 *
 *  1. **Reorder is keyboard-first.** Up/down buttons are the baseline (the
 *     pins-picker precedent, §22); pointer drag is layered ON TOP and owns
 *     nothing. A drag-only list is a keyboard trap, and the manager is the one
 *     surface a member cannot route around.
 *  2. **The flag row is refused, not disabled-looking.** Tirakoobka renders
 *     with no toggle at all, a "Damsan" chip, and a sub-label naming the
 *     decider — plain system state (ruling 7, endorsed 9 Aug). It is never
 *     promotional and never a countdown. The save then reports the module as
 *     hidden, and should the server refuse anyway the local set REVERTS, so a
 *     flag-held module cannot end up on screen looking enabled.
 *  3. **Offline queues honestly** (v7). The arrangement applies here
 *     immediately because it is the member's own device and their own page;
 *     the chip says the visitors' copy has not left yet, and "Tirtir" takes it
 *     back. A state chip, never a spinner — a spinner would claim work is in
 *     flight while the radio is off.
 */

type ManagerPresentation = 'sheet' | 'rail';

export interface ModuleManagerProps {
  /**
   * The owner's full set — all 8, in stored order (`resolveModuleStates`).
   * Read once, at mount: while the manager is open it holds the arrangement,
   * and a re-render from the page (a refresh landing mid-edit) must not
   * overwrite rows the member is in the middle of moving.
   */
  modules: readonly AnigaModuleState[];
  presentation: ManagerPresentation;
  /**
   * Fired on every local change with the new arrangement, so the page can
   * re-render its modules before the server has heard about it — v7's "the
   * page already shows the new arrangement". Also fired when a refusal or a
   * "Tirtir" rolls the arrangement back, which is the half that matters: the
   * page must never keep showing an order the member has cancelled.
   */
  onChange?: (modules: AnigaModuleState[]) => void;
}

type SyncState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'queued' }
  | { kind: 'saved' }
  | { kind: 'error'; error: PlainError };

/**
 * Sub-labels for a flag-held row, keyed by module because the sentence names
 * what the platform decided. Metrics is the only flag-gated module today; a
 * second one gets its own copy rather than borrowing this one — a row with no
 * entry still carries the chip, which states the fact on its own.
 */
const LOCKED_SUB_KEYS: Partial<Record<AnigaModuleId, Record<ManagerPresentation, MessageKey>>> = {
  metrics: { sheet: 'profile.metricsManagerSub', rail: 'profile.metricsRailSub' },
};

/** The label a row wears. The manager is owner-only chrome, so it uses the
 *  owner's wording — and the 320px rail keeps the short one. */
function rowTitleKey(id: AnigaModuleId, presentation: ManagerPresentation): MessageKey {
  if (id === 'spaces') return 'profile.moduleSpacesOwn';
  if (id === 'skills' && presentation === 'sheet') return 'profile.managerRowSkills';
  return ANIGA_MODULE_TITLE_KEYS[id];
}

/**
 * What leaves for the server. Positions are renumbered from the array — the
 * array IS the order — and a flag-held module reports `visible: false`.
 *
 * That last part is a statement of fact, not a coercion of the owner's wish:
 * they were never offered the switch. Sending a stored `true` (reachable when
 * the flag flipped off AFTER a save that predated it) would 409 the whole
 * arrangement, and the member would be unable to reorder anything ever again.
 */
function toPayload(list: readonly AnigaModuleState[]) {
  return list.map((module, index) => ({
    moduleId: module.id,
    position: index + 1,
    visible: module.lockedByFlag ? false : module.visible,
  }));
}

function moveWithin(list: readonly AnigaModuleState[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  return next.map((module, index) =>
    module.position === index + 1 ? module : { ...module, position: index + 1 },
  );
}

function GripGlyph() {
  return (
    <svg
      className="xidig-amanager__grip"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

/** Open eye / struck-through eye — the same pair the module shell renders. */
function EyeGlyph({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {visible ? (
        <>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </>
      ) : (
        <path d="M4 4l16 16M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6 8.2A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5" />
      )}
    </svg>
  );
}

/** Clock — the shared offline-queue glyph (Codsi replies, showcase pins). */
function ClockGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8v4.4l2.8 1.7" />
    </svg>
  );
}

/** The three rules of the 10a trigger button. */
function ArrangeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function useArrangement(
  initial: readonly AnigaModuleState[],
  options: { commitOnChange: boolean; onChange?: (modules: AnigaModuleState[]) => void },
) {
  const { commitOnChange, onChange } = options;
  const [arrangement, setArrangement] = useState<AnigaModuleState[]>(() => [...initial]);
  const [sync, setSync] = useState<SyncState>({ kind: 'idle' });
  /** The last set the server acknowledged — where a refusal or Tirtir lands. */
  const confirmed = useRef<AnigaModuleState[]>([...initial]);
  /** A save that has not reached the server yet. */
  const pending = useRef<AnigaModuleState[] | null>(null);
  /**
   * Which save is current. The rail fires one per change, so two can overlap;
   * without this an early response landing late would repaint the rows as they
   * were BEFORE the member's latest move, while the server holds the later one.
   */
  const latestSave = useRef(0);
  const notify = useRef(onChange);
  useEffect(() => {
    notify.current = onChange;
  }, [onChange]);

  const settle = useCallback((next: AnigaModuleState[]) => {
    setArrangement(next);
    notify.current?.(next);
  }, []);

  const save = useCallback(
    async (next: AnigaModuleState[]) => {
      // Asking the network while it is known to be down would spend the retry
      // budget to learn what navigator already knows.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        pending.current = next;
        setSync({ kind: 'queued' });
        return;
      }
      const attempt = (latestSave.current += 1);
      setSync({ kind: 'saving' });
      try {
        const data = await apiPut<{ modules: AnigaModuleState[] }>('/api/me/profile/modules', {
          modules: toPayload(next),
        });
        if (attempt !== latestSave.current) return;
        // The route reads back rather than echoes, so its answer is what the
        // profile will actually render — adopt it instead of trusting `next`.
        pending.current = null;
        confirmed.current = data.modules;
        settle(data.modules);
        setSync({ kind: 'saved' });
      } catch (cause) {
        if (attempt !== latestSave.current) return;
        if (cause instanceof ApiRequestError) {
          // The server gave a verdict (409 module_flag_disabled among them).
          // Whatever it refused, the arrangement on screen is now a claim the
          // server has denied — roll back rather than leave it standing.
          pending.current = null;
          settle(confirmed.current);
          setSync({ kind: 'error', error: cause.plain });
          return;
        }
        // fetch itself threw: no verdict, so the write is not lost — it waits.
        pending.current = next;
        setSync({ kind: 'queued' });
      }
    },
    [settle],
  );

  // Flush on reconnect. Registered only while something is queued so a manager
  // sitting idle holds no window listener.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(() => {
    if (sync.kind !== 'queued') return;
    const flush = () => {
      const next = pending.current;
      if (next) void saveRef.current(next);
    };
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [sync.kind]);

  const apply = useCallback(
    (next: AnigaModuleState[]) => {
      settle(next);
      if (commitOnChange) {
        void save(next);
        return;
      }
      // Editing on top of a queued save replaces what will go out — one member,
      // one arrangement, so the newest set wins rather than stacking sends.
      if (pending.current !== null) {
        pending.current = next;
        return;
      }
      setSync({ kind: 'idle' });
    },
    [commitOnChange, save, settle],
  );

  return {
    arrangement,
    sync,
    move: (index: number, delta: -1 | 1) => apply(moveWithin(arrangement, index, index + delta)),
    dropAt: (from: number, to: number) => apply(moveWithin(arrangement, from, to)),
    toggle: (id: AnigaModuleId) =>
      apply(
        arrangement.map((module) =>
          module.id === id ? { ...module, visible: !module.visible } : module,
        ),
      ),
    commit: () => void save(arrangement),
    discardQueued: () => {
      pending.current = null;
      settle(confirmed.current);
      setSync({ kind: 'idle' });
    },
  };
}

function ModuleRows({
  arrangement,
  presentation,
  onMove,
  onDrop,
  onToggle,
}: {
  arrangement: readonly AnigaModuleState[];
  presentation: ManagerPresentation;
  onMove: (index: number, delta: -1 | 1) => void;
  onDrop: (from: number, to: number) => void;
  onToggle: (id: AnigaModuleId) => void;
}) {
  const t = useT();
  const idPrefix = useId();
  // Pointer drag is the enhancement: it adds a way to reorder, never the only
  // way. Nothing below reads this state except the row's own dragging class.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <ol className="xidig-amanager__rows">
      {arrangement.map((module, index) => {
        const label = t(rowTitleKey(module.id, presentation));
        const subKey = module.lockedByFlag ? LOCKED_SUB_KEYS[module.id]?.[presentation] : undefined;
        const rowClass = [
          'xidig-amanager__row',
          module.lockedByFlag ? 'xidig-amanager__row--locked' : '',
          dragIndex === index ? 'xidig-amanager__row--dragging' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li
            key={module.id}
            className={rowClass}
            data-module-row={module.id}
            draggable
            onDragStart={(dragEvent) => {
              setDragIndex(index);
              dragEvent.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(dragEvent) => {
              if (dragIndex !== null) dragEvent.preventDefault();
            }}
            onDrop={(dragEvent) => {
              dragEvent.preventDefault();
              if (dragIndex === null) return;
              onDrop(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <GripGlyph />
            <span className="xidig-amanager__text">
              <span className="xidig-amanager__label" id={`${idPrefix}-${module.id}`}>
                {label}
              </span>
              {subKey ? <span className="xidig-amanager__sub">{t(subKey)}</span> : null}
            </span>
            {module.lockedByFlag ? (
              <span className="xidig-tag xidig-amanager__flag">{t('profile.flagOff')}</span>
            ) : null}
            <span className="xidig-amanager__controls">
              <button
                type="button"
                className="xidig-icon-button xidig-amanager__move"
                aria-label={t('profile.managerMoveUp', { section: label })}
                disabled={index === 0}
                onClick={() => onMove(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="xidig-icon-button xidig-amanager__move"
                aria-label={t('profile.managerMoveDown', { section: label })}
                disabled={index === arrangement.length - 1}
                onClick={() => onMove(index, 1)}
              >
                ↓
              </button>
              {/* A flag-held module offers no switch at all. The platform owns
                  whether it publishes; the owner still owns where it sits, so
                  the move controls above stay live. */}
              {module.lockedByFlag ? null : (
                <button
                  type="button"
                  className="xidig-icon-button xidig-amanager__eye"
                  aria-pressed={module.visible}
                  aria-label={t(
                    module.visible ? 'profile.moduleShownAria' : 'profile.moduleHiddenAria',
                    { section: label },
                  )}
                  onClick={() => onToggle(module.id)}
                >
                  <EyeGlyph visible={module.visible} />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function ModuleManager({ modules, presentation, onChange }: ModuleManagerProps) {
  const t = useT();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const state = useArrangement(modules, {
    commitOnChange: presentation === 'rail',
    ...(onChange === undefined ? {} : { onChange }),
  });

  const rows = (
    <ModuleRows
      arrangement={state.arrangement}
      presentation={presentation}
      onMove={state.move}
      onDrop={state.dropAt}
      onToggle={state.toggle}
    />
  );

  // v7 — a chip, not a spinner. `saving` deliberately renders nothing: the
  // arrangement is already on screen, and a spinner over work that has already
  // been applied locally would be theatre.
  const status =
    state.sync.kind === 'queued' ? (
      <div className="xidig-amanager__queue" role="status">
        <span className="xidig-tag xidig-amanager__queue-chip">
          <ClockGlyph />
          {t('profile.managerQueuedTitle')}
        </span>
        <span className="xidig-amanager__queue-meta">
          {t('state.queuedNote')}{' '}
          <button
            type="button"
            className="xidig-amanager__queue-cancel"
            onClick={state.discardQueued}
          >
            {t('action.delete')}
          </button>
        </span>
        <span className="xidig-amanager__queue-note">{t('profile.managerQueuedNote')}</span>
      </div>
    ) : state.sync.kind === 'saved' ? (
      <p className="xidig-amanager__saved" role="status">
        {t('profile.managerSaved')}
      </p>
    ) : state.sync.kind === 'error' ? (
      // §27: the server's own sentence when it sent one (the 409 explains that
      // a platform flag holds the module), the manager's fallback when the
      // failure never produced an envelope.
      state.sync.error.message ? (
        <PlainErrorBanner error={state.sync.error} />
      ) : (
        <Banner kind="error">{t('profile.managerSaveFailed')}</Banner>
      )
    ) : null;

  if (presentation === 'rail') {
    return (
      <section className="xidig-amanager xidig-amanager--rail" aria-labelledby={titleId}>
        <div className="xidig-amanager__head">
          <h2 className="xidig-amanager__title" id={titleId}>
            {t('profile.managerTitle')}
          </h2>
          <span className="xidig-amanager__hint">{t('profile.managerSubtitle')}</span>
        </div>
        {rows}
        {status}
        <p className="xidig-amanager__note">{t('profile.managerInstantNote')}</p>
      </section>
    );
  }

  return (
    <>
      <button
        type="button"
        className="xidig-button xidig-button--secondary xidig-amanager__trigger"
        onClick={() => setOpen(true)}
      >
        <ArrangeGlyph />
        {t('profile.managerOpen')}
      </button>
      {/* The house Dialog owns the focus trap, the focus return and Escape —
          a hand-rolled sheet would have to re-earn all three. */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('profile.managerOpen')}
        presentation="sheet"
        panelClassName="xidig-amanager xidig-amanager--sheet"
      >
        <p className="xidig-amanager__hint">{t('profile.managerDragHint')}</p>
        {rows}
        {status}
        <button
          type="button"
          className="xidig-button xidig-button--primary xidig-amanager__save"
          disabled={state.sync.kind === 'saving'}
          onClick={state.commit}
        >
          {t('profile.managerSave')}
        </button>
        <p className="xidig-amanager__note">{t('profile.managerNote')}</p>
      </Dialog>
    </>
  );
}

export default ModuleManager;
