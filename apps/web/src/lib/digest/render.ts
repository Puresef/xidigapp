import type { DigestCandidates } from './candidates';

/**
 * Render the weekly digest into a Plaza post body + an email template (PRD §21).
 *
 * Deterministic and PII-free: the output references public content by title +
 * link only. The copy carries a bilingual header and an explicit AI-assisted
 * note (the post is authored by the badged AI account and additionally rendered
 * with the "AI-assisted" chip).
 *
 * The EMAIL variant follows the house transactional style
 * (lib/email/templates.ts: plain text + a small hand-rolled HTML document, no
 * react-email dependency) and ALWAYS carries a manage-preferences footer
 * pointing at /settings/notifications — the digest is a bulk channel, so the
 * way out must be one tap from every send. English with the bilingual header,
 * same as the pinned post (localized transactional email is future work, see
 * lib/email/templates.ts).
 */

export interface DigestEmailTemplate {
  subject: string;
  text: string;
  html: string;
}

function postLink(appUrl: string, id: string): string {
  return `${appUrl.replace(/\/$/, '')}/p/${id}`;
}
function labLink(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/$/, '')}/labs/${slug}`;
}
function eventLink(appUrl: string, slug: string): string {
  return `${appUrl.replace(/\/$/, '')}/events/${slug}`;
}

/** 2026-07-18 — the date part of an ISO timestamp (deterministic, TZ-free). */
function eventDate(startsAt: string): string {
  return startsAt.slice(0, 10);
}

export function renderDigestPost(c: DigestCandidates): { title: string; body: string } {
  const lines: string[] = [];
  lines.push('This week in Xidig · Toddobaadkan Xidig');
  lines.push('');

  if (c.wins.length > 0) {
    lines.push('🏆 Top Wins');
    for (const w of c.wins) lines.push(`• ${w.title ?? 'Untitled Win'}`);
    lines.push('');
  }
  if (c.openAsks.length > 0) {
    lines.push('🙋 Open Asks (help wanted)');
    for (const a of c.openAsks) lines.push(`• ${a.title ?? 'Untitled Ask'}`);
    lines.push('');
  }
  if (c.newLabs.length > 0) {
    lines.push('🧪 New Labs');
    for (const l of c.newLabs) lines.push(`• ${l.name}`);
    lines.push('');
  }
  if (c.newListings.length > 0) {
    lines.push('🏪 New listings');
    for (const l of c.newListings) lines.push(`• ${l.name}${l.city ? ` — ${l.city}` : ''}`);
    lines.push('');
  }
  if ((c.upcomingEvents ?? []).length > 0) {
    lines.push('📅 Upcoming events');
    for (const e of c.upcomingEvents ?? []) lines.push(`• ${e.title} — ${eventDate(e.startsAt)}`);
    lines.push('');
  }
  if (c.mentor) {
    lines.push(`🎓 Mentor-in-Residence${c.mentor.focus ? `: ${c.mentor.focus}` : ''}`);
    lines.push('');
  }
  if (
    c.wins.length +
      c.openAsks.length +
      c.newLabs.length +
      c.newListings.length +
      (c.upcomingEvents ?? []).length ===
    0
  ) {
    lines.push('A quiet week — post a Win, open an Ask, or start a Lab to fill next week’s digest.');
    lines.push('');
  }

  lines.push('— Compiled by Xidig AI (AI-assisted).');

  return { title: `This week in Xidig — ${c.periodKey}`, body: lines.join('\n') };
}

/** Where every digest email sends members to change their mind. */
export function managePrefsLink(appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/settings/notifications`;
}

export function renderDigestEmail(c: DigestCandidates, appUrl: string): DigestEmailTemplate {
  const { title, body } = renderDigestPost(c);
  const prefsUrl = managePrefsLink(appUrl);

  const text = `${body}\n\n—\nYou get this weekly digest as a Xidig member.\nManage email preferences: ${prefsUrl}`;

  const htmlSection = (heading: string, items: string[]): string =>
    items.length === 0
      ? ''
      : `<h3 style="margin:16px 0 4px">${heading}</h3><ul style="margin:0 0 8px;padding-left:20px;line-height:1.6">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:32px 20px">
  <p style="font-weight:700;font-size:18px;margin:0 0 2px">Xidig</p>
  <p style="color:#777;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 24px">Weekly digest · Warbixin toddobaadle</p>
  <h2 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h2>
  ${htmlSection('🏆 Top Wins', c.wins.map((w) => escapeHtml(w.title ?? 'Untitled Win')))}
  ${htmlSection(
    '🙋 Open Asks',
    c.openAsks.map((a) => `<a href="${postLink(appUrl, a.id)}">${escapeHtml(a.title ?? 'Ask')}</a>`),
  )}
  ${htmlSection(
    '🧪 New Labs',
    c.newLabs.map((l) => `<a href="${labLink(appUrl, l.slug)}">${escapeHtml(l.name)}</a>`),
  )}
  ${htmlSection(
    '🏪 New listings',
    c.newListings.map((l) => `${escapeHtml(l.name)}${l.city ? ` — ${escapeHtml(l.city)}` : ''}`),
  )}
  ${htmlSection(
    '📅 Upcoming events',
    (c.upcomingEvents ?? []).map(
      (e) => `<a href="${eventLink(appUrl, e.slug)}">${escapeHtml(e.title)}</a> — ${eventDate(e.startsAt)}`,
    ),
  )}
  ${c.mentor ? `<p>🎓 Mentor-in-Residence${c.mentor.focus ? `: ${escapeHtml(c.mentor.focus)}` : ''}</p>` : ''}
  <p style="color:#888;font-size:12px">Compiled by Xidig AI (AI-assisted).</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"/>
  <p style="color:#777;font-size:13px;line-height:1.5">You get this weekly digest as a Xidig member.<br/><a href="${prefsUrl}">Manage email preferences</a></p>
</body></html>`;

  return { subject: title, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
