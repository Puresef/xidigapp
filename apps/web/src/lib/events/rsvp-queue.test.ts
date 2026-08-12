// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@/lib/api-client';

import {
  RSVP_QUEUE_KEY,
  RSVP_QUEUE_TTL_MS,
  enqueue,
  flush,
  list,
  remove,
  subscribe,
  type QueuedRsvp,
} from './rsvp-queue';

/**
 * Offline RSVP queue (frame e3). The rules the queue itself owns:
 *
 *  - true timestamps: `queuedAt` is stored as given and comes back as given —
 *    the chip renders the REAL moment of intent, never a re-stamped one;
 *  - one pending intent per event: re-queueing a slug replaces the earlier
 *    entry (the member's latest word wins, no contradictory pair ever flushes);
 *  - flush is per-item forgiving: a failed send keeps ITS entry and the rest
 *    still go out — an airplane-mode blip must not wedge the whole queue;
 *  - intents have a shelf life: an entry older than RSVP_QUEUE_TTL_MS is
 *    dropped at flush time and reported as `expired`, never sent — a stale
 *    intent must not replay last-write-wins over choices made on other
 *    devices;
 *  - storage-less runtimes (SSR, disabled localStorage) degrade to a no-op,
 *    never a throw.
 *
 * The "queue ONLY while offline, never on a 4xx/5xx" rule is deliberately NOT
 * here — it belongs to the RSVP island (the queue cannot know why a send
 * failed), and lives in rsvp-buttons.tsx.
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

// A minute ago — verbatim-storable like any timestamp, but safely inside the
// flush TTL (a fixed epoch constant would silently age out of the window and
// turn every flush test into an expiry test).
const FRESH_QUEUED_AT = Date.now() - 60_000;

const entry = (overrides: Partial<QueuedRsvp> = {}): QueuedRsvp => ({
  slug: 'shir-london',
  action: 'rsvp',
  status: 'going',
  showPublicly: true,
  queuedAt: FRESH_QUEUED_AT,
  ...overrides,
});

describe('enqueue / list / remove roundtrip', () => {
  it('stores under the locked key and returns entries with their true queuedAt', () => {
    enqueue(entry());
    enqueue(entry({ slug: 'aqoon-canshuur', action: 'unrsvp', status: null, queuedAt: 42 }));

    expect(localStorage.getItem(RSVP_QUEUE_KEY)).not.toBeNull();
    const items = list();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ slug: 'shir-london', queuedAt: FRESH_QUEUED_AT });
    expect(items[1]).toMatchObject({ slug: 'aqoon-canshuur', action: 'unrsvp', queuedAt: 42 });
  });

  it('replaces an earlier intent for the same event — the latest word wins', () => {
    enqueue(entry({ action: 'rsvp', queuedAt: 100 }));
    enqueue(entry({ action: 'unrsvp', status: null, queuedAt: 200 }));

    const items = list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: 'unrsvp', queuedAt: 200 });
  });

  it('remove drops exactly the named slug', () => {
    enqueue(entry());
    enqueue(entry({ slug: 'aqoon-canshuur' }));

    remove('shir-london');

    expect(list().map((i) => i.slug)).toEqual(['aqoon-canshuur']);
  });
});

describe('subscribe', () => {
  it('notifies on every mutation and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    enqueue(entry());
    remove('shir-london');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    enqueue(entry());
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('flush', () => {
  it('sends every entry and clears the queue on success', async () => {
    enqueue(entry());
    enqueue(entry({ slug: 'aqoon-canshuur', action: 'unrsvp', status: null }));
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await flush(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, refused: 0, kept: 0, expired: 0 });
    expect(list()).toHaveLength(0);
  });

  it('keeps an entry that hit a true network failure, still sends the rest, and reports the split', async () => {
    enqueue(entry());
    enqueue(entry({ slug: 'aqoon-canshuur' }));
    const send = vi.fn((item: QueuedRsvp) =>
      item.slug === 'shir-london'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(),
    );

    const result = await flush(send);

    expect(result).toEqual({ sent: 1, refused: 0, kept: 1, expired: 0 });
    expect(list().map((i) => i.slug)).toEqual(['shir-london']);
  });

  it('removes an entry the server definitively refused (ApiRequestError) and reports it as refused, not retryable', async () => {
    enqueue(entry());
    const refusal = new ApiRequestError({ code: 'server_error', message: 'Boos ma banna' });
    const send = vi.fn().mockRejectedValue(refusal);

    const result = await flush(send);

    expect(result).toEqual({ sent: 0, refused: 1, kept: 0, expired: 0 });
    // A refused entry must not linger claiming it will still flush.
    expect(list()).toHaveLength(0);
  });

  it('a true network failure (no server answer at all) keeps the entry queued for the next online', async () => {
    enqueue(entry());
    const send = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await flush(send);

    expect(result).toEqual({ sent: 0, refused: 0, kept: 1, expired: 0 });
    expect(list()).toHaveLength(1);
    expect(list()[0]).toMatchObject({ slug: 'shir-london' });
  });

  it('drops an intent older than the TTL unsent and reports it as expired', async () => {
    enqueue(entry({ queuedAt: Date.now() - RSVP_QUEUE_TTL_MS - 1_000 }));
    enqueue(entry({ slug: 'aqoon-canshuur' }));
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await flush(send);

    // The stale intent never reaches the server — only the fresh one goes out.
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as QueuedRsvp).slug).toBe('aqoon-canshuur');
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

    // One send for one entry — the second call must not double-send.
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ sent: 1, refused: 0, kept: 0, expired: 0 });
    expect(b).toEqual(a);
  });
});

describe('storage-less runtimes degrade to a no-op', () => {
  it('list returns [] and enqueue/remove never throw without localStorage', () => {
    vi.unstubAllGlobals();
    // Node has no localStorage global in this environment by default; if the
    // runtime ever grows one, stub it away so the degraded path stays tested.
    vi.stubGlobal('localStorage', undefined);

    expect(() => enqueue(entry())).not.toThrow();
    expect(() => remove('shir-london')).not.toThrow();
    expect(list()).toEqual([]);
  });
});
