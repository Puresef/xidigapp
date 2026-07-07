import {
  APPROVAL_THRESHOLD,
  QUORUM_FRACTION,
  QUORUM_MIN,
  VOTE_WINDOW_DAYS,
} from '@/lib/capital/constants';

/**
 * Supporter governance-vote tallying (§12/§17). PURE — no I/O. The raw ballots
 * live in candidate_votes; the API sums them (via candidate_vote_tally, a
 * SECURITY DEFINER count so individual ballots stay private, like Plaza polls)
 * and hands the counts here. The rule (Warya 7 Jul):
 *   quorum  = total ≥ QUORUM_MIN (5) OR total ≥ 20% of eligible Supporters
 *   approval= approve / (approve + reject), guarded against /0
 *   passed  = quorum met AND approval ≥ 60%
 * This is a non-binding SIGNAL — v1.0 has no execution flow attached to it.
 */

export interface VoteCounts {
  approve: number;
  reject: number;
  /** All ballots cast (may exceed approve+reject if abstentions are ever added). */
  total: number;
  /** Denominator for the 20% fractional quorum — the eligible Supporter pool. */
  eligibleSupporters: number;
}

export interface GovernanceTally {
  quorumMet: boolean;
  /** approve / (approve + reject); 0 when no decisive ballots were cast. */
  approvalRate: number;
  passed: boolean;
}

export function tallyGovernanceVote({
  approve,
  reject,
  total,
  eligibleSupporters,
}: VoteCounts): GovernanceTally {
  // The fractional branch only applies when there's a real eligible pool — with
  // eligibleSupporters === 0 the ceil is 0 and `total >= 0` would make quorum
  // trivially true on zero ballots, so a fixed floor (QUORUM_MIN) is the only way
  // to reach quorum then.
  const fractionalQuorum = Math.ceil(QUORUM_FRACTION * eligibleSupporters);
  const fractionalMet = eligibleSupporters > 0 && total >= fractionalQuorum;
  const quorumMet = total >= QUORUM_MIN || fractionalMet;

  const decisive = approve + reject;
  const approvalRate = decisive > 0 ? approve / decisive : 0;

  const passed = quorumMet && approvalRate >= APPROVAL_THRESHOLD;
  return { quorumMet, approvalRate, passed };
}

export interface VoteWindow {
  opensAt: Date;
  closesAt: Date;
  /** True while now is within [opensAt, closesAt). */
  isOpen: (now?: Date) => boolean;
}

const DAY_MS = 86_400_000;

/**
 * The 7-day Supporter vote window from an opened-at instant. `closesAt` is
 * exactly VOTE_WINDOW_DAYS later; the window is inclusive of the open instant
 * and exclusive of the close instant.
 */
export function voteWindow(openedAt: Date | string): VoteWindow {
  const opensAt = typeof openedAt === 'string' ? new Date(openedAt) : openedAt;
  const closesAt = new Date(opensAt.getTime() + VOTE_WINDOW_DAYS * DAY_MS);
  return {
    opensAt,
    closesAt,
    isOpen: (now: Date = new Date()) =>
      now.getTime() >= opensAt.getTime() && now.getTime() < closesAt.getTime(),
  };
}
