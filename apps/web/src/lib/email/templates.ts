import type { OutgoingEmail } from './provider';

/**
 * Auth email copy. Same plain-language rules as §27: what this is · why you
 * got it · what to do. Every email states its expiry so the §27 expired-link
 * errors never surprise anyone.
 */

function withHtml(text: string, actionUrl: string, actionLabel: string): string {
  const paragraphs = text
    .trim()
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-weight:700;font-size:18px;margin:0 0 24px">Xidig</p>
  ${paragraphs}
  <p style="margin:24px 0"><a href="${actionUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${actionLabel}</a></p>
  <p style="color:#777;font-size:13px;line-height:1.5">If the button doesn't work, copy this link into your browser:<br/>${actionUrl}</p>
</body></html>`;
}

export function magicLinkEmail(to: string, link: string): OutgoingEmail {
  const text = `Here's your sign-in link for Xidig.\n\nIt's valid for 10 minutes and works once. If you didn't request it, you can safely ignore this email — nobody can sign in without it.\n\nSign in: ${link}`;
  return {
    to,
    subject: 'Your Xidig sign-in link',
    text,
    html: withHtml(text, link, 'Sign in to Xidig'),
  };
}

export function signupConfirmEmail(to: string, link: string): OutgoingEmail {
  const text = `Welcome to Xidig! One step left: confirm your email so we know it's really yours.\n\nThis link is valid for 10 minutes. If it expires, just request a fresh sign-in link — we'll confirm you on the way in.\n\nConfirm your email: ${link}`;
  return {
    to,
    subject: 'Confirm your email · Xidig',
    text,
    html: withHtml(text, link, 'Confirm my email'),
  };
}

export function passwordResetEmail(to: string, link: string): OutgoingEmail {
  const text = `Someone (hopefully you) asked to reset the password on your Xidig account.\n\nThis link is valid for 60 minutes. If you didn't ask for it, ignore this email — your password stays as it is.\n\nReset your password: ${link}`;
  return {
    to,
    subject: 'Reset your Xidig password',
    text,
    html: withHtml(text, link, 'Reset my password'),
  };
}

export function emailChangeEmail(to: string, link: string): OutgoingEmail {
  const text = `You asked to use this email address for your Xidig account.\n\nConfirm it within 10 minutes to finish linking it. If this wasn't you, ignore this email and nothing changes.\n\nConfirm this email: ${link}`;
  return {
    to,
    subject: 'Confirm your new email · Xidig',
    text,
    html: withHtml(text, link, 'Confirm this email'),
  };
}

export function inviteEmail(to: string, code: string, signupUrl: string): OutgoingEmail {
  const text = `Good news — a spot opened up for you on Xidig, the platform where Somali builders connect, build, and fund ventures together.\n\nYour invite code: ${code}\n\nUse it to create your account. The code is single-use and yours alone.\n\nJoin Xidig: ${signupUrl}`;
  return {
    to,
    subject: "You're invited to Xidig 🎉",
    text,
    html: withHtml(text, signupUrl, 'Create my account'),
  };
}
