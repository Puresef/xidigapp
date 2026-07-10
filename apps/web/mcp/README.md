# Xidig MCP server (Phase 8, §21)

A minimal, dependency-free [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes safe Xidig tools to external agents. It is a thin transport
over the **external REST API** — every tool call carries a scoped API key and is
validated, scope-checked, rate-limited and audited by the REST layer. The MCP
layer never forks security logic.

## Setup

```bash
# 1. Mint a scoped API key (as a signed-in member) via POST /api/me/api-keys,
#    e.g. scopes ["read","plaza:write","listings:write","labs:write"].
# 2. Run the server (stdio transport):
XIDIG_API_URL=https://app.xidig.net \
XIDIG_API_KEY=xdg_live_xxxxx \
  pnpm --filter @xidig/web mcp
#   (or: node apps/web/mcp/server.mjs)
```

Config (env):

| Var | Default | Meaning |
| --- | ------- | ------- |
| `XIDIG_API_URL` | `http://localhost:3000` | base URL of the Xidig deployment |
| `XIDIG_API_KEY` | — | scoped key; its scopes bound what the tools can do |

### Registering with an MCP client

```jsonc
{
  "mcpServers": {
    "xidig": {
      "command": "node",
      "args": ["apps/web/mcp/server.mjs"],
      "env": { "XIDIG_API_URL": "https://app.xidig.net", "XIDIG_API_KEY": "xdg_live_xxxxx" }
    }
  }
}
```

## Tools

| Tool | REST call | Scope |
| ---- | --------- | ----- |
| `xidig_search_listings` | `GET /api/external/listings` | `read` |
| `xidig_get_digest_candidates` | `GET /api/external/digest/candidates` | `read` |
| `xidig_create_seeded_plaza_post` | `POST /api/external/plaza/posts` | `plaza:write` |
| `xidig_create_or_update_seeded_listing` | `POST` / `PATCH /api/external/listings` | `listings:write` |
| `xidig_create_or_update_seeded_lab` | `POST` / `PATCH /api/external/labs` (Lab **templates**) | `labs:write` |

Write tools are idempotent (pass `idempotencyKey`). `create_or_update` tools
UPDATE when given an id (`listingId` / `playbookId`), otherwise CREATE.

## Example (JSON-RPC over stdio)

```jsonc
// → initialize
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}
// → list tools
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
// → call a tool
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"xidig_search_listings","arguments":{"city":"Mogadishu","limit":5}}}
```

## Errors

A REST failure (invalid/expired/insufficient-scope key, rate limit, validation)
surfaces as an MCP tool result with `isError: true` carrying the §27
plain-language message — the same copy a REST client would get. A missing
`XIDIG_API_KEY` is rejected before any network call.

## Tests

`apps/web/mcp/tools.test.mjs` (run by the root `vitest`) covers the tool catalog,
the auth/error passthrough, and CREATE-vs-UPDATE dispatch with a fake fetch.
