import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

import { ApiError } from '@/lib/api';
import { sendEmailChecked } from '@/lib/email/send';
import type { OutgoingEmail } from '@/lib/email/provider';
import { WEEKLY_DIGEST_TYPE } from '@/lib/notifications/prefs';

import type { DigestCandidates } from './candidates';
import { renderDigestEmail } from './render';

/**
 * Weekly digest BULK email channel (extras plan item 6).
 *
 * Recipients = active human members who are opted into the digest:
 *   * users.status = 'active', users.is_ai = false, email on file;
 *   * user_settings.digest_frequency ≠ 'off' (absent row = the 'weekly'
 *     default — the §26 cadence switch);
 *   * no notification_prefs override turning weekly_digest/email off
 *     (absent row = the §26 default matrix, which has it on).
 * Both knobs live on /settings/notifications — the same page every email
 * links to. Email's lawful basis is these notification preferences, NOT the
 * analytics consent record (deliberately separate systems).
 *
 * Idempotency = the digest_email_sends ledger
 * (20260710060000_digest_email_sends.sql): each recipient is CLAIMED with an
 * `ON CONFLICT (edition_id, user_id) DO NOTHING` upsert BEFORE the provider
 * call, so a re-run — or a concurrent cron fire — can never double-send. A
 * claim whose provider call fails stays 'failed' and is NOT retried
 * automatically (a timeout may still have delivered; never-double-send
 * outranks retry). Suppressed addresses (email_suppressions via
 * sendEmailChecked) are recorded as 'suppressed'.
 *
 * Batching is deliberately conservative: recipients are processed in pages
 * and sent ONE AT A TIME — per-send try/catch isolates failures, and
 * sequential sends stay far inside provider rate limits at alpha scale.
 *
 * The email body renders from the edition's STORED payload (PII-free
 * candidate snapshot), not a fresh collection — so a resumed run sends
 * byte-identical content and the email always matches the pinned post.
 */

/** Page size for both recipient selection and ledger claims. */
const PAGE_SIZE = 200;

export interface DigestRecipient {
  userId: string;
  email: string;
}

export interface DigestSendSummary {
  editionId: string;
  periodKey: string;
  /** Opted-in active members found this run. */
  recipients: number;
  /** Newly claimed in the ledger by this run. */
  claimed: number;
  /** Skipped — a prior/concurrent run already claimed them. */
  alreadyClaimed: number;
  sent: number;
  failed: number;
  suppressed: number;
  /** Set when nothing ran at all. */
  skipped?: 'edition_not_published';
}

/** Injectable for tests; defaults to the suppression-checked house sender. */
export type DigestSendFn = (
  admin: SupabaseClient<Database>,
  email: OutgoingEmail,
) => Promise<void>;

/**
 * All current digest recipients (paged; deterministic id order). Exported for
 * the recipient-selection tests.
 */
export async function selectDigestRecipients(
  admin: SupabaseClient<Database>,
): Promise<DigestRecipient[]> {
  const recipients: DigestRecipient[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await admin
      .from('users')
      .select('id, email')
      .eq('status', 'active')
      .eq('is_ai', false)
      .not('email', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (page.error) throw new Error(`digest recipient query failed: ${page.error.message}`);

    const rows = (page.data ?? []).filter((u): u is { id: string; email: string } =>
      Boolean(u.email),
    );
    if (rows.length > 0) {
      const ids = rows.map((u) => u.id);

      // Opt-outs for this page. Absent rows mean "default" (weekly + email
      // on), so we look for the explicit OFF rows and subtract.
      const [settings, prefs] = await Promise.all([
        admin
          .from('user_settings')
          .select('user_id')
          .in('user_id', ids)
          .eq('digest_frequency', 'off'),
        admin
          .from('notification_prefs')
          .select('user_id')
          .in('user_id', ids)
          .eq('notification_type', WEEKLY_DIGEST_TYPE)
          .eq('channel', 'email')
          .eq('enabled', false),
      ]);
      if (settings.error) {
        throw new Error(`digest settings query failed: ${settings.error.message}`);
      }
      if (prefs.error) throw new Error(`digest prefs query failed: ${prefs.error.message}`);

      const optedOut = new Set<string>([
        ...(settings.data ?? []).map((r) => r.user_id),
        ...(prefs.data ?? []).map((r) => r.user_id),
      ]);

      for (const u of rows) {
        if (!optedOut.has(u.id)) recipients.push({ userId: u.id, email: u.email });
      }
    }

    if ((page.data ?? []).length < PAGE_SIZE) break;
  }

  return recipients;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SendDigestEmailsOptions {
  edition: Tables<'digest_editions'>;
  appUrl: string;
  sendFn?: DigestSendFn;
}

export async function sendDigestEmails(
  admin: SupabaseClient<Database>,
  opts: SendDigestEmailsOptions,
): Promise<DigestSendSummary> {
  const { edition } = opts;
  const sendFn = opts.sendFn ?? sendEmailChecked;

  const summary: DigestSendSummary = {
    editionId: edition.id,
    periodKey: edition.period_key,
    recipients: 0,
    claimed: 0,
    alreadyClaimed: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
  };

  // Dry-run ('generated') editions have no pinned post — email must never get
  // ahead of the in-app surface, so only published editions send.
  if (edition.status !== 'published') {
    summary.skipped = 'edition_not_published';
    return summary;
  }

  const payload = edition.payload as unknown as DigestCandidates | null;
  if (!payload || typeof payload !== 'object' || typeof payload.periodKey !== 'string') {
    throw new Error(`digest edition ${edition.id} has a malformed payload — cannot render email`);
  }
  const template = renderDigestEmail(payload, opts.appUrl);

  const recipients = await selectDigestRecipients(admin);
  summary.recipients = recipients.length;

  for (const batch of chunk(recipients, PAGE_SIZE)) {
    // Claim BEFORE sending. ignoreDuplicates → ON CONFLICT DO NOTHING; the
    // returned rows are exactly the claims this run won.
    const claim = await admin
      .from('digest_email_sends')
      .upsert(
        batch.map((r) => ({ edition_id: edition.id, user_id: r.userId, email: r.email })),
        { onConflict: 'edition_id,user_id', ignoreDuplicates: true },
      )
      .select('id, user_id, email');
    if (claim.error) throw new Error(`digest send claim failed: ${claim.error.message}`);

    const claimed = claim.data ?? [];
    summary.claimed += claimed.length;
    summary.alreadyClaimed += batch.length - claimed.length;

    for (const row of claimed) {
      let status: 'sent' | 'failed' | 'suppressed' = 'sent';
      let errorText: string | null = null;

      try {
        await sendFn(admin, {
          to: row.email,
          subject: template.subject,
          text: template.text,
          html: template.html,
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'email_undeliverable') {
          status = 'suppressed';
        } else {
          status = 'failed';
          errorText = (error instanceof Error ? error.message : String(error)).slice(0, 300);
        }
      }

      summary[status] += 1;

      // Best-effort bookkeeping: the row is already claimed, so even a lost
      // status update can never cause a double-send on the next run.
      const update = await admin
        .from('digest_email_sends')
        .update({
          status,
          error: errorText,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', row.id);
      if (update.error) {
        console.warn(
          `[digest] send ledger update failed for ${row.id} (${status}): ${update.error.message}`,
        );
      }
    }
  }

  return summary;
}
