import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { event, isClientEventName, type AnalyticsEventMap } from '@/lib/analytics/events';
import { captureServer, distinctIdFor } from '@/lib/analytics/server';
import { getAuthContext } from '@/lib/auth/guards';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';

/**
 * First-party analytics ingest for browser-originated events (§23). Keeps the
 * PostHog key server-side and routes every client event through the same
 * no-PII guard as server emissions. Only the whitelisted CLIENT_EVENT_NAMES
 * are accepted; anything else is silently OK'd (never leak taxonomy shape to
 * a probe) but not forwarded.
 *
 * distinct_id: the signed-in user when there is a session, else the browser's
 * anonymous id — so pre-signup funnel steps (map_view before an account)
 * still stitch to the same person post-signup via PostHog identify.
 */

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
  anonymousId: z.string().uuid().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(`analytics:ip:${clientIp(request)}`, { max: 120, windowSeconds: 60 });

    const body = bodySchema.parse(await request.json());

    // Unknown / server-only event names are accepted but dropped — the client
    // cannot forge server-owned events (signup_completed, badge_awarded, …).
    if (!isClientEventName(body.name)) {
      return apiOk({ accepted: false });
    }

    const ctx = await getAuthContext();
    const distinctId = distinctIdFor(ctx?.appUser.id, body.anonymousId);

    // captureServer re-guards properties for PII AND consent-gates on userId
    // before anything leaves the process. Anonymous callers (no session) have
    // no consent record → the event is dropped (default-deny) until an
    // anonymous/cookie-consent mechanism exists.
    await captureServer(event(body.name, body.properties as AnalyticsEventMap[typeof body.name]), {
      distinctId,
      userId: ctx?.appUser.id ?? null,
    });

    return apiOk({ accepted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
