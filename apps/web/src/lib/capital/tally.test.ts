import { describe, expect, it } from 'vitest';

import { VOTE_WINDOW_DAYS } from './constants';
import { tallyGovernanceVote, voteWindow } from './tally';

/**
 * Pure governance-vote math (§12/§17). Boundaries matter: quorum is exactly 5 or
 * 20% of eligible; approval passes at exactly 60%; the /0 guard on an empty vote.
 */

describe('tallyGovernanceVote', () => {
  it('meets quorum at exactly 5 total votes regardless of eligible pool', () => {
    const t = tallyGovernanceVote({ approve: 5, reject: 0, total: 5, eligibleSupporters: 1000 });
    expect(t.quorumMet).toBe(true);
  });

  it('does NOT meet quorum at 4 total when 20% is higher', () => {
    const t = tallyGovernanceVote({ approve: 4, reject: 0, total: 4, eligibleSupporters: 1000 });
    expect(t.quorumMet).toBe(false);
  });

  it('meets quorum via the 20% fraction below 5 when the pool is tiny', () => {
    // 20% of 10 = 2 → 2 votes clears fractional quorum even though < 5.
    const t = tallyGovernanceVote({ approve: 2, reject: 0, total: 2, eligibleSupporters: 10 });
    expect(t.quorumMet).toBe(true);
  });

  it('uses ceil on the fractional quorum (20% of 11 = 2.2 → needs 3)', () => {
    expect(
      tallyGovernanceVote({ approve: 2, reject: 0, total: 2, eligibleSupporters: 11 }).quorumMet,
    ).toBe(false);
    expect(
      tallyGovernanceVote({ approve: 3, reject: 0, total: 3, eligibleSupporters: 11 }).quorumMet,
    ).toBe(true);
  });

  it('computes approvalRate as approve/(approve+reject)', () => {
    const t = tallyGovernanceVote({ approve: 3, reject: 1, total: 4, eligibleSupporters: 4 });
    expect(t.approvalRate).toBeCloseTo(0.75);
  });

  it('passes at exactly the 60% approval boundary with quorum met', () => {
    // 3 approve / 5 decisive = 0.6 exactly; total 5 clears quorum.
    const t = tallyGovernanceVote({ approve: 3, reject: 2, total: 5, eligibleSupporters: 100 });
    expect(t.approvalRate).toBeCloseTo(0.6);
    expect(t.passed).toBe(true);
  });

  it('fails just below 60% approval even with quorum met', () => {
    // 5 approve / 9 decisive ≈ 0.5556 < 0.6.
    const t = tallyGovernanceVote({ approve: 5, reject: 4, total: 9, eligibleSupporters: 10 });
    expect(t.passed).toBe(false);
  });

  it('does not pass when approval is high but quorum is not met', () => {
    const t = tallyGovernanceVote({ approve: 3, reject: 0, total: 3, eligibleSupporters: 1000 });
    expect(t.approvalRate).toBe(1);
    expect(t.quorumMet).toBe(false);
    expect(t.passed).toBe(false);
  });

  it('guards division by zero on an empty vote (approvalRate 0, not NaN)', () => {
    const t = tallyGovernanceVote({ approve: 0, reject: 0, total: 0, eligibleSupporters: 0 });
    expect(t.approvalRate).toBe(0);
    expect(Number.isNaN(t.approvalRate)).toBe(false);
    // An empty eligible pool must NOT make quorum trivially true: the fractional
    // branch is disabled when eligibleSupporters is 0, so quorum needs QUORUM_MIN.
    expect(t.quorumMet).toBe(false);
    expect(t.passed).toBe(false);
  });
});

describe('voteWindow', () => {
  const opened = new Date('2026-07-07T00:00:00.000Z');

  it('closes exactly VOTE_WINDOW_DAYS after it opens', () => {
    const w = voteWindow(opened);
    const expectedClose = new Date(opened.getTime() + VOTE_WINDOW_DAYS * 86_400_000);
    expect(w.closesAt.toISOString()).toBe(expectedClose.toISOString());
  });

  it('accepts an ISO string for openedAt', () => {
    const w = voteWindow(opened.toISOString());
    expect(w.opensAt.toISOString()).toBe(opened.toISOString());
  });

  it('is open at the open instant (inclusive)', () => {
    expect(voteWindow(opened).isOpen(opened)).toBe(true);
  });

  it('is open partway through the window', () => {
    const mid = new Date(opened.getTime() + 3 * 86_400_000);
    expect(voteWindow(opened).isOpen(mid)).toBe(true);
  });

  it('is closed at the close instant (exclusive) and after', () => {
    const w = voteWindow(opened);
    expect(w.isOpen(w.closesAt)).toBe(false);
    expect(w.isOpen(new Date(w.closesAt.getTime() + 1000))).toBe(false);
  });

  it('is closed before it opens', () => {
    const before = new Date(opened.getTime() - 1000);
    expect(voteWindow(opened).isOpen(before)).toBe(false);
  });
});
