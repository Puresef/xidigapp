import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Venture state through the GENERAL Space routes (owner ruling, 11 Sep): on a
 * Venture-mode Space, approving a join request — and every other change to
 * who is in the venture or what it has decided — needs an ACTIVE account:
 *   members: respond (approve/decline), invite, set_role, remove, and a
 *     self-join (which can also claim a workstream seat);
 *   decisions: the decision log that weight schemes and capital needs cite;
 *   collaborations: propose/respond/end acting AS the venture.
 * Leaving is always allowed (own-data control). On an ORDINARY Space (Club /
 * Lab) a lead in the deletion grace still manages exactly as before.
 * Refusals happen before any membership/service call.
 */

const h = vi.hoisted(() => {
  const state = {
    ctx: null as unknown,
    lab: null as Record<string, unknown> | null,
    calls: [] as string[],
    spy:
      (name: string, result: unknown = {}) =>
      async () => {
        state.calls.push(name);
        return result;
      },
  };
  return state;
});

vi.mock('@/lib/auth/guards', () => ({ requireUser: async () => h.ctx }));
vi.mock('@/lib/labs-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/labs-api')>();
  return { ...actual, loadLabForViewer: async () => h.lab };
});
vi.mock('@/lib/labs/membership', () => ({
  joinLab: h.spy('join', { status: 'active' }),
  leaveLab: h.spy('leave'),
  respondToRequest: h.spy('respond'),
  inviteMember: h.spy('invite'),
  setMemberRole: h.spy('set_role'),
  removeMember: h.spy('remove'),
  proposeCollaboration: h.spy('propose', { id: 'c1' }),
  respondToCollaboration: h.spy('collab_respond'),
  endCollaboration: h.spy('end'),
}));
vi.mock('@/lib/labs/service', () => ({ addDecision: h.spy('decision', { id: 'd1' }) }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import * as members from './[id]/members/route';
import * as decisions from './[id]/decisions/route';
import * as collaborations from './[id]/collaborations/route';

const LEAD = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LAB_ID = '33333333-3333-4333-8333-333333333333';
const COLLAB = '44444444-4444-4444-8444-444444444444';
const params = { params: Promise.resolve({ id: LAB_ID }) };

type Handler = (req: Request, ctx: never) => Promise<Response>;
const post = (handler: Handler, body: unknown) =>
  handler(
    new Request(`https://app.xidig.net/api/labs/${LAB_ID}/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params as never,
  ).then((r) => r.status);

function as(status: string) {
  h.ctx = { user: { id: LEAD }, appUser: { id: LEAD, role: 'member', status } };
}
function labIs(space_mode: string) {
  h.lab = { id: LAB_ID, lead_user_id: LEAD, space_mode };
}

const MUTATIONS: Array<[string, Handler, unknown]> = [
  [
    'approve a join request',
    members.POST as Handler,
    { action: 'respond', userId: OTHER, decision: 'accept' },
  ],
  [
    'decline a join request',
    members.POST as Handler,
    { action: 'respond', userId: OTHER, decision: 'decline' },
  ],
  ['invite', members.POST as Handler, { action: 'invite', userId: OTHER }],
  ['set a role', members.POST as Handler, { action: 'set_role', userId: OTHER, role: 'core' }],
  ['remove a member', members.POST as Handler, { action: 'remove', userId: OTHER }],
  ['self-join', members.POST as Handler, { action: 'join' }],
  ['record a decision', decisions.POST as Handler, { title: 'zz', decision: 'zz' }],
  [
    'propose a collaboration',
    collaborations.POST as Handler,
    { action: 'propose', targetLabId: COLLAB },
  ],
  [
    'end a collaboration',
    collaborations.POST as Handler,
    { action: 'end', collaborationId: COLLAB },
  ],
];

beforeEach(() => {
  h.calls = [];
});

describe('Venture Space in the deletion grace', () => {
  it.each(MUTATIONS)('%s → 403, nothing called', async (_label, handler, body) => {
    as('pending_deletion');
    labIs('venture');
    expect(await post(handler, body)).toBe(403);
    expect(h.calls).toEqual([]);
  });

  it('leaving is still allowed (own-data control)', async () => {
    as('pending_deletion');
    labIs('venture');
    expect(await post(members.POST as Handler, { action: 'leave' })).toBe(200);
    expect(h.calls).toEqual(['leave']);
  });
});

describe('active Venture lead (control)', () => {
  it.each(MUTATIONS)('%s passes', async (_label, handler, body) => {
    as('active');
    labIs('venture');
    expect(await post(handler, body)).toBeLessThan(300);
    expect(h.calls.length).toBe(1);
  });
});

describe('ordinary Spaces are unchanged for the grace', () => {
  it.each(['club', 'lab'])('%s: a grace lead still approves, invites, decides', async (mode) => {
    as('pending_deletion');
    labIs(mode);
    for (const [label, handler, body] of MUTATIONS) {
      expect(await post(handler, body), `${mode} ${label}`).toBeLessThan(300);
    }
    expect(h.calls.length).toBe(MUTATIONS.length);
  });
});
