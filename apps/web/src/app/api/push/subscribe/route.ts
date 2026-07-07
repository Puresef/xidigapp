import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { pushConfigured } from '@/lib/push/send';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Web Push subscription registration (§22 PWA push). The browser's
 * PushSubscription (endpoint + p256dh/auth keys) is stored per device so the
 * server can send to it. API-only (push_subscriptions writes are revoked for
 * clients); the row is private to the owner (push_subscriptions_select_own).
 *
 *   POST   — register/refresh a subscription (idempotent on the unique endpoint).
 *   DELETE — revoke a subscription (on logout / toggle off).
 */

const subscribeSchema = z.object({
  endpoint: z.string().min(1).max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
  userAgent: z.string().max(400).optional(),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = subscribeSchema.parse(await request.json());

    const admin = getSupabaseAdmin();

    // `endpoint` is globally UNIQUE, and this upsert runs as the service role
    // (RLS bypassed). Without this guard, any authenticated caller who learned
    // another member's endpoint could POST it and hijack their row (upsert on
    // the endpoint conflict rewrites user_id to the caller) — silently denying
    // that member's pushes and buzzing their device for the caller's activity.
    // So: never take over an endpoint that currently belongs to a DIFFERENT,
    // non-revoked user. A revoked row (previous owner turned push off / logged
    // out on a shared device) is reclaimable.
    const { data: existing } = await admin
      .from('push_subscriptions')
      .select('user_id, revoked_at')
      .eq('endpoint', input.endpoint)
      .maybeSingle();
    if (existing && existing.user_id !== ctx.appUser.id && existing.revoked_at === null) {
      return apiOk({ subscribed: false, deliverable: pushConfigured() });
    }

    const { error } = await admin.from('push_subscriptions').upsert(
      {
        user_id: ctx.appUser.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: input.userAgent ?? null,
        last_used_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'endpoint' },
    );
    if (error) throw new Error(`push subscribe failed: ${error.message}`);

    // Report whether the SERVER can actually send (VAPID configured) so the UI
    // can explain a disabled state instead of silently doing nothing.
    return apiOk({ subscribed: true, deliverable: pushConfigured() }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { endpoint } = unsubscribeSchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', ctx.appUser.id)
      .eq('endpoint', endpoint);
    if (error) throw new Error(`push unsubscribe failed: ${error.message}`);

    return apiOk({ subscribed: false });
  } catch (error) {
    return handleApiError(error);
  }
}
