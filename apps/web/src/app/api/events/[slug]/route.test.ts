import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH / DELETE /api/events/[slug] — post-end immutability (Munaasabado
 * final-review fix 10). A finished event is a RECORD: the host can neither
 * edit it nor cancel it after the fact — both verbs 409 `event_ended` before
 * any write is issued. `ends_at` when present, else `starts_at`, is the
 * boundary (same rule as lib/events/views.ts isEnded).
 *
 * FakeClient harness from the sibling checkin route test (the endorsements
 * idiom): the view loader is mocked at the module boundary — the loader's own
 * behavior is views.test.ts's job; THIS suite owns the route's gate order.
 */

type Row = Record<string, unknown>;

class FakeQuery {
  update(_values: Row): this {
    return this;
  }
  eq(_column: string, _value: unknown): this {
    return this;
  }
  then<T1, T2>(
    onfulfilled?: ((value: { data: null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string }> = [];
  from(table: string): FakeQuery {
    this.calls.push({ table });
    return new FakeQuery();
  }
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const viewHolder = vi.hoisted(() => ({ view: null as unknown }));
const notified = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/events/views', () => ({
  getMemberEventView: async () => viewHolder.view,
}));
vi.mock('@/lib/notifications/notify', () => ({
  insertNotification: async (_admin: unknown, entry: unknown) => {
    notified.rows.push(entry);
  },
}));
vi.mock('@/lib/events/autopost', () => ({
  autopostEventPublished: async () => {},
}));
vi.mock('@/lib/moderation/scan', () => ({
  scanTextContent: async () => {},
}));
vi.mock('@/lib/media/attach', () => ({
  loadAttachableMedia: async () => {
    throw new Error('not under test');
  },
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {},
}));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { DELETE, PATCH } from './route';

const HOST = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const ENDED_START = '2026-08-01T10:00:00Z'; // firmly in the past
const ENDED_END = '2026-08-01T12:00:00Z';

function hostCtx(): unknown {
  return {
    user: { id: HOST },
    appUser: { id: HOST, role: 'member', status: 'active' },
    supabase: new FakeClient(),
  };
}

function endedView(overrides: Partial<Row> = {}): unknown {
  return {
    event: {
      id: EVENT_ID,
      slug: 'tea-talk',
      title: 'Tea & talk',
      description: 'Shir yar',
      starts_at: ENDED_START,
      ends_at: ENDED_END,
      status: 'published',
      visibility: 'members',
      lab_id: null,
      host_user_id: HOST,
      capacity: null,
      ...overrides,
    },
    viewer: { isHost: true, rsvp: null },
  };
}

function patchRequest(body: unknown): Request {
  return new Request('https://xidig.test/api/events/tea-talk', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request('https://xidig.test/api/events/tea-talk', { method: 'DELETE' });
}

function routeParams(slug = 'tea-talk'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

beforeEach(() => {
  authHolder.ctx = hostCtx();
  adminHolder.client = new FakeClient();
  viewHolder.view = null;
  notified.rows.length = 0;
});

describe('PATCH /api/events/[slug] — ended events are immutable', () => {
  it('409s event_ended before touching anything', async () => {
    viewHolder.view = endedView();
    const admin = new FakeClient();
    adminHolder.client = admin;

    const response = await PATCH(patchRequest({ title: 'Magac cusub' }), routeParams());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('event_ended');
    expect(admin.calls).toEqual([]);
  });

  it('uses starts_at as the boundary when ends_at is null', async () => {
    viewHolder.view = endedView({ ends_at: null });

    const response = await PATCH(patchRequest({ title: 'Magac cusub' }), routeParams());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('event_ended');
  });
});

describe('DELETE /api/events/[slug] — an ended event cannot be cancelled', () => {
  it('409s event_ended with no status write and no notifications', async () => {
    viewHolder.view = endedView();
    const admin = new FakeClient();
    adminHolder.client = admin;

    const response = await DELETE(deleteRequest(), routeParams());

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('event_ended');
    expect(admin.calls).toEqual([]);
    expect(notified.rows).toEqual([]);
  });
});
