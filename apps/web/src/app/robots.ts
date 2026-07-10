import type { MetadataRoute } from 'next';

import { env } from '../env';
import { isApexDeployment } from '../lib/seo';

/**
 * Env-gated robots (docs/front-door-plan.md §3): disallow everything until
 * this deployment serves the apex (no cross-host duplicate indexing of the
 * front door while the old site still owns xidig.net); at the apex, allow the
 * front door + public projections and fence off the app/private surfaces.
 * The per-member `discoverable_search_engines=false → noindex` rule on
 * /u/[handle] composes on top and is unaffected.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isApexDeployment()) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/settings/',
        '/messages/',
        '/onboarding/',
        '/auth/',
        '/signin',
        '/signup',
      ],
    },
    sitemap: `${env.APP_URL.replace(/\/+$/, '')}/sitemap.xml`,
  };
}
