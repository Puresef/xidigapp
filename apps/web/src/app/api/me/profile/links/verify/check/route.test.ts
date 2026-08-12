import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/me/profile/links/verify/check — acceptance A7.
 *
 * The orange check on an external link exists only where THIS handler put it,
 * and only after the server itself read the page. So the tests below are mostly
 * about what the caller cannot do: cannot assert a verdict, cannot check a link
 * that isn't on their profile, cannot ask for a nonce they never issued, and
 * cannot use the endpoint to make the server dial private space.
 *
 * A page that doesn't link back is a 200 `failed`, not an error — checking
 * before editing the page is the ordinary first attempt, not a fault.
 */

type Row = Record<string, unknown>;

interface Recorded {
  op: string;
  args: unknown[];
}

class FakeQuery implements PromiseLike<{ data: Row | null; error: null }> {
  readonly recorded: Recorded[] = [];
  constructor(private readonly row: Row | null) {}

  private chain(op: string, args: unknown[]): this {
    this.recorded.push({ op, args });
    return this;
  }
  select(columns: string) {
    return this.chain('select', [columns]);
  }
  update(values: Row) {
    return this.chain('update', [values]);
  }
  eq(column: string, value: unknown) {
    return this.chain('eq', [column, value]);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  argsOf(op: string): unknown[] | undefined {
    return this.recorded.find((entry) => entry.op === op)?.args;
  }
  then<T1, T2>(
    onfulfilled?: ((value: { data: Row | null; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.row, error: null }).then(onfulfilled, onrejected);
  }
}

class FakeClient {
  readonly calls: Array<{ table: string; query: FakeQuery }> = [];
  constructor(private readonly seeds: Record<string, Array<Row | null>> = {}) {}

  from(table: string): FakeQuery {
    const seeded = this.seeds[table];
    const row = seeded && seeded.length > 0 ? seeded.shift()! : null;
    const query = new FakeQuery(row);
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
}

const authHolder = vi.hoisted(() => ({ ctx: null as unknown }));
const adminHolder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@/env', () => ({ env: { APP_URL: 'https://xidig.test' } }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => authHolder.ctx,
}));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => adminHolder.client,
}));
vi.mock('@/lib/locale', () => ({
  getT: async () => (key: string) => key,
}));
vi.mock('@/lib/analytics/emit', () => ({ emitServer: () => {} }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => {} }));
vi.mock('@sentry/nextjs', () => ({ captureException: () => {} }));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const PAGE = 'https://hodan.dev';

function postRequest(body: unknown): Request {
  return new Request('https://xidig.test/api/me/profile/links/verify/check', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** The caller's own profile carries hodan.dev, so the link is verifiable. */
function callerWith(links: Array<{ label: string; url: string }>): FakeClient {
  return new FakeClient({ profiles: [{ handle: 'hodan', links }] });
}

function adminWith(meta: Row | null): FakeClient {
  return new FakeClient({ profile_link_meta: [meta] });
}

function contextFor(client: FakeClient): unknown {
  return {
    user: { id: USER_ID },
    appUser: { id: USER_ID, role: 'member', status: 'active' },
    supabase: client,
  };
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  authHolder.ctx = null;
  adminHolder.client = null;
  fetchMock = vi.fn(async () => htmlResponse('<html></html>'));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/me/profile/links/verify/check — the server decides (A7)', () => {
  it('verifies a page that links back AND carries the nonce, stamping verified_at', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    const admin = adminWith({ verification_token: TOKEN });
    adminHolder.client = admin;
    fetchMock.mockResolvedValue(
      htmlResponse(
        `<html><body><a href="https://xidig.test/u/hodan">Xidig</a><p>${TOKEN}</p></body></html>`,
      ),
    );

    const response = await POST(postRequest({ url: PAGE }));
    const body = (await response.json()) as { data: { status: string; checkedAt: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('verified');

    const update = admin.queryFor('profile_link_meta', 1).argsOf('update')?.[0] as Row;
    expect(update['verification_status']).toBe('verified');
    // The CHECK constraint ties the two together; the route must never write
    // one without the other.
    expect(update['verified_at']).toBe(body.data.checkedAt);
  });

  it('accepts the apex spelling of the profile URL, not just APP_URL', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    adminHolder.client = adminWith({ verification_token: TOKEN });
    fetchMock.mockResolvedValue(
      htmlResponse(`<a href="https://xidig.net/u/hodan">me</a><!-- --> ${TOKEN}`),
    );

    const response = await POST(postRequest({ url: PAGE }));
    const body = (await response.json()) as { data: { status: string } };

    expect(body.data.status).toBe('verified');
  });

  it('fails a page that links back but never pasted the nonce', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    const admin = adminWith({ verification_token: TOKEN });
    adminHolder.client = admin;
    fetchMock.mockResolvedValue(htmlResponse('<a href="https://xidig.test/u/hodan">Xidig</a>'));

    const response = await POST(postRequest({ url: PAGE }));
    const body = (await response.json()) as { data: { status: string; reason: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('failed');
    expect(body.data.reason).toBe('token_missing');
    const update = admin.queryFor('profile_link_meta', 1).argsOf('update')?.[0] as Row;
    expect(update['verification_status']).toBe('failed');
    expect(update['verified_at']).toBeNull();
  });

  it('fails a page that merely mentions the profile in prose — a link, not a mention', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    adminHolder.client = adminWith({ verification_token: TOKEN });
    fetchMock.mockResolvedValue(
      htmlResponse(`<p>Find me at https://xidig.test/u/hodan — code ${TOKEN}</p>`),
    );

    const response = await POST(postRequest({ url: PAGE }));
    const body = (await response.json()) as { data: { status: string; reason: string } };

    expect(body.data.status).toBe('failed');
    expect(body.data.reason).toBe('no_link_back');
  });

  it('refuses to dial a private host, and records the check as failed', async () => {
    authHolder.ctx = contextFor(
      callerWith([{ label: 'Metadata', url: 'http://169.254.169.254/latest/' }]),
    );
    const admin = adminWith({ verification_token: TOKEN });
    adminHolder.client = admin;

    const response = await POST(postRequest({ url: 'http://169.254.169.254/latest/' }));
    const body = (await response.json()) as { data: { status: string } };

    expect(body.data.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body that tries to supply its own verdict (strict schema)', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    adminHolder.client = adminWith({ verification_token: TOKEN });

    const response = await POST(postRequest({ url: PAGE, status: 'verified' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s a URL that is not on the caller’s own profile', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    adminHolder.client = adminWith({ verification_token: TOKEN });

    const response = await POST(postRequest({ url: 'https://someone-else.example/' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400s when no nonce was ever issued — there is nothing on the page to find', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: PAGE }]));
    adminHolder.client = adminWith(null);

    const response = await POST(postRequest({ url: PAGE }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a scheme/case variant of the stored link as the same destination', async () => {
    authHolder.ctx = contextFor(callerWith([{ label: 'Site', url: 'http://Hodan.dev/' }]));
    const admin = adminWith({ verification_token: TOKEN });
    adminHolder.client = admin;
    fetchMock.mockResolvedValue(
      htmlResponse(`<a href="https://xidig.test/u/hodan">x</a> ${TOKEN}`),
    );

    const response = await POST(postRequest({ url: 'https://hodan.dev' }));
    const body = (await response.json()) as { data: { urlKey: string; status: string } };

    expect(body.data.status).toBe('verified');
    expect(body.data.urlKey).toBe('hodan.dev');
  });
});
