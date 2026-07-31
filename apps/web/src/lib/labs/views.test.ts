import { describe, expect, it } from 'vitest';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { DORMANCY_DAYS } from './constants';
import {
  computeDormant,
  daysUntil,
  hydrateLabs,
  isCharterComplete,
  MEMBER_PREVIEW_LIMIT,
  type LabRow,
} from './views';

/** Pure Labs helpers (charter gate, sprint countdown, dormancy math). */

describe('isCharterComplete', () => {
  it('is true only when all three charter fields are present', () => {
    expect(
      isCharterComplete({ problem_statement: 'p', hypothesis: 'h', success_definition: 's' }),
    ).toBe(true);
  });

  it('is false when any charter field is missing', () => {
    expect(
      isCharterComplete({ problem_statement: 'p', hypothesis: 'h', success_definition: null }),
    ).toBe(false);
    expect(
      isCharterComplete({ problem_statement: null, hypothesis: null, success_definition: null }),
    ).toBe(false);
  });
});

describe('daysUntil', () => {
  const now = Date.UTC(2026, 6, 6, 0, 0, 0); // 2026-07-06

  it('returns null for no deadline', () => {
    expect(daysUntil(null, now)).toBeNull();
  });

  it('counts whole days to a future deadline', () => {
    const inEightDays = new Date(now + 8 * 86_400_000).toISOString();
    expect(daysUntil(inEightDays, now)).toBe(8);
  });

  it('goes negative once the deadline has passed', () => {
    const twoDaysAgo = new Date(now - 2 * 86_400_000).toISOString();
    expect(daysUntil(twoDaysAgo, now)).toBeLessThan(0);
  });
});

describe('computeDormant', () => {
  const now = Date.UTC(2026, 6, 6, 0, 0, 0);

  it('is dormant when dormant_since is set', () => {
    expect(
      computeDormant({ dormant_since: '2026-07-01T00:00:00Z', last_activity_at: '2026-07-05T00:00:00Z' }, now),
    ).toBe(true);
  });

  it('is not dormant with recent activity', () => {
    const recent = new Date(now - 3 * 86_400_000).toISOString();
    expect(computeDormant({ dormant_since: null, last_activity_at: recent }, now)).toBe(false);
  });

  it('is dormant past the idle threshold even before the sweep flags it', () => {
    const stale = new Date(now - (DORMANCY_DAYS + 2) * 86_400_000).toISOString();
    expect(computeDormant({ dormant_since: null, last_activity_at: stale }, now)).toBe(true);
  });
});

// --- hydrateLabs facepile gate ----------------------------------------------

/**
 * hydrateLabs runs on the SERVICE ROLE (RLS bypassed), so the §16
 * member_list_visibility gate lives in JS: the fake below records every
 * query so the tests can prove both the returned view model AND that hidden
 * roster ids never even enter the profile batch. Directory rule is stricter
 * than can_read_lab_roster on purpose: 'public' always shows the facepile,
 * 'members' only to the lead / an active member, 'private' never (count-only).
 */

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[]; error: null }> {
  readonly recorded: Array<{ op: string; args: unknown[] }> = [];
  constructor(private readonly rows: Row[]) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }

  select(columns: string) {
    return this.chain('select', [columns]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  in(column: string, values: unknown[]) {
    return this.chain('in', [column, values]);
  }
  is(column: string, value: unknown) {
    return this.chain('is', [column, value]);
  }
  order(column: string, options?: unknown) {
    return this.chain('order', [column, options]);
  }

  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }

  then<TResult1, TResult2>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeAdmin {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Row[][]>) {}

  from(table: string): FakeQuery {
    const rows = this.seeds[table]?.shift() ?? [];
    const query = new FakeQuery(rows);
    this.calls.push({ table, query });
    return query;
  }

  queryFor(table: string, nth = 0): FakeQuery {
    const hit = this.calls.filter((call) => call.table === table)[nth];
    if (!hit) throw new Error(`no query #${nth} recorded for table ${table}`);
    return hit.query;
  }
  queryCount(table: string): number {
    return this.calls.filter((call) => call.table === table).length;
  }

  asClient(): SupabaseClient<Database> {
    return this as unknown as SupabaseClient<Database>;
  }
}

const VIEWER = 'viewer-1';
const LEAD = 'lead-1';

function labRow(overrides: Partial<LabRow> = {}): LabRow {
  return {
    id: 'lab-1',
    name: 'Xawilaad Sandbox',
    slug: 'xawilaad-sandbox',
    space_mode: 'lab',
    source: 'member',
    short_description: 'Testing remittance flows',
    problem_statement: null,
    hypothesis: null,
    sprint_length_weeks: null,
    sprint_deadline: null,
    success_definition: null,
    charter_completed_at: null,
    promoted_at: null,
    stage: 'building',
    visibility: 'members',
    is_listed: true,
    is_supporter_only: false,
    member_list_visibility: 'public',
    join_mode: 'open',
    lead_user_id: LEAD,
    last_activity_at: '2026-07-30T00:00:00Z',
    dormant_since: null,
    icon_path: null,
    icon_blurhash: null,
    cover_path: null,
    cover_blurhash: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-30T00:00:00Z',
    ...overrides,
  } as LabRow;
}

function memberRows(labId: string, userIds: string[]): Row[] {
  return userIds.map((id) => ({ lab_id: labId, user_id: id, role: 'member' }));
}

function profileRows(userIds: string[]): Row[] {
  return userIds.map((id) => ({
    user_id: id,
    display_name: `Name ${id}`,
    handle: `h-${id}`,
    avatar_path: null,
    avatar_blurhash: null,
  }));
}

function seedsFor(roster: Row[], mine: Row[], profiles: Row[]): Record<string, Row[][]> {
  // hydrateLabs query order per table: lab_members = [roster, viewer rows].
  return {
    lab_members: [roster, mine],
    lab_tags: [[]],
    lab_skill_needs: [[]],
    profiles: [profiles],
  };
}

describe('hydrateLabs — facepile visibility gate (§16 member_list_visibility)', () => {
  it('public roster: memberPreview carries the first members in join order, capped', async () => {
    const roster = memberRows('lab-1', ['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
    const admin = new FakeAdmin(
      seedsFor(roster, [], profileRows([LEAD, 'u1', 'u2', 'u3', 'u4'])),
    );

    const [view] = await hydrateLabs(admin.asClient(), VIEWER, [
      labRow({ member_list_visibility: 'public' }),
    ]);

    expect(view?.memberCount).toBe(6);
    expect(view?.memberPreview.map((m) => m.user_id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(view?.memberPreview.length).toBe(MEMBER_PREVIEW_LIMIT);
    // Join order comes from the DB: the roster query must be joined_at ASC.
    expect(admin.queryFor('lab_members').argsOf('order')).toEqual([
      'joined_at',
      { ascending: true },
    ]);
  });

  it('members-only roster: count-only for an outside viewer', async () => {
    const roster = memberRows('lab-1', ['u1', 'u2']);
    const admin = new FakeAdmin(seedsFor(roster, [], profileRows([LEAD])));

    const [view] = await hydrateLabs(admin.asClient(), VIEWER, [
      labRow({ member_list_visibility: 'members' }),
    ]);

    expect(view?.memberCount).toBe(2);
    expect(view?.memberPreview).toEqual([]);
  });

  it('members-only roster: visible to an active member of the Space', async () => {
    const roster = memberRows('lab-1', ['u1', VIEWER]);
    const admin = new FakeAdmin(
      seedsFor(
        roster,
        [{ lab_id: 'lab-1', role: 'member', status: 'active' }],
        profileRows([LEAD, 'u1', VIEWER]),
      ),
    );

    const [view] = await hydrateLabs(admin.asClient(), VIEWER, [
      labRow({ member_list_visibility: 'members' }),
    ]);

    expect(view?.memberPreview.map((m) => m.user_id)).toEqual(['u1', VIEWER]);
  });

  it('members-only roster: a pending requester is NOT a member — count-only', async () => {
    const roster = memberRows('lab-1', ['u1', 'u2']);
    const admin = new FakeAdmin(
      seedsFor(
        roster,
        [{ lab_id: 'lab-1', role: 'member', status: 'requested' }],
        profileRows([LEAD]),
      ),
    );

    const [view] = await hydrateLabs(admin.asClient(), VIEWER, [
      labRow({ member_list_visibility: 'members' }),
    ]);

    expect(view?.viewerRelation).toBe('requested');
    expect(view?.memberPreview).toEqual([]);
  });

  it('private roster: count-only even for the lead (directory is a broadcast surface)', async () => {
    const roster = memberRows('lab-1', [LEAD, 'u2']);
    const admin = new FakeAdmin(seedsFor(roster, [], profileRows([LEAD])));

    const [view] = await hydrateLabs(admin.asClient(), LEAD, [
      labRow({ member_list_visibility: 'private' }),
    ]);

    expect(view?.viewerRelation).toBe('lead');
    expect(view?.memberPreview).toEqual([]);
  });

  it('hidden roster ids never enter the profile batch (leads only)', async () => {
    const roster = memberRows('lab-1', ['u1', 'u2']);
    const admin = new FakeAdmin(seedsFor(roster, [], profileRows([LEAD])));

    await hydrateLabs(admin.asClient(), VIEWER, [labRow({ member_list_visibility: 'members' })]);

    expect(admin.queryCount('profiles')).toBe(1);
    expect(admin.queryFor('profiles').argsOf('in')).toEqual(['user_id', [LEAD]]);
  });

  it('memberPreview authors resolve avatar thumbs for the facepile', async () => {
    const roster = memberRows('lab-1', ['u1']);
    const admin = new FakeAdmin(
      seedsFor(roster, [], [
        ...profileRows([LEAD]),
        {
          user_id: 'u1',
          display_name: 'Amina',
          handle: 'amina',
          avatar_path: 'avatars/u1/a.webp',
          avatar_blurhash: 'LEHV6nWB2yk8',
        },
      ]),
    );

    const [view] = await hydrateLabs(admin.asClient(), VIEWER, [
      labRow({ member_list_visibility: 'public' }),
    ]);

    const preview = view?.memberPreview[0];
    expect(preview?.avatar_thumb_url).toContain('a_thumb.webp');
    expect(preview?.avatar_blurhash).toBe('LEHV6nWB2yk8');
  });
});
