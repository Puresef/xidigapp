import { z } from 'zod';

import { apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_VERSION,
  serializeConsentCookie,
  type ConsentCategory,
} from '@/lib/consent/model';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Record the member's consent choices (§12 — banner + Settings › Data).
 *
 * Semantics per category (schema: grant = active row, decline = absence):
 *   - grant, no active row            → insert at CONSENT_VERSION
 *   - grant, active row @ old version → withdraw it, insert a fresh row
 *     (a stale-version row must not keep the banner re-appearing)
 *   - grant, active row @ current     → no-op (idempotent)
 *   - decline                         → withdraw any active rows
 *
 * Writes go through the service-role client: the Phase-1 RLS self-insert
 * grant predates 'error_monitoring' (it covers cookies/analytics only), and
 * withdrawals are updates members have no policy for. requireUser() is the
 * gate; every statement is scoped to ctx.appUser.id.
 *
 * The response always (re)sets the `xidig_consent` cookie — the fast path the
 * layout and instrumentation-client.ts read. Deliberately NOT httpOnly.
 */

const bodySchema = z.object({
  analytics: z.boolean(),
  errorMonitoring: z.boolean(),
  method: z.enum(['banner', 'settings']),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const body = bodySchema.parse(await request.json());

    const admin = getSupabaseAdmin();
    // Stored vocabulary follows the schema comment ('signup' | 'settings' |
    // 'cookie_banner'); the API keeps the shorter 'banner'.
    const method = body.method === 'banner' ? 'cookie_banner' : 'settings';

    const choices: { type: ConsentCategory; granted: boolean }[] = [
      { type: 'analytics', granted: body.analytics },
      { type: 'error_monitoring', granted: body.errorMonitoring },
    ];

    for (const { type, granted } of choices) {
      if (granted) {
        // The partial unique index guarantees at most one active row.
        const { data: active, error: readError } = await admin
          .from('consent_records')
          .select('id, version')
          .eq('user_id', ctx.appUser.id)
          .eq('consent_type', type)
          .is('withdrawn_at', null)
          .maybeSingle();
        if (readError) throw new Error(`consent read failed: ${readError.message}`);
        if (active?.version === CONSENT_VERSION) continue;

        if (active) {
          const { error } = await admin
            .from('consent_records')
            .update({ withdrawn_at: new Date().toISOString() })
            .eq('id', active.id);
          if (error) throw new Error(`consent supersede failed: ${error.message}`);
        }
        const { error: insertError } = await admin.from('consent_records').insert({
          user_id: ctx.appUser.id,
          consent_type: type,
          version: CONSENT_VERSION,
          method,
        });
        // 23505 = a concurrent grant already produced the active row — that
        // is the state we wanted.
        if (insertError && insertError.code !== '23505') {
          throw new Error(`consent insert failed: ${insertError.message}`);
        }
      } else {
        const { error } = await admin
          .from('consent_records')
          .update({ withdrawn_at: new Date().toISOString() })
          .eq('user_id', ctx.appUser.id)
          .eq('consent_type', type)
          .is('withdrawn_at', null);
        if (error) throw new Error(`consent withdraw failed: ${error.message}`);
      }
    }

    const response = apiOk({ analytics: body.analytics, errorMonitoring: body.errorMonitoring });
    response.cookies.set(
      CONSENT_COOKIE,
      serializeConsentCookie({
        version: CONSENT_VERSION,
        analytics: body.analytics,
        errorMonitoring: body.errorMonitoring,
      }),
      {
        path: '/',
        maxAge: CONSENT_COOKIE_MAX_AGE,
        sameSite: 'lax',
        // NOT httpOnly: instrumentation-client.ts must read the e-flag before
        // loading Sentry replay. The cookie carries only the member's own
        // choice; server capture stays gated by consent_records regardless.
        httpOnly: false,
      },
    );
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
