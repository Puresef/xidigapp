import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

/**
 * POST /api/appeals — the §19 resolution path, regression-pinned after the
 * suspended-lockout defect (page admitted suspended members, requireUser()
 * 403d their submit). Contract under test:
 *
 *   * a SUSPENDED member can submit an otherwise valid appeal of their OWN
 *     action (the route must use the appeal guard, not requireUser — the
 *     mock below exports ONLY requireUserForAppeal, so a regression to
 *     requireUser fails here at the import seam);
 *   * anonymous callers are refused 401;
 *   * appealing another member's action is refused (appeal_not_eligible)
 *     and inserts nothing;
 *   * duplicate appeals surface the DB unique as 409;
 *   * unknown mod actions 404;
 *   * the rate limiter and audit trail still run on the happy path.
 *
 * Reviewer recusal lives in /api/admin/appeals/[id] and is separately pinned
 * by the phase6 db suite — untouched by this fix.
 */

const authHolder = vi.hoisted(() => ({
  ctx: null as unknown,
  error: null as Error | null,
}));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));
const subjectHolder = vi.hoisted(() => ({ subject: null as string | null }));
const rateCalls = vi.hoisted(() => ({ keys: [] as string[] }));
const auditCalls = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[] }));

vi.mock('@/lib/auth/guards', () => ({
  requireUserForAppeal: async () => {
    if (authHolder.error) throw authHolder.error;
    return authHolder.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/moderation/actions', () => ({
  resolveSubjectUser: async () => subjectHolder.subject,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: async (key: string) => {
    rateCalls.keys.push(key);
  },
}));
vi.mock('@/lib/audit', () => ({
  writeAudit: async (_admin: unknown, entry: Record<string, unknown>) => {
    auditCalls.entries.push(entry);
  },
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: () => {},
}));

import { POST } from './route';

const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const ACTION_ID = '33333333-3333-4333-8333-333333333333';

interface AdminSeed {
  modAction?: Record<string, unknown> | null;
  insertError?: { code?: string; message: string } | null;
}

function makeAdmin(seed: AdminSeed) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    inserted,
    from(table: string) {
      if (table === 'mod_actions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: seed.modAction ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === 'appeals') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return {
              select: () => ({
                maybeSingle: async () =>
                  seed.insertError
                    ? { data: null, error: seed.insertError }
                    : { data: { id: 'appeal-1' }, error: null },
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client;
}

function ctxFor(status: string): unknown {
  return {
    user: { id: MEMBER_ID },
    appUser: { id: MEMBER_ID, role: 'member', status },
    supabase: null,
  };
}

function postRequest(body: Record<string, unknown> = { modActionId: ACTION_ID, body: 'Fadlan dib u eega.' }) {
  return new Request('https://xidig.test/api/appeals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authHolder.ctx = null;
  authHolder.error = null;
  adminHolder.client = null;
  subjectHolder.subject = null;
  rateCalls.keys.length = 0;
  auditCalls.entries.length = 0;
});

describe('POST /api/appeals', () => {
  it('lets a SUSPENDED member submit a valid appeal of their own action', async () => {
    authHolder.ctx = ctxFor('suspended');
    subjectHolder.subject = MEMBER_ID;
    const admin = makeAdmin({ modAction: { id: ACTION_ID, target_type: 'user', target_id: MEMBER_ID } });
    adminHolder.client = admin;

    const res = await POST(postRequest());
    const body = (await res.json()) as { data?: { notice?: string } };

    expect(res.status).toBe(200);
    expect(body.data?.notice).toBe('appeal_submitted');
    expect(admin.inserted).toHaveLength(1);
    expect(admin.inserted[0]).toMatchObject({
      mod_action_id: ACTION_ID,
      appellant_user_id: MEMBER_ID,
    });
    expect(rateCalls.keys).toEqual([`appeal:${MEMBER_ID}`]);
    expect(auditCalls.entries).toHaveLength(1);
    expect(auditCalls.entries[0]).toMatchObject({ action: 'appeal.submitted', actorUserId: MEMBER_ID });
  });

  it('still works for an ordinary active member', async () => {
    authHolder.ctx = ctxFor('active');
    subjectHolder.subject = MEMBER_ID;
    adminHolder.client = makeAdmin({ modAction: { id: ACTION_ID, target_type: 'post', target_id: 'p1' } });

    const res = await POST(postRequest());
    expect(res.status).toBe(200);
  });

  it('refuses an anonymous caller with 401', async () => {
    authHolder.error = new ApiError('session_expired', 401);

    const res = await POST(postRequest());
    expect(res.status).toBe(401);
  });

  it('keeps refusing deactivated/deleted accounts (guard 403 passes through)', async () => {
    authHolder.error = new ApiError('forbidden', 403);

    const res = await POST(postRequest());
    expect(res.status).toBe(403);
  });

  it("refuses an appeal of ANOTHER member's action and inserts nothing", async () => {
    authHolder.ctx = ctxFor('suspended');
    subjectHolder.subject = OTHER_ID;
    const admin = makeAdmin({ modAction: { id: ACTION_ID, target_type: 'user', target_id: OTHER_ID } });
    adminHolder.client = admin;

    const res = await POST(postRequest());
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(403);
    expect(body.error?.code).toBe('appeal_not_eligible');
    expect(admin.inserted).toHaveLength(0);
  });

  it('maps the one-appeal-per-action unique violation to 409', async () => {
    authHolder.ctx = ctxFor('suspended');
    subjectHolder.subject = MEMBER_ID;
    adminHolder.client = makeAdmin({
      modAction: { id: ACTION_ID, target_type: 'user', target_id: MEMBER_ID },
      insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const res = await POST(postRequest());
    const body = (await res.json()) as { error?: { code?: string } };

    expect(res.status).toBe(409);
    expect(body.error?.code).toBe('appeal_already_submitted');
  });

  it('404s an unknown mod action', async () => {
    authHolder.ctx = ctxFor('active');
    adminHolder.client = makeAdmin({ modAction: null });

    const res = await POST(postRequest());
    expect(res.status).toBe(404);
  });
});
