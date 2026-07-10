import { NextResponse } from 'next/server';

/**
 * External API health / metadata (PRD §21). Public (no key) and deliberately
 * boring — it proves the surface is up and advertises the API version + the
 * available scopes, and leaks NO secrets or private config.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): NextResponse {
  return NextResponse.json({
    data: {
      status: 'ok',
      service: 'xidig-external-api',
      version: 'v1',
      scopes: ['read', 'plaza:write', 'listings:write', 'labs:write', 'admin'],
      docs: '/docs/external-api.md',
    },
  });
}
