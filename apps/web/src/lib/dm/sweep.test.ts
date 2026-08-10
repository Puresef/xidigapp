import { describe, expect, it } from 'vitest';

import { requestExpiryAnchor } from './sweep';

/**
 * Review #3 — sweep timing must not be a decline oracle. The expiry anchor
 * is the last MESSAGE time (fallback: conversation creation); a decline —
 * which under the wire-hardened model doesn't even touch the row, but under
 * the legacy model bumped updated_at — can never move it. Twins (one
 * declined, one ignored, same message clock) age out at the same instant.
 */
describe('requestExpiryAnchor', () => {
  const created = '2026-07-01T10:00:00.000Z';
  const message = '2026-07-01T10:05:00.000Z';

  it('anchors on the last message when one exists', () => {
    expect(requestExpiryAnchor(created, message)).toBe(message);
  });

  it('falls back to conversation creation for message-less requests', () => {
    expect(requestExpiryAnchor(created, null)).toBe(created);
  });

  it('never anchors before creation (defensive against clock skew rows)', () => {
    expect(requestExpiryAnchor(created, '2026-06-30T09:00:00.000Z')).toBe(created);
  });

  it('declined and ignored twins share the same expiry instant', () => {
    // The declined twin's decline happened days later — irrelevant: only the
    // message clock counts, so both anchors are identical.
    const ignoredTwin = requestExpiryAnchor(created, message);
    const declinedTwin = requestExpiryAnchor(created, message);
    expect(declinedTwin).toBe(ignoredTwin);
  });
});
