import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';

/**
 * Onboarding-state updates (users.onboarding_state jsonb — a self-service
 * column). Currently: dismissing the §20 set-a-password nudge. The nudge
 * also disappears without dismissal the moment a password exists.
 */

const bodySchema = z.object({
  passwordNudgeDismissed: z.boolean().optional(),
  // §20 first-session checklist: hide the whole card once the member dismisses
  // it (it also auto-hides when every step is done).
  checklistDismissed: z.boolean().optional(),
});

export async function PATCH(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const patch = bodySchema.parse(await request.json());

    const current = (ctx.appUser.onboarding_state ?? {}) as Record<string, unknown>;
    const next = { ...current, ...patch };

    const { error } = await ctx.supabase
      .from('users')
      .update({ onboarding_state: next })
      .eq('id', ctx.appUser.id);
    if (error) throw new Error(`onboarding update failed: ${error.message}`);

    return apiOk({ onboardingState: next });
  } catch (error) {
    return handleApiError(error);
  }
}
