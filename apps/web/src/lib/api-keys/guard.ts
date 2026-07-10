import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError } from '@/lib/api';
import { writeAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

import { touchLastUsed, verifyApiKey, type ApiKeyRow } from './keys';
import { scopeSatisfies, type ApiScope } from './scopes';

/**
 * Scoped API-key authentication for the external REST + MCP layer (PRD §21).
 *
 * `requireApiKey` is the ONE gate every external write/read passes through. It:
 *   1. extracts the key (Authorization: Bearer <key>, or `x-api-key`),
 *   2. verifies it (invalid / revoked / expired → plain-language 401),
 *   3. checks the required scope (insufficient → 403),
 *   4. enforces a per-key rate limit (over → 429),
 *   5. stamps last_used_at (best-effort),
 * and returns a context the route uses to attribute + audit writes. Every
 * outcome — accept or reject — is analytics-tagged (PII-free) so abuse shows up.
 *
 * The default per-key limit is generous for a trusted seeding agent; a key may
 * carry a tighter `rate_limit_per_minute` override. Rate limiting fails OPEN
 * (Upstash unreachable) exactly like the rest of the app.
 */

const DEFAULT_KEY_RATE_PER_MINUTE = 120;

export interface ApiKeyContext {
  keyId: string;
  ownerUserId: string;
  scopes: string[];
  /** Service-role client — external routes never have a user session. */
  admin: SupabaseClient<Database>;
}

/** Pull the raw key from the standard header shapes. */
export function extractApiKey(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const header = request.headers.get('x-api-key');
  return header ? header.trim() : null;
}

function rejectEvent(reason: 'invalid_key' | 'expired' | 'revoked' | 'insufficient_scope' | 'rate_limited') {
  // Anonymous distinct id — a rejected caller has no trusted user identity.
  emitServer(event('external_api_request_rejected', { reason }), { distinctId: 'external-api' });
}

/**
 * Authenticate + authorise an external request. `route` is a STATIC path
 * template used for auditing/analytics (never a concrete URL with ids).
 * Throws the §27-worded ApiError on any failure.
 */
export async function requireApiKey(
  request: Request,
  requiredScope: ApiScope,
  route: string,
): Promise<ApiKeyContext> {
  const admin = getSupabaseAdmin();
  const raw = extractApiKey(request);

  const { status, key } = await verifyApiKey(admin, raw);
  if (status !== 'ok' || !key) {
    if (status === 'expired') {
      rejectEvent('expired');
      throw new ApiError('api_key_expired', 401);
    }
    if (status === 'revoked') {
      rejectEvent('revoked');
      throw new ApiError('invalid_api_key', 401);
    }
    rejectEvent('invalid_key');
    throw new ApiError('invalid_api_key', 401);
  }

  if (!scopeSatisfies(key.scopes, requiredScope)) {
    rejectEvent('insufficient_scope');
    // Attribute the denied attempt (this key is real, just under-scoped).
    await writeAudit(admin, {
      actorUserId: key.owner_user_id,
      apiKeyId: key.id,
      action: `external.denied.${requiredScope}`,
      metadata: { route, reason: 'insufficient_scope' },
    });
    throw new ApiError('insufficient_scope', 403);
  }

  const limit = key.rate_limit_per_minute ?? DEFAULT_KEY_RATE_PER_MINUTE;
  const allowed = await checkRateLimit(`apikey:${key.id}`, { max: limit, windowSeconds: 60 });
  if (!allowed) {
    rejectEvent('rate_limited');
    throw new ApiError('rate_limited', 429);
  }

  void touchLastUsed(admin, key.id);
  emitServer(event('external_api_request_received', { route, scope: requiredScope }), {
    distinctId: key.owner_user_id,
    userId: key.owner_user_id,
  });

  return { keyId: key.id, ownerUserId: key.owner_user_id, scopes: key.scopes, admin };
}

/** Re-export for callers that already hold a verified key row. */
export type { ApiKeyRow };
