import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { env } from '@/env';
import { isLiveStatus } from '@/lib/account-flags';

import { audienceFromEndpoint, buildVapidJwt, type VapidKeys } from './vapid';

/**
 * Server-side Web Push send path (§22 PWA push; §26 push = DMs/mentions/
 * replies). Fails SAFE: when VAPID env is unset the whole thing is a no-op
 * with a single warning — core app never crashes for want of push config
 * (same posture as the email/cron secrets). Never throws: a push must not fail
 * the action that triggered it.
 */

let warnedUnconfigured = false;

function getVapidKeys(): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Whether push can actually be sent — surfaced to the UI so the opt-in toggle can explain itself. */
export function pushConfigured(): boolean {
  return getVapidKeys() !== null;
}

type SendResult = 'ok' | 'gone' | 'error';

async function sendOne(keys: VapidKeys, endpoint: string): Promise<SendResult> {
  try {
    const jwt = buildVapidJwt(keys, audienceFromEndpoint(endpoint));
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
        // Payload-less: no body, no content encoding.
        'Content-Length': '0',
        TTL: '86400',
        Urgency: 'normal',
      },
      signal: AbortSignal.timeout(5000),
    });
    // 404/410 = the subscription is dead (browser dropped it): prune it.
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/**
 * Fan a payload-less push out to every active subscription a user has (they
 * may have installed the PWA on several devices). Prunes endpoints the push
 * service reports as gone (404/410) by flipping `revoked_at`.
 *
 * Recipient must be LIVE (owner ruling, 11 Sep): active or in the §19
 * deletion grace. A suspended, deactivated or deleted recipient — or a
 * missing account row — gets no device push: no subscription is read and no
 * request leaves the server. This is the one device-push boundary (notify()
 * is its only caller, and only reply / mention / new_dm / dm_request push —
 * no lifecycle, appeal or security notice uses push), so the check lives here
 * rather than at each call site. In-app notification rows are unaffected.
 * Deleted accounts' subscriptions are also revoked in the data
 * (20260911000900); suspended/deactivated ones are kept for reinstatement.
 */
export async function sendPushToUser(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const keys = getVapidKeys();
  if (!keys) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        '[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are unset — ' +
          'web push is DISABLED. In-app notifications still work. See docs/runbook.md.',
      );
    }
    return;
  }

  try {
    const { data: recipient, error: recipientError } = await admin
      .from('users')
      .select('status')
      .eq('id', userId)
      .maybeSingle();
    if (recipientError || !recipient || !isLiveStatus(recipient.status)) return;

    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint')
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error || !data || data.length === 0) return;

    const results = await Promise.all(
      data.map(async (sub) => ({ id: sub.id, result: await sendOne(keys, sub.endpoint) })),
    );

    const gone = results.filter((r) => r.result === 'gone').map((r) => r.id);
    if (gone.length > 0) {
      await admin
        .from('push_subscriptions')
        .update({ revoked_at: new Date().toISOString() })
        .in('id', gone);
    }
  } catch (error) {
    console.warn('[push] send failed (non-fatal):', error);
  }
}
