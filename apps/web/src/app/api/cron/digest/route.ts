import { env } from '@/env';
import { apiError, apiOk, handleApiError } from '@/lib/api';
import { generateDigest } from '@/lib/digest/generate';
import { sendDigestEmails, type DigestSendSummary } from '@/lib/digest/send';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Weekly digest cron (vercel.json → this route, Mondays). §21: compile the
 * "This week in Xidig" digest as a PINNED Plaza post, idempotent per ISO week,
 * then bulk-email it to opted-in members (extras plan item 6).
 *
 * Auth is the shared CRON_SECRET (Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`). Unset secret = disabled (503), matching the other cron
 * routes. `?dryRun=1` collects candidates + builds the email template WITHOUT
 * pinning a post or emailing anyone (safe manual preview).
 *
 * EMAIL is structurally dark until the channel is live: without EMAIL_API_KEY
 * the loop is skipped entirely (no ledger rows burned on console "sends" in
 * production). Setting EMAIL_PROVIDER=console explicitly opts a dev
 * environment into exercising the full loop against the console provider.
 * Because the send ledger claims per (edition, member), a re-run of the same
 * week resumes where it left off and never double-sends.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EmailStep = DigestSendSummary | { skipped: 'dry_run' | 'email_not_configured' };

export async function GET(request: Request): Promise<Response> {
  try {
    const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
    if (!secret) return apiError('server_error', 503);
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return apiError('forbidden', 401);
    }

    const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
    const admin = getSupabaseAdmin();
    const result = await generateDigest(admin, {
      publish: !dryRun,
      appUrl: env.APP_URL,
    });

    const emailLive = Boolean(env.EMAIL_API_KEY) || env.EMAIL_PROVIDER === 'console';
    let email: EmailStep;
    if (dryRun) {
      email = { skipped: 'dry_run' };
    } else if (!emailLive) {
      email = { skipped: 'email_not_configured' };
    } else {
      email = await sendDigestEmails(admin, {
        edition: result.edition,
        appUrl: env.APP_URL,
      });
    }

    return apiOk({
      periodKey: result.periodKey,
      created: result.created,
      pinnedPostId: result.pinnedPostId,
      emailSubject: result.email.subject,
      email,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
