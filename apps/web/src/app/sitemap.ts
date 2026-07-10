import type { MetadataRoute } from 'next';

import { env } from '../env';
import { reportSlugs } from '../lib/front/reports';
import { isApexDeployment } from '../lib/seo';

/**
 * Sitemap (docs/front-door-plan.md §3). Empty until this deployment serves the
 * apex — the old marketing site must stay the sole indexed owner of these URLs
 * during the overlap. Public member projections (/u, /labs/[slug], /l, /c) are
 * deliberately absent in Phase A: they join in Phase B alongside the public
 * list endpoints, with member noindex preferences respected.
 */

const FRONT_DOOR_ROUTES = [
  '/',
  '/product',
  '/about',
  '/membership',
  '/reports',
  '/contact',
  '/privacy',
  '/terms',
  '/waitlist',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isApexDeployment()) return [];
  const base = env.APP_URL.replace(/\/+$/, '');
  return [
    ...FRONT_DOOR_ROUTES.map((route) => ({ url: `${base}${route}` })),
    ...reportSlugs().map((slug) => ({ url: `${base}/reports/${slug}` })),
  ];
}
