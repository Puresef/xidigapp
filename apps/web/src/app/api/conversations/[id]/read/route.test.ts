import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * POST /api/conversations/[id]/read — read-mark contract (A5a):
 *
 *   * ACCEPTED thread: writes the CALLER's own last_read column, never the
 *     counterpart's;
 *   * pending/blocked thread: a 200 no-op that writes NOTHING — read-state
 *     must not exist before consent (the requestExplainer promises the
 *     sender "{name} can't see that you've read it", and a blocked thread
 *     records nothing either);
 *   * unknown conversation or non-participant: 404 (loadConversationForUser
 *     already anonymises the two cases);
 *   * anonymous: 401.
 */

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));
const convoHolder = vi.hoisted(() => ({ convo: null as Record<string, unknown> | null }));
const upserts = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/dm/service', () => ({
  loadConversationForUser: async () => convoHolder.convo,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== 'dm_read_states') throw new Error(`unexpected table ${table}`);
      return {
        upsert: async (row: Record<string, unknown>) => {
          upserts.rows.push(row);
          return { error: null };
        },
      };
    },
  }),
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { POST } from './route';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONVO = '33333333-3333-4333-8333-333333333333';

function ctx(): unknown {
  return { user: { id: ME }, appUser: { id: ME, role: 'member', status: 'active' }, supabase: null };
}

function convo(status: string, iAmInitiator: boolean): Record<string, unknown> {
  return {
    id: CONVO,
    status,
    initiator_user_id: iAmInitiator ? ME : OTHER,
    recipient_user_id: iAmInitiator ? OTHER : ME,
  };
}

function post() {
  return POST(new Request(`https://xidig.test/api/conversations/${CONVO}/read`, { method: 'POST' }), {
    params: Promise.resolve({ id: CONVO }),
  });
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
  convoHolder.convo = null;
  upserts.rows.length = 0;
});

describe('POST /api/conversations/[id]/read', () => {
  it('upserts the CALLER’s own dm_read_states row on an accepted thread', async () => {
    authHolder.ctx = ctx();
    convoHolder.convo = convo('accepted', false);

    const res = await post();
    const body = (await res.json()) as { data?: { readAt?: string | null } };

    expect(res.status).toBe(200);
    expect(typeof body.data?.readAt).toBe('string');
    expect(upserts.rows).toHaveLength(1);
    // The caller's OWN id — never the counterpart's — and no other party's column.
    expect(upserts.rows[0]).toMatchObject({ conversation_id: CONVO, user_id: ME });
    expect(Object.keys(upserts.rows[0] ?? {}).sort()).toEqual([
      'conversation_id',
      'last_read_at',
      'user_id',
    ]);
  });

  it('upserts the caller’s own row regardless of initiator/recipient side', async () => {
    authHolder.ctx = ctx();
    convoHolder.convo = convo('accepted', true);

    await post();
    expect(upserts.rows[0]).toMatchObject({ conversation_id: CONVO, user_id: ME });
  });

  it('is a 200 no-op on a PENDING thread — no read-state before consent', async () => {
    authHolder.ctx = ctx();
    convoHolder.convo = convo('pending', false);

    const res = await post();
    const body = (await res.json()) as { data?: { readAt?: string | null } };

    expect(res.status).toBe(200);
    expect(body.data?.readAt).toBeNull();
    expect(upserts.rows).toHaveLength(0);
  });

  it('is a 200 no-op on a BLOCKED thread', async () => {
    authHolder.ctx = ctx();
    convoHolder.convo = convo('blocked', true);

    const res = await post();
    expect(res.status).toBe(200);
    expect(upserts.rows).toHaveLength(0);
  });

  it('404s an unknown conversation or non-participant', async () => {
    authHolder.ctx = ctx();
    convoHolder.convo = null;

    const res = await post();
    expect(res.status).toBe(404);
    expect(upserts.rows).toHaveLength(0);
  });

  it('refuses anonymous callers with 401', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const res = await post();
    expect(res.status).toBe(401);
    expect(upserts.rows).toHaveLength(0);
  });
});
