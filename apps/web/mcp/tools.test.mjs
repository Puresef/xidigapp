import { describe, expect, it } from 'vitest';

import { TOOLS, callTool, READ_ONLY_TOOLS } from './tools.mjs';

/**
 * MCP tool-handler tests (PRD §21). They lock the tool contract + the security
 * posture: every write goes through the REST API with the bearer key, and REST
 * errors (invalid/expired/insufficient-scope key) surface as MCP tool errors
 * carrying the §27 plain-language message — the MCP layer never forks auth.
 */

/** A fake fetch that records the call and returns a scripted response. */
function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.json ?? {},
    };
  };
  return { impl, calls };
}

const client = (impl) => ({ apiUrl: 'https://x.test', apiKey: 'xdg_test_abc', fetchImpl: impl });

describe('MCP tool catalog', () => {
  it('exposes the five documented tools', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      [
        'xidig_create_or_update_seeded_lab',
        'xidig_create_or_update_seeded_listing',
        'xidig_create_seeded_plaza_post',
        'xidig_get_digest_candidates',
        'xidig_search_listings',
      ].sort(),
    );
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('marks only search + digest as read-only', () => {
    expect(READ_ONLY_TOOLS.has('xidig_search_listings')).toBe(true);
    expect(READ_ONLY_TOOLS.has('xidig_get_digest_candidates')).toBe(true);
    expect(READ_ONLY_TOOLS.has('xidig_create_seeded_plaza_post')).toBe(false);
  });
});

describe('callTool security + dispatch', () => {
  it('rejects when no API key is configured', async () => {
    const res = await callTool('xidig_search_listings', {}, { apiUrl: 'https://x.test', apiKey: '' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('XIDIG_API_KEY');
  });

  it('search_listings issues an authenticated GET with filters', async () => {
    const f = fakeFetch({ ok: true, json: { data: { items: [], nextCursor: null } } });
    const res = await callTool('xidig_search_listings', { city: 'Mogadishu', limit: 5 }, client(f.impl));
    expect(res.isError).toBeUndefined();
    const call = f.calls[0];
    expect(call.url).toContain('/api/external/listings');
    expect(call.url).toContain('city=Mogadishu');
    expect(call.url).toContain('limit=5');
    expect(call.init.method).toBe('GET');
    expect(call.init.headers.authorization).toBe('Bearer xdg_test_abc');
  });

  it('surfaces a REST auth error as an MCP tool error with §27 copy', async () => {
    const f = fakeFetch({
      ok: false,
      status: 401,
      json: { error: { code: 'invalid_api_key', message: "That API key isn't valid." } },
    });
    const res = await callTool('xidig_search_listings', {}, client(f.impl));
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("That API key isn't valid.");
  });

  it('create_seeded_plaza_post POSTs the body with the bearer key', async () => {
    const f = fakeFetch({ ok: true, status: 201, json: { data: { id: 'p1', created: true } } });
    const res = await callTool(
      'xidig_create_seeded_plaza_post',
      { type: 'win', body: 'hi', idempotencyKey: 'k1' },
      client(f.impl),
    );
    expect(res.isError).toBeUndefined();
    const call = f.calls[0];
    expect(call.url).toContain('/api/external/plaza/posts');
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body)).toMatchObject({ type: 'win', body: 'hi', idempotencyKey: 'k1' });
  });

  it('create_or_update_seeded_listing POSTs to create, PATCHes to update', async () => {
    const create = fakeFetch({ ok: true, status: 201, json: { data: { id: 'l1', created: true } } });
    await callTool(
      'xidig_create_or_update_seeded_listing',
      { businessName: 'Demo', category: 'finance' },
      client(create.impl),
    );
    expect(create.calls[0].init.method).toBe('POST');
    expect(create.calls[0].url).toMatch(/\/api\/external\/listings$/);

    const update = fakeFetch({ ok: true, json: { data: { id: 'l1', updated: true } } });
    await callTool(
      'xidig_create_or_update_seeded_listing',
      { listingId: 'l1', city: 'Hargeisa' },
      client(update.impl),
    );
    expect(update.calls[0].init.method).toBe('PATCH');
    expect(update.calls[0].url).toContain('/api/external/listings/l1');
    expect(JSON.parse(update.calls[0].init.body)).not.toHaveProperty('listingId');
  });

  it('unknown tool returns a tool error', async () => {
    const f = fakeFetch({ ok: true, json: {} });
    const res = await callTool('nope', {}, client(f.impl));
    expect(res.isError).toBe(true);
  });
});
