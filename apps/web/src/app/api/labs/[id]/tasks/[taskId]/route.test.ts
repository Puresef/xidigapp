import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/labs/[id]/tasks/[taskId] — a claimed card belongs to whoever
 * claimed it.
 *
 * `TASK_TRANSITIONS` allows claimed → open and claimed → submitted; membership
 * (`canContribute`) is not an answer to WHO may make them. Without the guard in
 * this route any contributing member could drop someone else's claim, or hand
 * in their work for them — and submitting is the step that carries work into
 * attestation, where it becomes units in the ledger.
 *
 * A lead keeps the release affordance (a quiet member must not hold a
 * workstream hostage); nobody, lead included, submits another member's work.
 */

type Row = Record<string, unknown>;
type PgError = { code: string; message: string } | null;

class FakeQuery implements PromiseLike<{ data: Row | null; error: PgError }> {
  constructor(private readonly seed: { row?: Row | null; error?: PgError }) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  maybeSingle() {
    return this;
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: Row | null; error: PgError }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.seed.row ?? null, error: this.seed.error ?? null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeClient {
  readonly calls: string[] = [];
  constructor(private readonly seeds: Record<string, Array<{ row?: Row | null }>> = {}) {}

  from(table: string): FakeQuery {
    this.calls.push(table);
    return new FakeQuery(this.seeds[table]?.shift() ?? {});
  }
  queryCount(table: string): number {
    return this.calls.filter((name) => name === table).length;
  }
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const viewerHolder = vi.hoisted(() => ({ viewer: null as unknown }));
const serviceHolder = vi.hoisted(() => ({ transitions: [] as unknown[] }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
  requireActiveUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/maal/views', () => ({
  loadVentureForViewer: async () => ({ id: LAB_ID, slug: 'beeraha', space_mode: 'venture' }),
  getVentureViewer: async () => viewerHolder.viewer,
}));
vi.mock('@/lib/maal/service', () => ({
  transitionTask: async (
    _admin: unknown,
    _lab: unknown,
    actorUserId: string,
    taskId: string,
    input: { status: string },
  ) => {
    serviceHolder.transitions.push({ actorUserId, taskId, status: input.status });
    return { id: taskId, status: input.status };
  },
  updateTask: async () => ({ id: TASK_ID }),
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { PATCH } from './route';

const LAB_ID = '44444444-4444-4444-8444-444444444444';
const TASK_ID = '55555555-5555-4555-8555-555555555555';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function contextFor(userId: string): unknown {
  return {
    user: { id: userId },
    appUser: { id: userId, role: 'member', status: 'active' },
    supabase: new FakeClient(),
  };
}

function viewerFor(userId: string, isLead = false): unknown {
  return {
    userId,
    relation: isLead ? 'lead' : 'member',
    isMember: true,
    isLead,
    isMod: false,
    canManage: isLead,
    canContribute: true,
    canReadLedger: true,
    canReadHours: true,
  };
}

/** The card as the admin client finds it: claimed, held by OWNER. */
function claimedBy(userId: string | null): FakeClient {
  return new FakeClient({
    venture_tasks: [{ row: { status: 'claimed', assignee_user_id: userId } }],
  });
}

function patch(status: string): Request {
  return new Request(`https://xidig.test/api/labs/${LAB_ID}/tasks/${TASK_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

function routeParams(): { params: Promise<{ id: string; taskId: string }> } {
  return { params: Promise.resolve({ id: LAB_ID, taskId: TASK_ID }) };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = contextFor(OTHER);
  adminHolder.client = new FakeClient();
  viewerHolder.viewer = viewerFor(OTHER);
  serviceHolder.transitions.length = 0;
});

describe('PATCH /api/labs/[id]/tasks/[taskId] — claim ownership', () => {
  it('403s a member submitting another member’s claimed card', async () => {
    adminHolder.client = claimedBy(OWNER);

    const response = await PATCH(patch('submitted'), routeParams());

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('forbidden');
    expect(serviceHolder.transitions).toEqual([]);
  });

  it('403s a member releasing another member’s claimed card', async () => {
    adminHolder.client = claimedBy(OWNER);

    const response = await PATCH(patch('open'), routeParams());

    expect(response.status).toBe(403);
    expect(serviceHolder.transitions).toEqual([]);
  });

  it('lets the assignee submit their own work', async () => {
    authHolder.ctx = contextFor(OWNER);
    viewerHolder.viewer = viewerFor(OWNER);
    adminHolder.client = claimedBy(OWNER);

    const response = await PATCH(patch('submitted'), routeParams());

    expect(response.status).toBe(200);
    expect(serviceHolder.transitions).toEqual([
      { actorUserId: OWNER, taskId: TASK_ID, status: 'submitted' },
    ]);
  });

  it('keeps the lead’s release affordance — a quiet member cannot hold a card', async () => {
    viewerHolder.viewer = viewerFor(OTHER, true);
    adminHolder.client = claimedBy(OWNER);

    const response = await PATCH(patch('open'), routeParams());

    expect(response.status).toBe(200);
    expect(serviceHolder.transitions).toEqual([
      { actorUserId: OTHER, taskId: TASK_ID, status: 'open' },
    ]);
  });

  it('a lead still cannot submit another member’s work (they could then witness it)', async () => {
    viewerHolder.viewer = viewerFor(OTHER, true);
    adminHolder.client = claimedBy(OWNER);

    const response = await PATCH(patch('submitted'), routeParams());

    expect(response.status).toBe(403);
    expect(serviceHolder.transitions).toEqual([]);
  });

  it('claiming an open card needs no ownership read at all', async () => {
    const admin = new FakeClient();
    adminHolder.client = admin;

    const response = await PATCH(patch('claimed'), routeParams());

    expect(response.status).toBe(200);
    expect(admin.queryCount('venture_tasks')).toBe(0);
    expect(serviceHolder.transitions).toHaveLength(1);
  });

  it('witnessing and approving are untouched — recusal stays transitionTask’s answer', async () => {
    const admin = new FakeClient();
    adminHolder.client = admin;

    expect((await PATCH(patch('attested'), routeParams())).status).toBe(200);
    expect((await PATCH(patch('verified'), routeParams())).status).toBe(200);
    expect(admin.queryCount('venture_tasks')).toBe(0);
  });

  it('403s a member who cannot contribute before any card is read', async () => {
    const admin = claimedBy(OWNER);
    adminHolder.client = admin;
    viewerHolder.viewer = { ...(viewerFor(OTHER) as object), canContribute: false };

    const response = await PATCH(patch('open'), routeParams());

    expect(response.status).toBe(403);
    expect(admin.queryCount('venture_tasks')).toBe(0);
  });
});
