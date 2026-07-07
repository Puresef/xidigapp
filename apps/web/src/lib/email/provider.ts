import { env } from '@/env';

/**
 * Transactional email abstraction. Auth emails are sent by the app (not
 * Supabase SMTP) so link expiry, copy and branding stay under our control.
 *
 * Providers:
 *  - resend:  Resend REST API (PRD §24 recommends Resend or Postmark; the
 *             payload shape below is Resend's — a Postmark adapter is a
 *             ~10-line swap behind this same interface).
 *  - console: logs the email to the server console — the default in
 *             development so magic links are usable without any provider.
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<void>;
}

class ResendProvider implements EmailProvider {
  async send(email: OutgoingEmail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Email provider rejected the send (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}

class ConsoleProvider implements EmailProvider {
  async send(email: OutgoingEmail): Promise<void> {
    console.info(
      `\n━━━ [dev email] ━━━\nTo:      ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n━━━━━━━━━━━━━━━━━━━\n`,
    );
  }
}

export function getEmailProvider(): EmailProvider {
  const mode =
    env.EMAIL_PROVIDER === 'auto'
      ? env.NODE_ENV === 'production'
        ? 'resend'
        : 'console'
      : env.EMAIL_PROVIDER;

  // Fall back to console when Resend is selected but no key is set — logs the
  // link instead of failing every send, so a missing key degrades cleanly.
  if (mode === 'resend' && env.EMAIL_API_KEY) return new ResendProvider();
  return new ConsoleProvider();
}
