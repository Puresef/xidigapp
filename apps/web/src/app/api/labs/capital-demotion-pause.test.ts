import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Capital-need declaration and the Venture timeout demotion are PAUSED (owner
 * rulings, 12 Sep):
 *
 *   POST /api/labs/[id]/capital  → 403 capital_pathway_under_review, for every
 *     lead and manager (admin included). Nothing is parsed, rate-limited,
 *     written, logged or emitted, and the tier is never consulted. GET still
 *     reads a need recorded before the pause.
 *   GET /api/cron/labs           → never calls warn_timed_out_ventures or
 *     demote_timed_out_ventures and never updates `labs`. The dormancy check-in
 *     and the skills-gap alert keep running. What replaces the demotion is a
 *     read-only `venturesPastTimeout` count for private operator review.
 *
 * A source scan backs both, so a later edit that quietly re-wires a write, a
 * demotion or a tier check fails here.
 */

const h = vi.hoisted(() => ({
  role: 'member' as string,
  viewer: { isLead: true, canManage: false },
  writes: [] as string[],
  rpcs: [] as string[],
  selects: [] as Array<{ table: string; opts: unknown; filters: string[] }>,
  capabilityCalls: 0,
  rateLimitCalls: 0,
  emits: 0,
}));

vi.mock('@/env', () => ({ env: { CRON_SECRET: 'cron-secret' } }));
vi.mock('@/lib/locale', async () => {
  const { createTranslator } = await import('@xidig/i18n');
  return { getT: async () => createTranslator('en'), getLocale: async () => 'en' };
});
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));
vi.mock('@/lib/auth/guards', () => {
  const ctx = () => ({ appUser: { id: 'user-1', role: h.role, status: 'active' }, supabase: {} });
  return { requireUser: async () => ctx(), requireActiveUser: async () => ctx() };
});
vi.mock('@/lib/membership', () => ({
  hasCapability: async () => {
    h.capabilityCalls += 1;
    return true; // even a tier that WOULD have held the power is refused
  },
  hasEntitlement: async () => {
    h.capabilityCalls += 1;
    return true;
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => {
    h.rateLimitCalls += 1;
    return true;
  },
  enforceRateLimit: async () => {
    h.rateLimitCalls += 1;
  },
}));
vi.mock('@/lib/analytics/emit', () => ({
  emitServer: () => {
    h.emits += 1;
  },
}));
vi.mock('@/lib/notifications/notify', () => ({
  insertNotification: async () => {
    h.writes.push('notify');
  },
}));
vi.mock('@/lib/labs-api', () => ({ parseLabId: (id: string) => id }));
vi.mock('@/lib/maal/views', () => ({
  loadVentureForViewer: async () => ({ id: 'lab-1', space_mode: 'venture' }),
  getVentureViewer: async () => h.viewer,
  getVentureCapital: async () => ({
    need: { id: 'need-1', amount_cents: 1_800_000, currency: 'USD', purpose: 'Recorded earlier' },
    decision: null,
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const filters: string[] = [];
      const chain = {
        insert: () => {
          h.writes.push(`insert:${table}`);
          return chain;
        },
        update: () => {
          h.writes.push(`update:${table}`);
          return chain;
        },
        upsert: () => {
          h.writes.push(`upsert:${table}`);
          return chain;
        },
        delete: () => {
          h.writes.push(`delete:${table}`);
          return chain;
        },
        select: (_cols?: string, opts?: unknown) => {
          h.selects.push({ table, opts, filters });
          return chain;
        },
        eq: (col: string, val: unknown) => {
          filters.push(`${col}=${String(val)}`);
          return chain;
        },
        lt: (col: string) => {
          filters.push(`${col}<`);
          return chain;
        },
        in: () => chain,
        contains: () => chain,
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], count: 3, error: null }).then(resolve),
      };
      return chain;
    },
    rpc: async (name: string) => {
      h.rpcs.push(name);
      return { data: [], error: null };
    },
  }),
}));

const capital = await import('./[id]/capital/route');
const cron = await import('../cron/labs/route');

type Body = { data?: Record<string, unknown>; error?: { code?: string; cta?: unknown } };
async function call(res: Promise<Response>) {
  const r = await res;
  return { status: r.status, body: (await r.json()) as Body };
}
const params = { params: Promise.resolve({ id: 'lab-1' }) };
const postNeed = () =>
  new Request('https://app.xidig.net/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ amountCents: 1_000_000, currency: 'USD', purpose: 'Seed round' }),
  });

beforeEach(() => {
  h.role = 'member';
  h.viewer = { isLead: true, canManage: false };
  h.writes = [];
  h.rpcs = [];
  h.selects = [];
  h.capabilityCalls = 0;
  h.rateLimitCalls = 0;
  h.emits = 0;
});

describe('capital-need declaration is paused', () => {
  it.each([
    ['a Venture lead', 'member', { isLead: true, canManage: false }],
    ['a core manager', 'member', { isLead: false, canManage: true }],
    ['a platform admin', 'admin', { isLead: false, canManage: true }],
  ])('%s is refused neutrally, with no write and no tier lookup', async (_l, role, viewer) => {
    h.role = role;
    h.viewer = viewer;
    const r = await call(capital.POST(postNeed(), params as never));
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('capital_pathway_under_review');
    expect(r.body.error?.cta ?? null).toBeNull();
    expect(JSON.stringify(r.body)).not.toMatch(/Xidig Plus|upgrade|\$1|invest/i);
    expect(h.capabilityCalls).toBe(0);
    expect(h.writes).toEqual([]);
    expect(h.rpcs).toEqual([]);
    expect(h.rateLimitCalls).toBe(0);
    expect(h.emits).toBe(0);
  });

  it('someone who could never declare a need is told forbidden, not about the pathway', async () => {
    h.viewer = { isLead: false, canManage: false };
    const r = await call(capital.POST(postNeed(), params as never));
    expect(r.status).toBe(403);
    expect(r.body.error?.code).toBe('forbidden');
    expect(h.writes).toEqual([]);
  });

  it('a need recorded before the pause is still readable', async () => {
    const r = await call(capital.GET(new Request('https://app.xidig.net/x'), params as never));
    expect(r.status).toBe(200);
    expect((r.body.data?.need as { id: string }).id).toBe('need-1');
    expect(h.writes).toEqual([]);
  });
});

describe('the Venture timeout demotion is paused', () => {
  const run = () =>
    call(
      cron.GET(
        new Request('https://app.xidig.net/api/cron/labs', {
          headers: { authorization: 'Bearer cron-secret' },
        }),
      ),
    );

  it('the sweep neither warns nor demotes, and changes no Venture', async () => {
    const r = await run();
    expect(r.status).toBe(200);
    expect(h.rpcs).not.toContain('warn_timed_out_ventures');
    expect(h.rpcs).not.toContain('demote_timed_out_ventures');
    // The check-ins that never change a stage keep running.
    expect(h.rpcs).toEqual(['mark_dormant_labs', 'flag_skill_gaps']);
    expect(h.writes.filter((w) => w.startsWith('update:') || w.startsWith('insert:'))).toEqual([]);
    expect(r.body.data).not.toHaveProperty('venturesDemoted');
    expect(r.body.data).not.toHaveProperty('venturesWarned');
    expect(h.capabilityCalls).toBe(0);
  });

  it('what replaces it is a read-only operator count of Ventures past the timeout', async () => {
    const r = await run();
    expect(r.body.data?.venturesPastTimeout).toBe(3);
    const count = h.selects.find((s) => s.table === 'labs');
    expect(count?.opts).toEqual({ count: 'exact', head: true });
    expect(count?.filters).toEqual(['space_mode=venture', 'last_activity_at<']);
    // No member is told anything by the count.
    expect(h.writes).not.toContain('notify');
  });
});

describe('source scan: no back door re-opens either path', () => {
  const SRC = fileURLToPath(new URL('../../../', import.meta.url)); // apps/web/src
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  const files = walk(SRC).map((p) => ({ p: p.slice(SRC.length), src: readFileSync(p, 'utf8') }));

  it('scans the app source', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('no app code writes venture_capital_needs', () => {
    const offenders = files.filter(({ src }) =>
      /from\(\s*['"]venture_capital_needs['"]\s*\)\s*\.\s*(insert|upsert|update|delete)\(/.test(
        src,
      ),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
    // Every remaining reference is a read.
    const refs = files.filter(({ src }) => /from\(\s*['"]venture_capital_needs['"]/.test(src));
    expect(refs.map((f) => f.p)).toEqual(['lib/maal/views.ts']);
  });

  it('no app code calls the warn or demote RPC', () => {
    const offenders = files.filter(({ src }) =>
      /rpc\(\s*['"](warn|demote)_timed_out_ventures['"]/.test(src),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
  });

  it('no app code sends a new demotion warning or demotion notice', () => {
    const offenders = files.filter(({ src }) =>
      /type:\s*['"]venture_demot(ion_warning|ed)['"]/.test(src),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
  });

  it('no app code writes a Venture back to Lab stage', () => {
    // A Venture moves to 'lab' only through the paused RPC; an app-side update
    // would be a demotion by another name. The one app write of 'lab' is
    // Club → Lab (promoteToLab, itself paused at the route), and it may only
    // ever match a Club row.
    const writers = files.filter(({ src }) =>
      /\.update\(\s*\{[^}]*space_mode:\s*['"]lab['"]/.test(src),
    );
    expect(writers.map((f) => f.p)).toEqual(['lib/labs/service.ts']);
    const service = writers[0]!.src;
    const updates = service.match(
      /\.update\(\s*\{[^}]*space_mode:\s*['"]lab['"][\s\S]*?\.single\(\)/g,
    );
    expect(updates).toHaveLength(1);
    expect(updates![0]).toMatch(/\.eq\('space_mode', 'club'\)/);
  });

  it('neither paused path consults the paid tier', () => {
    for (const p of [
      'app/api/labs/[id]/capital/route.ts',
      'app/api/cron/labs/route.ts',
      'lib/labs/sweeps.ts',
    ]) {
      const f = files.find((x) => x.p === p);
      expect(f, p).toBeDefined();
      expect(f!.src, p).not.toMatch(
        /@\/lib\/membership|hasCapability|hasEntitlement|has_capability|has_entitlement|tier_capabilities|supporter/,
      );
    }
  });
});
