import { describe, expect, it } from 'vitest';

import { toInterestCounts } from './interest-counts';

/**
 * Packet B follow-up — the client-bound candidate counts carry help + Show
 * support only. The legacy invest tally (rows retained under Q2) is not part
 * of any approved capital flow, so the one projection drops it by
 * construction, whatever the RPC returns.
 */
describe('toInterestCounts', () => {
  it('drops the invest tally from the RPC row', () => {
    const counts = toInterestCounts([{ help: 3, cosign: 5, invest: 1 }]);
    expect(counts).toEqual({ help: 3, cosign: 5 });
    expect('invest' in counts).toBe(false);
    expect(JSON.stringify(counts)).not.toMatch(/invest/);
  });

  it('accepts a single-row object as well as an array', () => {
    expect(toInterestCounts({ help: 1, cosign: 2, invest: 9 })).toEqual({ help: 1, cosign: 2 });
  });

  it('reads an empty result as zeros', () => {
    expect(toInterestCounts([])).toEqual({ help: 0, cosign: 0 });
    expect(toInterestCounts(null)).toEqual({ help: 0, cosign: 0 });
  });
});
