/**
 * Links to the public marketing site (xidig.net) — a separate, live property,
 * not part of this app (see memory: xidig-net-live-site-status). The app
 * (app.xidig.net) and the marketing site form one experience: legal pages and
 * the About page live on xidig.net, so the app links out to them rather than
 * duplicating the content.
 *
 * Centralised here so the footer, the signup terms notice, and any future
 * caller stay in sync if the marketing site's URL scheme changes.
 */
const MARKETING_ORIGIN = 'https://xidig.net';

export const MARKETING_LINKS = {
  privacy: `${MARKETING_ORIGIN}/privacy`,
  terms: `${MARKETING_ORIGIN}/terms`,
  about: `${MARKETING_ORIGIN}/about`,
} as const;
