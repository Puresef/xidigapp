import type { MetadataRoute } from 'next';

/**
 * PWA manifest (§22 installable PWA). Icons are the approved Xidig C2 mark in
 * Somali Blue #0077cc — the install / brand-identity anchor:
 *   /favicon.svg           scalable, any purpose
 *   /icon-192,512.png      raster, any purpose (launchers without SVG/maskable)
 *   /icon-maskable-512.png full-bleed on the dawn plate, mark kept inside the
 *                          80% safe zone so adaptive masks never clip the
 *                          wings/star (verified against circle + squircle).
 * theme_color = the mark's Somali Blue (browser/PWA chrome); background_color
 * stays the dawn canvas so the launch splash reads calm, premium, and branded
 * (ruled: install identity = dawn plate; app/marketing = dark-first).
 * The in-app AnimatedMark is still #2e78b0 pending the ruled unification onto
 * #0077cc (docs/brand-direction.md §6 — queued as its own task).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xidig',
    short_name: 'Xidig',
    description: 'Where Somali builders connect, build, and fund — end to end.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f5fa',
    theme_color: '#0077cc',
    icons: [
      { src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  };
}
