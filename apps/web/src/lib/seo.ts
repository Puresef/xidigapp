import { env } from '@/env';

/**
 * Env-gated indexing (docs/front-door-plan.md §3). While this deployment
 * serves app.xidig.net, the front door must stay OUT of search indexes so the
 * old marketing site remains the sole indexed owner of its URLs (no cross-host
 * duplicate-content window). Indexing flips on automatically when APP_URL
 * becomes the apex at cutover step 3 — no code change involved.
 */
export function isApexDeployment(): boolean {
  return env.APP_URL.replace(/\/+$/, '') === 'https://xidig.net';
}

/**
 * Per-page `robots` metadata for public front-door routes: undefined (default
 * indexable) at the apex, explicit noindex everywhere else. Spread as
 * `...(frontDoorRobots() ? { robots: frontDoorRobots() } : {})` so apex pages
 * inherit rather than override.
 */
export function frontDoorRobots(): { index: false; follow: false } | undefined {
  return isApexDeployment() ? undefined : { index: false, follow: false };
}
