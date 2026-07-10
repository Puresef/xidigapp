import { z } from 'zod';

import { env } from '@/env';
import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { sendEmailChecked } from '@/lib/email/send';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Front-door contact intake (docs/front-door-plan.md §3) — the working-form
 * successor to the old site's Resend handler, routed through the app's own
 * email provider so it degrades to console in dev and fails safely (503 +
 * waitlist CTA) when CONTACT_INBOX is unset. No table, no PII at rest: the
 * message is forwarded, not stored.
 */

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  contact: z.string().trim().min(3).max(254),
  message: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(`contact:ip:${clientIp(request)}`, { max: 5, windowSeconds: 3600 });

    if (!env.CONTACT_INBOX) throw new ApiError('contact_unavailable', 503);

    const body = bodySchema.parse(await request.json());

    await sendEmailChecked(getSupabaseAdmin(), {
      to: env.CONTACT_INBOX,
      subject: `[xidig contact] ${body.name}`,
      text: `From: ${body.name}\nReach them at: ${body.contact}\n\n${body.message}`,
    });

    return apiNotice('contact_sent');
  } catch (error) {
    return handleApiError(error);
  }
}
