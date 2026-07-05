import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { env } from '@/env';
import { writeAudit } from '@/lib/audit';
import { SUPPRESSING_EVENTS, verifySvixSignature } from '@/lib/email/webhook';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Delivery-event webhook (Resend → Svix signatures). Hard bounces and
 * complaints land the address on email_suppressions so auth emails stop
 * flowing into a black hole; every suppression is audited and raised in
 * Sentry (a spike = a deliverability incident, see docs/runbook.md).
 *
 * Configure in Resend: Webhooks → endpoint {APP_URL}/api/webhooks/email,
 * events email.bounced + email.complained (others are accepted and ignored),
 * signing secret → EMAIL_WEBHOOK_SECRET.
 */

interface ResendEvent {
  type?: string;
  data?: { to?: string | string[]; email_id?: string };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!env.EMAIL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  const rawBody = await request.text();
  const verified = verifySvixSignature(
    env.EMAIL_WEBHOOK_SECRET,
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    rawBody,
  );
  if (!verified) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const reason = event.type ? SUPPRESSING_EVENTS[event.type] : undefined;
  if (!reason) {
    // Delivered/opened/etc — acknowledged, not stored (no tracking data kept).
    return NextResponse.json({ received: true });
  }

  const recipients = (Array.isArray(event.data?.to) ? event.data.to : [event.data?.to])
    .filter((value): value is string => typeof value === 'string' && value.includes('@'))
    .map((value) => value.toLowerCase());

  const admin = getSupabaseAdmin();
  for (const email of recipients) {
    const { data: existing } = await admin
      .from('email_suppressions')
      .select('event_count')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      await admin
        .from('email_suppressions')
        .update({
          reason,
          source: event.type ?? null,
          event_count: existing.event_count + 1,
          last_event_at: new Date().toISOString(),
          released_at: null, // a fresh bounce re-suppresses a released address
        })
        .eq('email', email);
    } else {
      await admin.from('email_suppressions').insert({
        email,
        reason,
        source: event.type ?? null,
      });
    }

    await writeAudit(admin, {
      actorUserId: null,
      action: `email.suppression.${reason}`,
      metadata: { email, source: event.type ?? 'unknown', emailId: event.data?.email_id ?? null },
    });
    // Deliverability monitoring: each suppression is a Sentry event; alert
    // rules on frequency catch route-level failures (runbook).
    Sentry.captureMessage(`email suppressed (${reason}): ${email}`, 'warning');
  }

  return NextResponse.json({ received: true, suppressed: recipients.length });
}
