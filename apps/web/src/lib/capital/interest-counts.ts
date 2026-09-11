/**
 * The candidate interest counts a client may see — "I can help" and Show
 * support (Garab, interest_type 'cosign'). Nothing else.
 *
 * `candidate_interest_counts()` also tallies legacy `invest` intents recorded
 * while the old funnel was live. Investing is not offered (A2), so that number
 * is not part of any approved flow and must not leave the server: this is the
 * ONE projection both the interests API and the /c/[id] page use, and it drops
 * the invest tally by construction. The rows themselves are retained untouched
 * (retention is the separate Q2 ruling) — this is projection truthfulness only.
 */
export interface InterestCounts {
  help: number;
  cosign: number;
}

/** Raw row shape of candidate_interest_counts(). */
interface InterestCountsRow {
  help?: number | null;
  cosign?: number | null;
  invest?: number | null;
}

export function toInterestCounts(data: unknown): InterestCounts {
  const row = (Array.isArray(data) ? data[0] : data) as InterestCountsRow | null | undefined;
  return { help: row?.help ?? 0, cosign: row?.cosign ?? 0 };
}
