/**
 * Xidig MCP tools (PRD §21).
 *
 * Thin, safe wrappers over the SAME external REST API the app already exposes,
 * authenticated with a scoped API key. Nothing here forks validation, scope,
 * rate-limit or audit logic — every call goes through the REST route, which
 * enforces all of it server-side. That keeps the MCP surface honest: an MCP
 * tool can never do more than its key's scopes allow.
 *
 * Pure + transport-agnostic: `callTool` takes an injected client
 * ({ apiUrl, apiKey, fetchImpl }) so it is unit-testable without stdio or a
 * live server.
 */

/** MCP tool definitions (name, description, JSON-Schema input). */
export const TOOLS = [
  {
    name: 'xidig_search_listings',
    description:
      'Search the public Xidig business directory. Deterministic (newest first), member/public-visible fields only — no private contacts. Requires the `read` scope.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        city: { type: 'string', description: 'Filter by city (exact, case-insensitive)' },
        country: { type: 'string', description: 'Filter by country' },
        category: { type: 'string', description: 'listing_categories slug (e.g. finance)' },
        tag: { type: 'string', description: 'Tag name (e.g. fintech)' },
        limit: { type: 'number', description: 'Page size (1-50, default 20)' },
        cursor: { type: 'string', description: 'Opaque pagination cursor' },
      },
    },
  },
  {
    name: 'xidig_create_seeded_plaza_post',
    description:
      'Create a labelled seeded/AI Plaza post authored by the badged AI account. Idempotent (pass idempotencyKey). Requires the `plaza:write` scope.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'body'],
      properties: {
        type: { type: 'string', enum: ['intro', 'ask', 'win', 'update'] },
        title: { type: 'string' },
        body: { type: 'string' },
        linkUrl: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Existing tag names' },
        source: { type: 'string', enum: ['seed', 'ai'], description: 'Content label (default seed)' },
        idempotencyKey: { type: 'string' },
      },
    },
  },
  {
    name: 'xidig_create_or_update_seeded_listing',
    description:
      'Create a labelled seeded (unclaimed) business listing, or update one by id. Requires the `listings:write` scope. Only seeded listings can be updated — never a real member listing.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        listingId: { type: 'string', description: 'If set, UPDATE this seeded listing instead of creating' },
        businessName: { type: 'string' },
        category: { type: 'string', description: 'listing_categories slug' },
        shortDescription: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        landmark: { type: 'string' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string', enum: ['seed', 'ai'] },
        idempotencyKey: { type: 'string' },
      },
    },
  },
  {
    name: 'xidig_create_or_update_seeded_lab',
    description:
      'Create or update a seeded Lab TEMPLATE (charter playbook), the §21 "Lab templates" seed target — NOT a live Lab (creating live Labs via API is deferred). Requires the `labs:write` scope.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        playbookId: { type: 'string', description: 'If set, UPDATE this template instead of creating' },
        slug: { type: 'string', description: 'Template slug (create)' },
        name: { type: 'string' },
        ventureType: { type: 'string' },
        template: { type: 'object', description: 'Charter starter fields' },
        isActive: { type: 'boolean' },
        source: { type: 'string', enum: ['seed', 'ai'] },
      },
    },
  },
  {
    name: 'xidig_get_digest_candidates',
    description:
      'Get the deterministic weekly-digest candidates (top Wins, open Asks, new public Labs, new listings, mentor highlight). Visibility-safe, PII-free, no personalization. Requires the `read` scope.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
];

const READ = new Set(['xidig_search_listings', 'xidig_get_digest_candidates']);

/** Perform an authenticated request to the external REST API. */
async function apiRequest(client, method, path, { query, body } = {}) {
  const url = new URL(`${client.apiUrl.replace(/\/$/, '')}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await client.fetchImpl(url.toString(), {
    method,
    headers: {
      authorization: `Bearer ${client.apiKey}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** Shape a tool result; REST errors surface as MCP tool errors with §27 copy. */
function result(payload, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function fromResponse({ ok, status, json }) {
  if (ok) return result(json.data ?? json);
  // Plain-language error copy comes straight from the REST envelope (§27).
  const message = json?.error?.message ?? `Request failed (${status})`;
  return result({ error: json?.error?.code ?? 'request_failed', message, status }, true);
}

/**
 * Dispatch a tool call. `client` = { apiUrl, apiKey, fetchImpl }.
 * Returns an MCP tool result ({ content, isError? }).
 */
export async function callTool(name, args = {}, client) {
  if (!client?.apiKey) {
    return result({ error: 'no_api_key', message: 'XIDIG_API_KEY is not set for the MCP server.' }, true);
  }

  switch (name) {
    case 'xidig_search_listings':
      return fromResponse(
        await apiRequest(client, 'GET', '/api/external/listings', {
          query: {
            city: args.city,
            country: args.country,
            category: args.category,
            tag: args.tag,
            limit: args.limit,
            cursor: args.cursor,
          },
        }),
      );

    case 'xidig_get_digest_candidates':
      return fromResponse(await apiRequest(client, 'GET', '/api/external/digest/candidates'));

    case 'xidig_create_seeded_plaza_post':
      return fromResponse(
        await apiRequest(client, 'POST', '/api/external/plaza/posts', { body: args }),
      );

    case 'xidig_create_or_update_seeded_listing': {
      if (args.listingId) {
        const { listingId, ...patch } = args;
        return fromResponse(
          await apiRequest(client, 'PATCH', `/api/external/listings/${listingId}`, { body: patch }),
        );
      }
      return fromResponse(await apiRequest(client, 'POST', '/api/external/listings', { body: args }));
    }

    case 'xidig_create_or_update_seeded_lab': {
      if (args.playbookId) {
        const { playbookId, ...patch } = args;
        return fromResponse(
          await apiRequest(client, 'PATCH', `/api/external/labs/${playbookId}`, { body: patch }),
        );
      }
      return fromResponse(await apiRequest(client, 'POST', '/api/external/labs', { body: args }));
    }

    default:
      return result({ error: 'unknown_tool', message: `No such tool: ${name}` }, true);
  }
}

/** Exposed for docs/tests: which tools only read. */
export const READ_ONLY_TOOLS = READ;
