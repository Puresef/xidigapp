import { z } from 'zod';

import { apiNotice, handleApiError } from '@/lib/api';
import { emailSchema } from '@/lib/auth/identifiers';
import { sendAuthLink } from '@/lib/auth/links';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Magic-link sign-in (10-minute link, §26). The response is identical
 * whether or not the email has an account — no membership enumeration.
 */

const bodySchema = z.object({
  email: emailSchema,
  next: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = bodySchema.parse(await request.json());

    await enforceRateLimit(`ml:ip:${clientIp(request)}`, { max: 10, windowSeconds: 600 });
    await enforceRateLimit(`ml:id:${body.email}`, { max: 3, windowSeconds: 600 });

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('users')
      .select('id, status')
      .eq('email', body.email)
      .maybeSingle();

    // Suspended/deactivated members get the neutral response too — the
    // account-state message belongs on the confirm step, not on an
    // unauthenticated probe.
    if (existing && (existing.status === 'active' || existing.status === 'pending_deletion')) {
      await sendAuthLink(admin, { kind: 'magiclink', email: body.email }, body.next);
    }

    return apiNotice('magic_link_sent');
  } catch (error) {
    return handleApiError(error);
  }
}
