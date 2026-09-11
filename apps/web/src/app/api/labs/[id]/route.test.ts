import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH /api/labs/[id] — Space settings. A lead in the deletion grace still
 * manages an ORDINARY Space (Club/Lab: grace is ordinary membership), but a
 * VENTURE Space's settings (visibility, join mode — who can see and join the
 * ledger) are venture settings, which need an active account (owner ruling,
 * 11 Sep). A grace admin is not a Space manager at all (isActiveAdmin).
 */

const h = vi.hoisted(() => ({
  ctx: null as unknown,
  lab: null as Record<string, unknown> | null,
  updates: 0,
}));

vi.mock('@/lib/auth/guards', () => ({ requireUser: async () => h.ctx }));
vi.mock('@/lib/labs-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/labs-api')>();
  return {
    ...actual,
    loadLabForViewer: async () => h.lab,
    hydrateOneLab: async () => ({ id: 'lab' }),
  };
});
vi.mock('@/lib/labs/service', () => ({
  updateLabSettings: async (_a: unknown, lab: unknown) => {
    h.updates += 1;
    return lab;
  },
  logLabEvent: async () => {},
}));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { PATCH } from './route';

const LEAD = '11111111-1111-4111-8111-111111111111';
const LAB_ID = '22222222-2222-4222-8222-222222222222';

function as(status: string, role = 'member', id = LEAD) {
  h.ctx = { user: { id }, appUser: { id, role, status } };
}
function labIs(space_mode: string) {
  h.lab = { id: LAB_ID, lead_user_id: LEAD, space_mode };
}
async function patch(): Promise<number> {
  const res = await PATCH(
    new Request(`https://app.xidig.net/api/labs/${LAB_ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joinMode: 'request' }),
    }),
    { params: Promise.resolve({ id: LAB_ID }) },
  );
  return res.status;
}

beforeEach(() => {
  h.updates = 0;
});

describe('PATCH /api/labs/[id] in the deletion grace', () => {
  it.each(['club', 'lab'])('a grace lead still manages an ordinary %s Space', async (mode) => {
    as('pending_deletion');
    labIs(mode);
    expect(await patch()).toBe(200);
    expect(h.updates).toBe(1);
  });

  it('a grace lead may not change a Venture Space’s settings', async () => {
    as('pending_deletion');
    labIs('venture');
    expect(await patch()).toBe(403);
    expect(h.updates).toBe(0);
  });

  it('an active lead may (control)', async () => {
    as('active');
    labIs('venture');
    expect(await patch()).toBe(200);
  });

  it('a grace admin is not a manager of someone else’s Space', async () => {
    as('pending_deletion', 'admin', '99999999-9999-4999-8999-999999999999');
    labIs('club');
    expect(await patch()).toBe(403);
    as('active', 'admin', '99999999-9999-4999-8999-999999999999');
    expect(await patch()).toBe(200);
  });
});
