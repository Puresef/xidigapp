/**
 * Legal/about link targets, kept behind one indirection so every consumer
 * (footer, signup terms notice) stays in sync.
 *
 * History: these used to point at the OLD external marketing site
 * (https://xidig.net). Phase A of the front door (docs/front-door-plan.md)
 * moved those pages INTO this app, so the targets are now internal routes —
 * the app no longer links out to the old site anywhere.
 */
export const MARKETING_LINKS = {
  privacy: '/privacy',
  terms: '/terms',
  about: '/about',
  guidelines: '/support/guidelines',
} as const;
