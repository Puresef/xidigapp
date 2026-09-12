import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Escalations and venture writes need an ACTIVE account; the deletion grace
 * keeps READ reach (owner rulings, 11 Sep):
 *   * create_lab stays active-only (has_capability) — Lab mode is entangled
 *     with Candidate/Venture/capital escalation;
 *   * Lab→Candidate handoff, candidate create/edit/submit (which opens the
 *     governance vote window) and Space→Venture promotion require active;
 *   * every venture ledger/board/capital write requires active — logging,
 *     attesting or reversing a contribution, task and workstream changes,
 *     declaring a capital need, venture settings;
 *   * the grace still reads the ledger, board, capital need and export where
 *     the Space already lets them.
 *
 * This runs the REAL guards (lib/auth/guards) against a faked session and
 * proves, per handler, whether the request gets PAST authentication: every
 * database touch after the guard hits a sentinel. A refused write never
 * reaches the sentinel — nothing was read or written.
 */

const h = vi.hoisted(() => ({
  appUser: null as Record<string, unknown> | null,
  reached: 0,
}));

class Reached extends Error {}

vi.mock('@/lib/supabase/server', () => {
  const trap = () => {
    h.reached += 1;
    throw new Reached('past the guard');
  };
  return {
    getSupabaseServer: async () => ({
      auth: { getUser: async () => ({ data: { user: h.appUser ? { id: h.appUser.id } : null } }) },
      from: (table: string) =>
        table === 'users'
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.appUser }) }) }) }
          : trap(),
      rpc: trap,
    }),
    getSupabaseAdmin: () => ({ from: trap, rpc: trap, storage: { from: trap } }),
  };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
  enforceRateLimit: async () => {},
}));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));

import * as promote from './[id]/promote/route';
import * as capital from './[id]/capital/route';
import * as contributions from './[id]/contributions/route';
import * as attest from './[id]/contributions/[eventId]/attest/route';
import * as reverse from './[id]/contributions/[eventId]/reverse/route';
import * as exportRoute from './[id]/contributions/export/route';
import * as tasks from './[id]/tasks/route';
import * as task from './[id]/tasks/[taskId]/route';
import * as venture from './[id]/venture/route';
import * as workstreams from './[id]/workstreams/route';
import * as workstream from './[id]/workstreams/[wsId]/route';
import * as candidates from '../candidates/route';
import * as candidate from '../candidates/[id]/route';
import * as submit from '../candidates/[id]/submit/route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const LAB = '22222222-2222-4222-8222-222222222222';
const EVT = '33333333-3333-4333-8333-333333333333';
const CAND = '44444444-4444-4444-8444-444444444444';
const params = Promise.resolve({ id: LAB, eventId: EVT, taskId: EVT, wsId: EVT });
const candParams = Promise.resolve({ id: CAND });

type Handler = (req: Request, ctx: never) => Promise<Response>;
const req = (method: string) =>
  new Request(`https://app.xidig.net/x?format=csv`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify({}) }),
  });

const WRITES: Array<[string, Handler, Promise<unknown>]> = [
  ['promote POST (Lab / Candidate handoff / Venture)', promote.POST as Handler, params],
  ['capital need POST', capital.POST as Handler, params],
  ['contribution POST', contributions.POST as Handler, params],
  ['attest POST', attest.POST as Handler, params],
  ['reverse POST', reverse.POST as Handler, params],
  ['task POST', tasks.POST as Handler, params],
  ['task PATCH', task.PATCH as Handler, params],
  ['venture settings PATCH', venture.PATCH as Handler, params],
  ['workstream POST', workstreams.POST as Handler, params],
  ['workstream PATCH', workstream.PATCH as Handler, params],
  ['workstream DELETE', workstream.DELETE as Handler, params],
  ['candidate create POST', candidates.POST as Handler, params],
  ['candidate edit PATCH', candidate.PATCH as Handler, candParams],
  ['candidate submit POST', submit.POST as Handler, candParams],
];

const READS: Array<[string, Handler, Promise<unknown>]> = [
  ['ledger GET', contributions.GET as Handler, params],
  ['ledger export GET', exportRoute.GET as Handler, params],
  ['board GET', tasks.GET as Handler, params],
  ['capital need GET', capital.GET as Handler, params],
  ['venture overview GET', venture.GET as Handler, params],
  ['workstreams GET', workstreams.GET as Handler, params],
  ['candidate GET', candidate.GET as Handler, candParams],
];

function as(status: string, role = 'member') {
  h.appUser = { id: USER_ID, role, status };
}
async function run(handler: Handler, p: Promise<unknown>, method: string) {
  h.reached = 0;
  const res = await handler(req(method), { params: p } as never);
  const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
  return { status: res.status, code: body?.error?.code ?? null, reached: h.reached > 0 };
}
const methodOf = (label: string) =>
  label.split(' ').find((w) => /^(GET|POST|PATCH|DELETE)$/.test(w))!;

beforeEach(() => {
  h.appUser = null;
});

describe('grace: escalations and venture writes are refused before any data is touched', () => {
  it.each(WRITES)('%s', async (label, handler, p) => {
    as('pending_deletion');
    expect(await run(handler, p, methodOf(label))).toEqual({
      status: 403,
      code: 'forbidden',
      reached: false,
    });
  });

  it.each(WRITES)('%s — a grace ADMIN is refused too', async (label, handler, p) => {
    as('pending_deletion', 'admin');
    expect(await run(handler, p, methodOf(label))).toEqual({
      status: 403,
      code: 'forbidden',
      reached: false,
    });
  });
});

// Past authentication = the handler reached data (sentinel) OR refused the
// empty test body on validation (400) — both happen only after the guard, the
// first statement of every handler here — OR refused with a PAUSED code.
// Paused escalations (Xidig Plus doctrine, 12 Sep) refuse everyone AFTER the
// active-account guard with their own neutral 403 code, never 'forbidden'.
const PAUSED_CODES = new Set([
  'lab_eligibility_under_review',
  'put_forward_under_review',
  'venture_promotion_under_review',
  'vote_eligibility_under_review',
]);
const passedAuth = (r: { status: number; reached: boolean; code: string | null }) =>
  r.reached ||
  (r.status !== 401 && r.status !== 403) ||
  (r.code !== null && PAUSED_CODES.has(r.code));

describe('active: the same writes pass authentication (control)', () => {
  it.each(WRITES)('%s', async (label, handler, p) => {
    as('active');
    expect(passedAuth(await run(handler, p, methodOf(label)))).toBe(true);
  });
});

describe('grace keeps read reach', () => {
  it.each(READS)('%s passes authentication', async (label, handler, p) => {
    as('pending_deletion');
    expect((await run(handler, p, methodOf(label))).reached).toBe(true);
  });
});

describe('blocked accounts reach nothing', () => {
  it.each(['suspended', 'deactivated', 'deleted'])('%s', async (status) => {
    as(status);
    for (const [label, handler, p] of [...WRITES, ...READS]) {
      const r = await run(handler, p, methodOf(label));
      expect(r.reached, `${status} ${label}`).toBe(false);
      expect(r.status, `${status} ${label}`).toBe(403);
    }
  });
});
