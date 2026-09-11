import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RSVP route — retained content. An upcoming member-hosted event whose host's
 * account was deleted is no longer running (no handover exists): it takes no
 * new RSVP (409 event_not_open, the existing "not open" envelope). A member
 * can still WITHDRAW an RSVP they already made — that is their own row.
 */

const state = vi.hoisted(() => ({
  hostState: 'host_present' as string,
  writes: [] as string[],
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/notifications/notify', () => ({ insertNotification: async () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ appUser: { id: 'member-1', status: 'active' } }),
}));
vi.mock('@/lib/events/views', () => ({
  getMemberEventView: async () => ({
    event: {
      id: 'event-1',
      slug: 'garden-day',
      status: 'published',
      starts_at: '2099-01-01T10:00:00Z',
      ends_at: null,
      capacity: null,
      host_user_id: 'host-1',
    },
    hostState: state.hostState,
    viewer: { isHost: false, rsvp: { status: 'going', showPublicly: true } },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from() {
      const chain: Record<string, unknown> = {};
      chain.upsert = () => (state.writes.push('upsert'), Promise.resolve({ error: null }));
      chain.delete = () => (state.writes.push('delete'), chain);
      chain.eq = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve);
      return chain;
    },
  }),
}));

import { DELETE, PUT } from './route';

const params = { params: Promise.resolve({ slug: 'garden-day' }) };
const put = () =>
  PUT(
    new Request('https://xidig.test/api/events/garden-day/rsvp', {
      method: 'PUT',
      body: JSON.stringify({ status: 'interested', showPublicly: true }),
    }),
    params,
  );

beforeEach(() => {
  state.hostState = 'host_present';
  state.writes.length = 0;
});

describe('RSVP — a deleted host’s upcoming event', () => {
  it('refuses a new RSVP with 409 event_not_open and writes nothing', async () => {
    state.hostState = 'host_deleted_upcoming';
    const res = await put();
    const body = (await res.json()) as { error?: { code?: string } };
    expect(res.status).toBe(409);
    expect(body.error?.code).toBe('event_not_open');
    expect(state.writes).toEqual([]);
  });

  it('still lets the member withdraw their existing RSVP', async () => {
    state.hostState = 'host_deleted_upcoming';
    const res = await DELETE(new Request('https://xidig.test/x', { method: 'DELETE' }), params);
    expect(res.status).toBe(200);
    expect(state.writes).toEqual(['delete']);
  });

  it('a present host is unchanged — the RSVP is written', async () => {
    const res = await put();
    expect(res.status).toBe(200);
    expect(state.writes).toEqual(['upsert']);
  });
});
