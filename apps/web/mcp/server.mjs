#!/usr/bin/env node
/**
 * Xidig MCP server (PRD §21) — minimal, dependency-free stdio transport.
 *
 * Speaks newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio transport):
 * `initialize`, `tools/list`, `tools/call`. Tool logic lives in tools.mjs and
 * is reused verbatim — this file is purely the transport. No external agent
 * framework, no SDK: the smallest maintainable entrypoint (per §21 guidance).
 *
 * Config (env):
 *   XIDIG_API_URL   base URL of the Xidig deployment (default http://localhost:3000)
 *   XIDIG_API_KEY   a scoped API key (xdg_...) — its scopes bound what tools can do
 *
 * Run:  XIDIG_API_KEY=xdg_... node apps/web/mcp/server.mjs
 * Or:   pnpm --filter @xidig/web mcp
 */
import { createInterface } from 'node:readline';

import { TOOLS, callTool } from './tools.mjs';

const PROTOCOL_VERSION = '2024-11-05';

const client = {
  apiUrl: process.env.XIDIG_API_URL ?? 'http://localhost:3000',
  apiKey: process.env.XIDIG_API_KEY ?? '',
  fetchImpl: globalThis.fetch,
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(msg) {
  const { id, method, params } = msg;

  // Notifications (no id) never get a response.
  if (id === undefined || id === null) return;

  switch (method) {
    case 'initialize':
      reply(id, {
        protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'xidig-mcp', version: '1.0.0' },
      });
      return;

    case 'ping':
      reply(id, {});
      return;

    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;

    case 'tools/call': {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        const toolResult = await callTool(name, args, client);
        reply(id, toolResult);
      } catch (err) {
        replyError(id, -32603, `Tool execution failed: ${err?.message ?? err}`);
      }
      return;
    }

    default:
      replyError(id, -32601, `Method not found: ${method}`);
  }
}

if (!client.apiKey) {
  process.stderr.write('[xidig-mcp] warning: XIDIG_API_KEY is not set — tool calls will be rejected.\n');
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return; // ignore non-JSON noise
  }
  void handle(msg);
});
