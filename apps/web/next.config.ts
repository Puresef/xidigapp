import { withSentryConfig, type SentryBuildOptions } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the workspace packages from their TypeScript source instead of
  // requiring a separate build step.
  transpilePackages: ['@xidig/db', '@xidig/ui'],
  // 301 map from the OLD xidig.net marketing site (docs/front-door-plan.md §3).
  // Path-only and host-agnostic: inert while this deployment serves
  // app.xidig.net (none of these routes exist here), live the moment the apex
  // points at the app. The host-level app.xidig.net → xidig.net 308 is
  // deliberately NOT staged here — deployed early it would redirect all
  // product traffic to the old site; it ships env-gated at cutover step 7.
  // /reports/[slug] needs no entries: slugs are frozen and port 1:1.
  async redirects() {
    return [
      { source: '/how-it-works', destination: '/product', permanent: true },
      { source: '/vision', destination: '/about', permanent: true },
      { source: '/investment-guide', destination: '/about', permanent: true },
      { source: '/public-fund', destination: '/about', permanent: true },
      { source: '/ventures', destination: '/capital', permanent: true },
      { source: '/submit-project', destination: '/capital', permanent: true },
      { source: '/membership-tiers', destination: '/membership', permanent: true },
      // Business lane parks on /contact until the thin-but-real /business
      // page ships in Phase B — re-point these three then.
      { source: '/business-network', destination: '/contact', permanent: true },
      { source: '/partnerships', destination: '/contact', permanent: true },
      { source: '/business-enquiries', destination: '/contact', permanent: true },
      { source: '/community-guidelines', destination: '/support/guidelines', permanent: true },
      { source: '/coming-soon', destination: '/waitlist', permanent: true },
      { source: '/newsletter', destination: '/waitlist', permanent: true },
      // /events is a REAL app surface now (10 Jul) — only the OLD site's four
      // fabricated event slugs redirect; the live index/detail pages own the
      // rest of the namespace.
      { source: '/events/future-of-somali-energy', destination: '/waitlist', permanent: true },
      { source: '/events/early-members-connect-london', destination: '/waitlist', permanent: true },
      { source: '/events/mogadishu-launch-party', destination: '/waitlist', permanent: true },
      { source: '/events/agritech-summit-minneapolis', destination: '/waitlist', permanent: true },
      // Roles are appointed from within the membership — /about owns that
      // story (locked decision; reintroduce /careers only with real roles).
      { source: '/careers', destination: '/about', permanent: true },
      { source: '/contributor-roles', destination: '/about', permanent: true },
      // Explicit equity write-off: thin fabricated pages with no topical
      // survivor — accepted soft-404 treatment, not pretended preservation.
      { source: '/community', destination: '/', permanent: true },
      { source: '/social-hub', destination: '/', permanent: true },
    ];
  },
  // Security response headers (live-site test hardening, 11 Jul). Vercel
  // already sends HSTS at the edge; these add the browser-side defences the
  // app was missing. A full script-src CSP is deliberately deferred: it needs
  // nonce plumbing for the inline THEME_INIT_SCRIPT (layout.tsx) plus source
  // lists for Sentry/Supabase/MapTiler — `frame-ancestors` alone is safe to
  // ship now and, with X-Frame-Options, closes the clickjacking gap.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // No code path uses these device APIs today (verified: zero
          // getUserMedia/geolocation callers) — loosen per-feature if a
          // future phase needs them (e.g. in-app verification calls).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

// SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN are build-time-only CLI
// config, not part of the runtime env.ts schema — read directly. Source-map
// upload is skipped automatically when authToken is unset (e.g. local dev),
// so these can stay empty until the project is provisioned. Keys are omitted
// entirely (not set to `undefined`) to satisfy exactOptionalPropertyTypes.
const sentryBuildOptions: SentryBuildOptions = {
  ...(process.env.SENTRY_ORG && { org: process.env.SENTRY_ORG }),
  ...(process.env.SENTRY_PROJECT && { project: process.env.SENTRY_PROJECT }),
  ...(process.env.SENTRY_AUTH_TOKEN && { authToken: process.env.SENTRY_AUTH_TOKEN }),
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
