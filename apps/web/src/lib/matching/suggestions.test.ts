import { describe, expect, it } from 'vitest';

import type { LabMatch } from './looking-for';
import {
  LAB_SUGGESTION_MAX,
  REASON_WEIGHTS,
  SUGGESTION_MAX,
  buildFollowSuggestions,
  buildLabSuggestions,
  buildPersonSuggestions,
  personReasons,
  type DeclaredFields,
  type PersonCandidate,
  type SuggestionExclusions,
} from './suggestions';

/**
 * Extras plan item 4 acceptance: deterministic given the same declared data,
 * every suggestion carries a correct reason, privacy exclusions hold, and
 * there is no filler (zero-reason candidates never appear).
 */

const me: DeclaredFields = {
  lanes: ['fintech', 'logistics'],
  skills: ['react', 'design'],
  city: 'Hargeisa',
  country: 'Somaliland',
  openTo: ['cofounding', 'hire_me'],
};

const none = new Set<string>();

function exclusions(overrides: Partial<SuggestionExclusions> = {}): SuggestionExclusions {
  return {
    viewerId: 'viewer',
    followedUserIds: none,
    blockedUserIds: none,
    mutedUserIds: none,
    ...overrides,
  };
}

function candidate(overrides: Partial<PersonCandidate> & { userId: string }): PersonCandidate {
  return {
    lanes: [],
    skills: [],
    city: null,
    country: null,
    openTo: [],
    isAi: false,
    accountStatus: 'active',
    discoverable: true,
    locationGranularity: 'city',
    ...overrides,
  };
}

function lab(overrides: Partial<LabMatch> & { labId: string }): LabMatch {
  return {
    slug: overrides.labId,
    name: overrides.labId,
    shortDescription: null,
    stage: 'active',
    matchedSkills: ['react'],
    score: 1,
    ...overrides,
  };
}

describe('personReasons — reason correctness', () => {
  it('names each shared lane and skill', () => {
    const reasons = personReasons(
      me,
      candidate({ userId: 'a', lanes: ['fintech', 'health'], skills: ['design'] }),
    );
    expect(reasons).toContainEqual({ kind: 'shares_lane', value: 'fintech' });
    expect(reasons).toContainEqual({ kind: 'shares_skill', value: 'design' });
    expect(reasons.some((r) => r.kind === 'shares_lane' && r.value === 'health')).toBe(false);
  });

  it('matches city case-insensitively and skips the country reason when the city matched', () => {
    const reasons = personReasons(
      me,
      candidate({ userId: 'a', city: '  hargeisa ', country: 'Somaliland' }),
    );
    expect(reasons).toContainEqual({ kind: 'same_city' });
    expect(reasons.some((r) => r.kind === 'same_country')).toBe(false);
  });

  it('falls back to same_country when only the country matches', () => {
    const reasons = personReasons(
      me,
      candidate({ userId: 'a', city: 'Burco', country: 'somaliland' }),
    );
    expect(reasons).toEqual([{ kind: 'same_country' }]);
  });

  it('respects location granularity: region/hidden members never match by city', () => {
    const region = personReasons(
      me,
      candidate({ userId: 'a', city: 'Hargeisa', country: 'Somaliland', locationGranularity: 'region' }),
    );
    expect(region.some((r) => r.kind === 'same_city')).toBe(false);
    expect(region).toContainEqual({ kind: 'same_country' });

    const hidden = personReasons(
      me,
      candidate({ userId: 'a', city: 'Hargeisa', country: 'Somaliland', locationGranularity: 'hidden' }),
    );
    expect(hidden.some((r) => r.kind === 'same_city' || r.kind === 'same_country')).toBe(false);
  });

  it('detects shared open-to chips and the hiring↔open-to-work complement', () => {
    // Viewer declared hire_me; candidate is hiring AND also open to cofounding.
    const reasons = personReasons(
      me,
      candidate({ userId: 'a', openTo: ['hiring', 'cofounding'] }),
    );
    expect(reasons).toContainEqual({ kind: 'they_hiring' });
    expect(reasons).toContainEqual({ kind: 'shares_open_to', value: 'cofounding' });
    expect(reasons.some((r) => r.kind === 'you_hiring')).toBe(false);

    // Reverse direction: viewer hiring, candidate hire_me.
    const reverse = personReasons(
      { ...me, openTo: ['hiring'] },
      candidate({ userId: 'a', openTo: ['hire_me'] }),
    );
    expect(reverse).toEqual([{ kind: 'you_hiring' }]);
  });

  it('an empty viewer profile yields no reasons at all (sparse-data honesty)', () => {
    const sparse: DeclaredFields = { lanes: [], skills: [], city: null, country: null, openTo: [] };
    const reasons = personReasons(
      sparse,
      candidate({ userId: 'a', lanes: ['fintech'], skills: ['react'], city: 'Hargeisa' }),
    );
    expect(reasons).toEqual([]);
  });
});

describe('buildPersonSuggestions — scoring, ordering, no filler', () => {
  it('score is exactly the sum of the visible reason weights', () => {
    const result = buildPersonSuggestions(
      me,
      [candidate({ userId: 'a', lanes: ['fintech'], skills: ['react'], city: 'Hargeisa' })],
      exclusions(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.reasons).toHaveLength(3);
    expect(result[0]?.score).toBe(
      REASON_WEIGHTS.shares_lane + REASON_WEIGHTS.shares_skill + REASON_WEIGHTS.same_city,
    );
  });

  it('drops zero-reason candidates instead of padding the list', () => {
    const result = buildPersonSuggestions(
      me,
      [
        candidate({ userId: 'stranger', lanes: ['health'], skills: ['welding'] }),
        candidate({ userId: 'match', lanes: ['fintech'] }),
      ],
      exclusions(),
    );
    expect(result.map((s) => s.candidate.userId)).toEqual(['match']);
  });

  it('is deterministic: shuffled input order returns the identical list', () => {
    const candidates = [
      candidate({ userId: 'c', lanes: ['fintech'] }),
      candidate({ userId: 'a', lanes: ['fintech'] }),
      candidate({ userId: 'b', lanes: ['fintech', 'logistics'] }),
      candidate({ userId: 'd', skills: ['react'], city: 'Hargeisa' }),
    ];
    const run = (input: PersonCandidate[]) =>
      buildPersonSuggestions(me, input, exclusions()).map((s) => ({
        id: s.candidate.userId,
        reasons: s.reasons,
        score: s.score,
      }));

    const forward = run(candidates);
    const reversed = run([...candidates].reverse());
    expect(reversed).toEqual(forward);
    // Equal scores tiebreak on userId ascending — stable, never popularity.
    expect(forward.map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('caps at the requested limit', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      candidate({ userId: `u${String(i).padStart(2, '0')}`, lanes: ['fintech'] }),
    );
    expect(buildPersonSuggestions(me, many, exclusions())).toHaveLength(SUGGESTION_MAX);
  });
});

describe('buildPersonSuggestions — privacy exclusions', () => {
  const matcher = { lanes: ['fintech'] };

  it('excludes the viewer, AI accounts, non-active accounts, and directory opt-outs', () => {
    const result = buildPersonSuggestions(
      me,
      [
        candidate({ userId: 'viewer', ...matcher }),
        candidate({ userId: 'ai', ...matcher, isAi: true }),
        candidate({ userId: 'suspended', ...matcher, accountStatus: 'suspended' }),
        candidate({ userId: 'deactivated', ...matcher, accountStatus: 'deactivated' }),
        candidate({ userId: 'optout', ...matcher, discoverable: false }),
        candidate({ userId: 'ok', ...matcher }),
      ],
      exclusions(),
    );
    expect(result.map((s) => s.candidate.userId)).toEqual(['ok']);
  });

  it('excludes followed, blocked (either direction), and muted members', () => {
    const result = buildPersonSuggestions(
      me,
      [
        candidate({ userId: 'followed', ...matcher }),
        candidate({ userId: 'blocked', ...matcher }),
        candidate({ userId: 'muted', ...matcher }),
        candidate({ userId: 'ok', ...matcher }),
      ],
      exclusions({
        followedUserIds: new Set(['followed']),
        blockedUserIds: new Set(['blocked']),
        mutedUserIds: new Set(['muted']),
      }),
    );
    expect(result.map((s) => s.candidate.userId)).toEqual(['ok']);
  });
});

describe('buildLabSuggestions', () => {
  it('drops muted Labs, re-ranks deterministically, and caps the Lab share', () => {
    const matches = [
      lab({ labId: 'lab-b', score: 2 }),
      lab({ labId: 'lab-a', score: 2 }),
      lab({ labId: 'lab-muted', score: 5 }),
      lab({ labId: 'lab-c', score: 1 }),
      lab({ labId: 'lab-d', score: 1 }),
    ];
    const result = buildLabSuggestions(matches, new Set(['lab-muted']));
    expect(result).toHaveLength(LAB_SUGGESTION_MAX);
    expect(result.map((m) => m.labId)).toEqual(['lab-a', 'lab-b', 'lab-c']);
  });
});

describe('buildFollowSuggestions — combined budget', () => {
  it('labs take at most their share; people fill the rest up to the total cap', () => {
    const people = Array.from({ length: 15 }, (_, i) =>
      candidate({ userId: `u${String(i).padStart(2, '0')}`, lanes: ['fintech'] }),
    );
    const labMatches = Array.from({ length: 5 }, (_, i) => lab({ labId: `lab-${i}` }));

    const result = buildFollowSuggestions(me, people, exclusions(), labMatches, none);
    expect(result.labs).toHaveLength(LAB_SUGGESTION_MAX);
    expect(result.people).toHaveLength(SUGGESTION_MAX - LAB_SUGGESTION_MAX);
  });

  it('returns empty lists (never filler) when nothing matches', () => {
    const result = buildFollowSuggestions(
      me,
      [candidate({ userId: 'stranger' })],
      exclusions(),
      [],
      none,
    );
    expect(result.people).toEqual([]);
    expect(result.labs).toEqual([]);
  });
});
