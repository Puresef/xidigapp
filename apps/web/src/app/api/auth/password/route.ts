import { after } from 'next/server';
import { z } from 'zod';

import { ApiError, apiNotice, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { emailSchema } from '@/lib/auth/identifiers';
import { sendAuthLink } from '@/lib/auth/links';
import { validatePassword } from '@/lib/auth/password-policy';
import { clientIp, enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * POST  — "forgot password": email a 60-minute reset link (§27 copy).
 *         Neutral response regardless of account existence.
 * PATCH — set/change the password for the signed-in user (also the recovery
 *         session from the reset link, and the §20 set-a-password nudge).
 */

const resetRequestSchema = z.object({ email: emailSchema });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = resetRequestSchema.parse(await request.json());

    await enforceRateLimit(`pwreset:ip:${clientIp(request)}`, { max: 10, windowSeconds: 3600 });
    await enforceRateLimit(`pwreset:id:${body.email}`, { max: 3, windowSeconds: 3600 });

    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from('users')
      .select('id, status')
      .eq('email', body.email)
      .maybeSingle();

    // after(): off the response path (anti-enumeration — no timing skew).
    if (existing && (existing.status === 'active' || existing.status === 'pending_deletion')) {
      after(async () => {
        try {
          await sendAuthLink(admin, { kind: 'recovery', email: body.email });
        } catch (error) {
          console.error('[auth] recovery link send failed:', error);
        }
      });
    }

    return apiNotice('password_reset_sent');
  } catch (error) {
    return handleApiError(error);
  }
}

const updateSchema = z.object({ password: z.string() });

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const body = updateSchema.parse(await request.json());

    const verdict = await validatePassword(body.password);
    if (!verdict.ok) throw new ApiError(verdict.code, 400);

    const { error } = await ctx.supabase.auth.updateUser({ password: body.password });
    if (error) {
      console.warn('[auth] password update rejected:', error.message);
      // GoTrue's same-password rejection deserves its own §27 copy —
      // "refresh the page" would be actively misleading here.
      if (/different|same/i.test(error.message)) {
        throw new ApiError('password_unchanged', 400);
      }
      throw new ApiError('invalid_request', 400);
    }

    return apiNotice('password_updated');
  } catch (error) {
    return handleApiError(error);
  }
}
