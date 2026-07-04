import { withSentryConfig, type SentryBuildOptions } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the workspace packages from their TypeScript source instead of
  // requiring a separate build step.
  transpilePackages: ['@xidig/db', '@xidig/ui'],
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
