import { ApiRequestError, apiDelete, apiPut } from '@/lib/api-client';

/**
 * Offline RSVP queue (Munaasabado dispatch, frame e3). A tiny localStorage
 * ledger of RSVP intents that could not leave the device because the device
 * was OFFLINE — nothing else ever lands here. The RSVP island owns the "queue
 * only on a network failure while `!navigator.onLine`" rule (a 4xx/5xx is an
 * ANSWER and is surfaced, never queued); this module owns storage, dedupe,
 * fan-out and the flush discipline.
 *
 * Honesty rules encoded here:
 *
 *  - `queuedAt` is the TRUE moment of intent — stored verbatim, returned
 *    verbatim, rendered via `formatRelativeTime`; the flush never re-stamps;
 *  - one pending intent per event: re-queueing a slug replaces the earlier
 *    entry, so a contradictory rsvp/unrsvp pair can never both flush;
 *  - flush is per-item forgiving and re-entrant safe (concurrent callers —
 *    every mounted island listens for `window 'online'` — join one in-flight
 *    pass instead of double-sending);
 *  - a replayed intent can still come back with a definitive server answer
 *    (`ApiRequestError`, any status) — that entry is REMOVED and counted as
 *    `refused`, never retried, because the server already answered it. A true
 *    network failure (no answer at all) is counted as `kept` and stays
 *    queued for the next 'online'. Removal always matches the exact entry
 *    (slug + queuedAt), so a replacement intent enqueued mid-flush is never
 *    deleted by its predecessor's cleanup;
 *  - intents have a shelf life: at flush time an entry older than
 *    RSVP_QUEUE_TTL_MS is dropped and counted as `expired`, never sent.
 *
 * SSR / storage-less runtimes degrade to a silent no-op: `list()` is `[]`,
 * mutations do nothing, nothing throws.
 */

export const RSVP_QUEUE_KEY = 'xidig_event_rsvp_queue';

/**
 * Flush-time shelf life. A stale intent must not replay last-write-wins over
 * choices the member has since made on other devices — a day-old parked RSVP
 * silently overwriting yesterday's deliberate un-RSVP from their phone would
 * be dishonest. Older entries are dropped at flush and reported as `expired`.
 */
export const RSVP_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;

export interface QueuedRsvp {
  slug: string;
  action: 'rsvp' | 'unrsvp';
  /** RSVP status the member intended; null for an un-RSVP. */
  status: 'going' | 'interested' | null;
  /** Preserved so a flush sends what the member actually chose. */
  showPublicly: boolean;
  /** True timestamp of the intent (Date.now() at tap time) — never re-stamped. */
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

function read(): QueuedRsvp[] {
  const storage = store();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RSVP_QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueuedRsvp =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as QueuedRsvp).slug === 'string' &&
        ((item as QueuedRsvp).action === 'rsvp' || (item as QueuedRsvp).action === 'unrsvp') &&
        typeof (item as QueuedRsvp).queuedAt === 'number',
    );
  } catch {
    return [];
  }
}

function write(items: QueuedRsvp[]): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.setItem(RSVP_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota/disabled storage: the intent is lost, but the tap already
    // surfaced its own failure state — never throw from here.
  }
  notify();
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** All pending intents, oldest first, true timestamps intact. */
export function list(): QueuedRsvp[] {
  return read();
}

/** Queue an intent; an earlier entry for the same event is replaced. */
export function enqueue(item: QueuedRsvp): void {
  const rest = read().filter((existing) => existing.slug !== item.slug);
  write([...rest, item]);
}

/** Withdraw the pending intent for one event (the chip's Tirtir). */
export function remove(slug: string): void {
  write(read().filter((existing) => existing.slug !== slug));
}

/**
 * Withdraw exactly one entry (slug + its true queuedAt), never a same-slug
 * successor that replaced it after this entry was already read for sending.
 */
function removeExact(slug: string, queuedAt: number): void {
  write(read().filter((existing) => !(existing.slug === slug && existing.queuedAt === queuedAt)));
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
  /** Entries older than RSVP_QUEUE_TTL_MS — dropped at flush, never sent. */
  expired: number;
}

let inFlight: Promise<FlushResult> | null = null;

/**
 * Send every pending intent through `send`, removing each entry as it
 * succeeds (so a mid-flush drop keeps only what truly did not go out). An
 * entry the server definitively answered (`ApiRequestError`) is also
 * removed — it is `refused`, not retryable, and must not keep claiming it
 * will "leave when the internet returns". An entry older than
 * RSVP_QUEUE_TTL_MS is dropped unsent and counted as `expired` (stale intents
 * must not replay last-write-wins over choices made on other devices). Only a
 * true network failure (no answer at all) is `kept`, queued for the next
 * 'online'. Concurrent calls join the in-flight pass.
 */
export function flush(send: (item: QueuedRsvp) => Promise<void>): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let sent = 0;
    let refused = 0;
    let kept = 0;
    let expired = 0;
    const cutoff = Date.now() - RSVP_QUEUE_TTL_MS;
    for (const item of read()) {
      if (item.queuedAt < cutoff) {
        removeExact(item.slug, item.queuedAt);
        expired += 1;
        continue;
      }
      try {
        await send(item);
        removeExact(item.slug, item.queuedAt);
        sent += 1;
      } catch (cause) {
        if (cause instanceof ApiRequestError) {
          removeExact(item.slug, item.queuedAt);
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
 * The app's own sender: replay each intent against the RSVP API exactly as
 * the tap would have (same endpoint, same body). Callers refresh the router
 * themselves when `sent > 0`.
 */
export function flushRsvpQueue(): Promise<FlushResult> {
  return flush(async (item) => {
    if (item.action === 'rsvp') {
      await apiPut(`/api/events/${item.slug}/rsvp`, {
        status: item.status ?? 'going',
        showPublicly: item.showPublicly,
      });
    } else {
      await apiDelete(`/api/events/${item.slug}/rsvp`);
    }
  });
}
