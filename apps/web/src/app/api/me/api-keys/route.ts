import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { apiKeyCreateSchema } from '@/lib/api-keys/schemas';
import { listApiKeys, mintApiKey } from '@/lib/api-keys/keys';
import { ALL_SCOPES, MEMBER_MINTABLE_SCOPES, type ApiScope } from '@/lib/api-keys/scopes';
import { requireUser } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Self-service API-key management (PRD §21).
 *
 * A member mints keys for external agents/integrations they run. The scope
 * allowlist depends on role: a plain member may attach the non-privileged
 * scopes only — the `admin` (system) scope is admin-mintable ONLY, so a member
 * can never create an admin-equivalent key. Keys are stored hashed; the
 * plaintext value is returned exactly once here and never again.
 */

// Node runtime: key generation/hashing uses node:crypto.
export const runtime = 'nodejs';

const CREATE_LIMIT = { max: 10, windowSeconds: 86_400 }; // 10 new keys/day/member

export async function GET(): Promise<Response> {
  try {
    const ctx = await requireUser();
    const keys = await listApiKeys(getSupabaseAdmin(), ctx.appUser.id);
    return apiOk({ keys });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = apiKeyCreateSchema.parse(await request.json());

    const isAdmin = ctx.appUser.role === 'admin';
    const allowed: ApiScope[] = isAdmin ? ALL_SCOPES : MEMBER_MINTABLE_SCOPES;
    const scopes = [...new Set(input.scopes)] as ApiScope[];
    // A member requesting `admin` (or any non-allowed scope) is forbidden — the
    // guard that a member cannot mint an admin-equivalent key.
    if (!scopes.every((s) => allowed.includes(s))) throw new ApiError('forbidden', 403);

    const allowedToCreate = await checkRateLimit(`apikeys:create:${ctx.appUser.id}`, CREATE_LIMIT);
    if (!allowedToCreate) throw new ApiError('rate_limited', 429);

    const admin = getSupabaseAdmin();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      : null;

    const { view, raw } = await mintApiKey(admin, {
      ownerUserId: ctx.appUser.id,
      name: input.name,
      scopes,
      expiresAt,
    });

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'api_key.created',
      targetType: 'api_key',
      targetId: view.id,
      metadata: { scope_count: scopes.length },
    });
    emitServer(event('external_api_key_created', { scope_count: scopes.length }), {
      distinctId: ctx.appUser.id,
      userId: ctx.appUser.id,
    });

    // `secret` is the plaintext key — shown ONCE, never retrievable again.
    return apiOk({ key: view, secret: raw }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = 'force-dynamic';
