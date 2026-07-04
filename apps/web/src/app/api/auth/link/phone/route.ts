import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { normalizePhone } from '@/lib/auth/identifiers';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Link (or change) the phone on the signed-in account. Verification-first:
 * GoTrue's phone_change flow texts an OTP to the NEW number; nothing changes
 * until it's verified via /api/auth/otp/verify with type 'phone_change'.
 */

const bodySchema = z.object({ phone: z.string().trim().min(4) });

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const body = bodySchema.parse(await request.json());

    const phone = normalizePhone(body.phone);
    if (!phone) throw new ApiError('phone_invalid', 400);

    await enforceRateLimit(`linkphone:${ctx.appUser.id}`, { max: 3, windowSeconds: 3600 });

    const admin = getSupabaseAdmin();
    const { data: taken } = await admin
      .from('users')
      .select('id')
      .eq('phone', phone)
      .neq('id', ctx.appUser.id)
      .maybeSingle();
    if (taken) throw new ApiError('phone_taken', 409);

    const { error } = await ctx.supabase.auth.updateUser({ phone });
    if (error) {
      console.error('[auth] phone_change OTP send failed:', error.message);
      throw new ApiError('sms_unavailable', 503);
    }

    return apiOk({ pendingPhone: phone });
  } catch (error) {
    return handleApiError(error);
  }
}
