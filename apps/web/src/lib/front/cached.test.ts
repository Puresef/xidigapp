import { describe, expect, it } from 'vitest';

import { withDeadline } from './cached';

/**
 * Fail-fast contract for the front-door reads (standard §2-E25/E26; the plan's
 * resilience rule): a warm request must never wait on a stalled DB. These test
 * the deadline race in isolation — the streamed reads degrade to the absent
 * state (null) within the deadline and never surface an unhandled rejection.
 */
describe('withDeadline', () => {
  it('returns the resolved value when it settles before the deadline', async () => {
    const fast = Promise.resolve(42);
    await expect(withDeadline(fast, null, 50)).resolves.toBe(42);
  });

  it('degrades to the fallback when the promise outlives the deadline', async () => {
    // A promise that never settles — the deadline is the only way out.
    const never = new Promise<number>(() => {});
    const started = Date.now();
    await expect(withDeadline(never, null, 30)).resolves.toBeNull();
    // Resolved via the deadline, not by hanging.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('degrades to the fallback when the promise rejects (no unhandled rejection)', async () => {
    const boom = Promise.reject(new Error('db unreachable'));
    await expect(withDeadline(boom, null, 50)).resolves.toBeNull();
    // Give the swallowed rejection a tick to prove it does not surface.
    await new Promise((r) => setTimeout(r, 10));
  });

  it('does not let a slow rejection override an already-returned fallback', async () => {
    let rejectLate: (e: unknown) => void = () => {};
    const late = new Promise<number>((_, reject) => {
      rejectLate = reject;
    });
    const result = withDeadline(late, null, 20);
    await expect(result).resolves.toBeNull();
    // Reject after the deadline already resolved — must not throw.
    rejectLate(new Error('late failure'));
    await new Promise((r) => setTimeout(r, 10));
  });
});
