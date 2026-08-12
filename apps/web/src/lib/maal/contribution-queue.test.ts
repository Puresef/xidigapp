// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api-client';

import {
  CONTRIBUTION_QUEUE_KEY,
  CONTRIBUTION_QUEUE_TTL_MS,
  enqueue,
  flush,
  list,
  listForLab,
  remove,
  subscribe,
  type QueuedContribution,
} from './contribution-queue';

/**
 * Offline contribution queue (state m5). The rules the queue itself owns:
 *
 *  - **the true entry time is what gets SENT**: `occurredAt` is the member's
 *    statement of when the work happened and it survives the round trip
 *    verbatim, while `queuedAt` (the parking moment) only drives the chip's
 *    relative time. This is the headline test — the frame promises it in words
 *    and the code has to mean it;
 *  - **no dedupe**: two logs against the same task are two real pieces of work.
 *    The RSVP queue replaces same-slug intents; this one must not, because
 *    collapsing two appends deletes someone's hours;
 *  - flush is per-item forgiving: a failed send keeps ITS entry and the rest
 *    still go out;
 *  - a definitive server answer (ApiRequestError) removes the entry — an
 *    append-only ledger must never re-offer a log the server already refused;
 *  - entries have a shelf life: older than CONTRIBUTION_QUEUE_TTL_MS is dropped
 *    at flush and reported as `expired`, never sent;
 *  - storage-less runtimes (SSR, disabled localStorage) degrade to a no-op.
 *
 * The "queue ONLY while offline, never on a 4xx/5xx" rule is deliberately NOT
 * here — it belongs to the logger island (the queue cannot know why a send
 * failed), and lives in components/maal/contribution-logger.tsx.
 */

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const storage = new MemoryStorage();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// A minute ago — safely inside the flush TTL (a fixed epoch constant would
// silently age out of the window and turn every flush test into an expiry one).
const FRESH_QUEUED_AT = Date.now() - 60_000;

/** Tuesday morning: the moment the work happened, not the moment it sends. */
const TRUE_OCCURRED_AT = '2026-08-11T09:30:00.000Z';

const entry = (overrides: Partial<QueuedContribution> = {}): QueuedContribution => ({
  id: 'log-1',
  labId: '11111111-1111-4111-8111-111111111111',
  type: 'hours',
  quantity: 3,
  taskId: '22222222-2222-4222-8222-222222222222',
  note: null,
  occurredAt: TRUE_OCCURRED_AT,
  label: 'Isku xir Stripe Connect',
  queuedAt: FRESH_QUEUED_AT,
  ...overrides,
});

describe('enqueue / list / remove roundtrip', () => {
  it('stores under the locked key and returns entries with both timestamps intact', () => {
    enqueue(entry());
    enqueue(entry({ id: 'log-2', type: 'code', quantity: 1, queuedAt: 42 }));

    expect(localStorage.getItem(CONTRIBUTION_QUEUE_KEY)).not.toBeNull();
    const items = list();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'log-1',
      occurredAt: TRUE_OCCURRED_AT,
      queuedAt: FRESH_QUEUED_AT,
    });
    expect(items[1]).toMatchObject({ id: 'log-2', type: 'code', queuedAt: 42 });
  });

  it('APPENDS two logs against the same task — a contribution is never a replacement', () => {
    enqueue(entry({ id: 'log-1', quantity: 3 }));
    enqueue(entry({ id: 'log-2', quantity: 2 }));

    // Same labId, same taskId, same type: the RSVP queue would collapse these.
    // Here both are real work and both must survive.
    const items = list();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.quantity)).toEqual([3, 2]);
  });

  it('remove drops exactly the named entry', () => {
    enqueue(entry({ id: 'log-1' }));
    enqueue(entry({ id: 'log-2' }));

    remove('log-1');

    expect(list().map((item) => item.id)).toEqual(['log-2']);
  });

  it('listForLab scopes the chip to one venture', () => {
    enqueue(entry({ id: 'log-1', labId: 'lab-a' }));
    enqueue(entry({ id: 'log-2', labId: 'lab-b' }));

    expect(listForLab('lab-a').map((item) => item.id)).toEqual(['log-1']);
    expect(list()).toHaveLength(2);
  });
});

describe('subscribe', () => {
  it('notifies on every mutation and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    enqueue(entry());
    remove('log-1');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    enqueue(entry());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('flush', () => {
  it('sends the TRUE entry time, not the send time', async () => {
    enqueue(entry());
    const send = vi.fn().mockResolvedValue(undefined);

    await flush(send);

    const sentItem = send.mock.calls[0]![0] as QueuedContribution;
    expect(sentItem.occurredAt).toBe(TRUE_OCCURRED_AT);
    // The parking moment travels along for the chip, but it is not the claim.
    expect(sentItem.occurredAt).not.toBe(new Date(sentItem.queuedAt).toISOString());
  });

  it('sends every entry and clears the queue on success', async () => {
    enqueue(entry({ id: 'log-1' }));
    enqueue(entry({ id: 'log-2' }));
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await flush(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, refused: 0, kept: 0, expired: 0 });
    expect(list()).toHaveLength(0);
  });

  it('keeps an entry that hit a true network failure, still sends the rest, and reports the split', async () => {
    enqueue(entry({ id: 'log-1' }));
    enqueue(entry({ id: 'log-2' }));
    const send = vi.fn((item: QueuedContribution) =>
      item.id === 'log-1' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(),
    );

    const result = await flush(send);

    expect(result).toEqual({ sent: 1, refused: 0, kept: 1, expired: 0 });
    expect(list().map((item) => item.id)).toEqual(['log-1']);
  });

  it('removes a log the server definitively refused and reports it as refused, not retryable', async () => {
    enqueue(entry());
    // e.g. error.ledgerLocked — the space is a Warshad again and takes no entries.
    const refusal = new ApiRequestError({ code: 'forbidden', message: 'Diiwaanku waa xiran' });
    const send = vi.fn().mockRejectedValue(refusal);

    const result = await flush(send);

    expect(result).toEqual({ sent: 0, refused: 1, kept: 0, expired: 0 });
    expect(list()).toHaveLength(0);
  });

  it('drops a log older than the TTL unsent and reports it as expired', async () => {
    enqueue(entry({ id: 'stale', queuedAt: Date.now() - CONTRIBUTION_QUEUE_TTL_MS - 1_000 }));
    enqueue(entry({ id: 'fresh' }));
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await flush(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as QueuedContribution).id).toBe('fresh');
    expect(result).toEqual({ sent: 1, refused: 0, kept: 0, expired: 1 });
    expect(list()).toHaveLength(0);
  });

  it('is re-entrant safe: a concurrent call joins the in-flight flush', async () => {
    enqueue(entry());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const send = vi.fn(() => gate);

    const first = flush(send);
    const second = flush(send);
    release();
    const [a, b] = await Promise.all([first, second]);

    // One send for one entry — a double-send on an append-only ledger is a
    // duplicate row that can only ever be corrected by a reversal.
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ sent: 1, refused: 0, kept: 0, expired: 0 });
    expect(b).toEqual(a);
  });
});

describe('storage-less runtimes degrade to a no-op', () => {
  it('list returns [] and enqueue/remove never throw without localStorage', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', undefined);

    expect(() => enqueue(entry())).not.toThrow();
    expect(() => remove('log-1')).not.toThrow();
    expect(list()).toEqual([]);
  });
});
