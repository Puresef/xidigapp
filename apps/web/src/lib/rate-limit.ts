import { ApiError } from '@/lib/api';
import { env } from '@/env';

/**
 * Fixed-window rate limiter on Upstash Redis REST (§19: edge rate limiting;
 * §26 gives the product-level quotas). Plain fetch against the REST pipeline
 * — no SDK dependency.
 *
 * Fail-open: if Redis is unreachable the request proceeds (Supabase's own
 * auth rate limits remain as the backstop) — sign-in must not die when a
 * cache does. Misconfiguration (a redis:// TCP URL instead of the https REST
 * endpoint) disables limiting with a loud warning.
 */

const restUrl = env.UPSTASH_REDIS_REST_URL;
const restToken = env.UPSTASH_REDIS_REST_TOKEN;
// typeof guard: under SKIP_ENV_VALIDATION (build/tests) env values can be
// undefined — module load must not crash there.
const enabled = typeof restUrl === 'string' && restUrl.startsWith('https://');

let warnedDisabled = false;

export interface RateLimitRule {
  /** Max requests per window. */
  max: number;
  windowSeconds: number;
}

/** Returns true when the request is within limits. */
export async function checkRateLimit(key: string, rule: RateLimitRule): Promise<boolean> {
  if (!enabled) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL is not an https:// REST endpoint — rate limiting is DISABLED. ' +
          'Use the REST URL from the Upstash console (https://<name>.upstash.io), not the redis(s):// TCP URL.',
      );
    }
    return true;
  }

  try {
    const redisKey = `rl:${key}`;
    const res = await fetch(`${restUrl}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${restToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', redisKey],
        ['EXPIRE', redisKey, String(rule.windowSeconds), 'NX'],
      ]),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return true;

    const results = (await res.json()) as Array<{ result?: number; error?: string }>;
    const count = results[0]?.result;
    if (typeof count !== 'number') return true;
    return count <= rule.max;
  } catch {
    return true;
  }
}

/** Throws the §27-worded 429 when over the limit. */
export async function enforceRateLimit(key: string, rule: RateLimitRule): Promise<void> {
  const allowed = await checkRateLimit(key, rule);
  if (!allowed) throw new ApiError('rate_limited', 429);
}

/** Best-effort client IP for per-IP limits (Vercel/proxies set x-forwarded-for). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
