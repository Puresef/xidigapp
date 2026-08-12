import { ApiRequestError, apiPost } from '@/lib/api-client';

/**
 * Offline contribution queue (Maal state m5, frame 7c). A tiny localStorage
 * ledger of self-logged contributions that could not leave the device because
 * the device was OFFLINE — nothing else ever lands here. The logger island owns
 * the "queue only on a network failure while `!navigator.onLine`" rule (a
 * 4xx/5xx is an ANSWER and is surfaced, never queued); this module owns
 * storage, fan-out and the flush discipline. Modelled on
 * `lib/events/rsvp-queue.ts` — same contract, one deliberate difference below.
 *
 * Honesty rules encoded here:
 *
 *  - **`occurredAt` is the member's own statement of when the work happened**
 *    and it is what gets SENT. `queuedAt` only drives the chip's relative
 *    time. The frame says it in words ("Waqtiga dhabta ah ee aad gelisay ayaa
 *    la kaydinayaa, ma aha waqtiga dirista") and the code has to mean it: the
 *    flush replays the stored `occurredAt` verbatim and never re-stamps, so a
 *    log entered on Tuesday and sent on Thursday is Tuesday's work.
 *  - **No dedupe.** This is the one place the shape departs from the RSVP
 *    queue: an RSVP is a single current answer per event (re-queueing replaces
 *    it), while a contribution is an APPEND. Two logs against the same task are
 *    two real pieces of work, and collapsing them would silently delete one
 *    member's hours. Every entry therefore carries its own `id` and is removed
 *    by that id alone.
 *  - A replayed log can still come back with a definitive server answer
 *    (`ApiRequestError`, any status — a closed ledger on a demoted space, a
 *    deleted task). That entry is REMOVED and counted as `refused`, never
 *    retried, because the server already answered it. A true network failure
 *    (no answer at all) is counted as `kept` and stays queued for the next
 *    'online'.
 *  - Entries have a shelf life: at flush time an entry older than
 *    CONTRIBUTION_QUEUE_TTL_MS is dropped and counted as `expired`, never sent.
 *
 * SSR / storage-less runtimes degrade to a silent no-op: `list()` is `[]`,
 * mutations do nothing, nothing throws.
 */

export const CONTRIBUTION_QUEUE_KEY = 'xidig_maal_contribution_queue';

/**
 * Flush-time shelf life, deliberately longer than the RSVP queue's 24h. An
 * RSVP is last-write-wins and a stale one would overwrite a later choice, so
 * it expires fast. A contribution is an append: replaying it late is not a
 * conflict, it is simply late. What it must not do is surface out of nowhere
 * weeks after the member forgot they wrote it — the ledger is append-only, so
 * an unwanted append can only be undone by a reversal event that stays in the
 * history forever. A week is long enough to cover a genuinely offline stretch
 * and short enough that a replay is still recognisable to the person who wrote
 * it.
 */
export const CONTRIBUTION_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type QueuedContributionType = 'hours' | 'code' | 'design' | 'intro' | 'money';

export interface QueuedContribution {
  /** Per-entry identity. Two logs against one task are two entries. */
  id: string;
  /** The venture this belongs to — the queue is global, the POST is not. */
  labId: string;
  type: QueuedContributionType;
  quantity: number;
  taskId: string | null;
  note: string | null;
  /**
   * The TRUE moment the work happened, as the member stated it. Stored
   * verbatim, sent verbatim; the flush never re-stamps it.
   */
  occurredAt: string;
  /** What the chip calls this entry (task title, or the contribution type). */
  label: string;
  /** When the intent was parked — drives the chip's relative time only. */
  queuedAt: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function store(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate ?? null;
  } catch {
    // Some privacy modes throw on the mere property access.
    return null;
  }
}

function isEntry(item: unknown): item is QueuedContribution {
  if (typeof item !== 'object' || item === null) return false;
  const entry = item as QueuedContribution;
  return (
    typeof entry.id === 'string' &&
    typeof entry.labId === 'string' &&
    typeof entry.type === 'string' &&
    typeof entry.quantity === 'number' &&
    typeof entry.occurredAt === 'string' &&
    typeof entry.queuedAt === 'number'
  );
}

function read(): QueuedContribution[] {
  const storage = store();
  if (!storage) return [];
  try {
    const raw = storage.getItem(CONTRIBUTION_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}

function write(items: QueuedContribution[]): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.setItem(CONTRIBUTION_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota/disabled storage: the intent is lost, but the submit already
    // surfaced its own failure state — never throw from here.
  }
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** All pending logs, oldest first, true timestamps intact. */
export function list(): QueuedContribution[] {
  return read();
}

/** Only the logs waiting for one venture — what a board screen renders. */
export function listForLab(labId: string): QueuedContribution[] {
  return read().filter((entry) => entry.labId === labId);
}

/** Park one log. Appends — a contribution is never a replacement (see above). */
export function enqueue(item: QueuedContribution): void {
  write([...read(), item]);
}

/** Withdraw one pending log (the chip's Tirtir). */
export function remove(id: string): void {
  write(read().filter((existing) => existing.id !== id));
}

/** Change notifications for chips/badges. Returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface FlushResult {
  sent: number;
  /** Entries the server definitively answered (ApiRequestError) — removed, not retryable. */
  refused: number;
  /** Entries that hit a true network failure — still queued for the next 'online'. */
  kept: number;
  /** Entries older than CONTRIBUTION_QUEUE_TTL_MS — dropped at flush, never sent. */
  expired: number;
}

let inFlight: Promise<FlushResult> | null = null;

/**
 * Send every pending log through `send`, removing each entry as it succeeds
 * (so a mid-flush drop keeps only what truly did not go out). Concurrent
 * callers — every mounted board island listens for `window 'online'` — join the
 * one in-flight pass instead of double-appending, which on an append-only
 * ledger would be a duplicate row that can never be edited away.
 */
export function flush(send: (item: QueuedContribution) => Promise<void>): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let sent = 0;
    let refused = 0;
    let kept = 0;
    let expired = 0;
    const cutoff = Date.now() - CONTRIBUTION_QUEUE_TTL_MS;
    for (const item of read()) {
      if (item.queuedAt < cutoff) {
        remove(item.id);
        expired += 1;
        continue;
      }
      try {
        await send(item);
        remove(item.id);
        sent += 1;
      } catch (cause) {
        if (cause instanceof ApiRequestError) {
          remove(item.id);
          refused += 1;
        } else {
          kept += 1;
        }
      }
    }
    return { sent, refused, kept, expired };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * The app's own sender: replay each log against the contribution API exactly as
 * the submit would have (same endpoint, same body) — with `occurredAt` carrying
 * the member's true entry time rather than now.
 */
export function flushContributionQueue(): Promise<FlushResult> {
  return flush(async (item) => {
    await apiPost(`/api/labs/${item.labId}/contributions`, {
      type: item.type,
      quantity: item.quantity,
      taskId: item.taskId,
      note: item.note,
      occurredAt: item.occurredAt,
    });
  });
}
