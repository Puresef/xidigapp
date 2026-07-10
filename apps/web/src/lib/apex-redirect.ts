/**
 * Apex canonical redirect (docs/front-door-plan.md §8, cutover step 7).
 *
 * After the domain cutover the app is served from the apex `xidig.net`, but
 * links already in the wild point at the old `app.xidig.net` host: WhatsApp
 * shares of Labs/profiles, bookmarks, and in-flight auth-confirm / password
 * reset emails minted before the flip. Those must 308 to the apex (method- and
 * query-preserving) so they keep working — otherwise they hit a stale host.
 *
 * Two hard rules encoded here:
 *   1. ENV-GATED — only active when this deployment IS the apex
 *      (`isApexDeployment()`). While the app still serves `app.xidig.net` the
 *      helper returns null for every request, so it can ship now and stays
 *      completely inert until the APP_URL flip + redeploy at cutover. It must
 *      NEVER redirect product traffic to the apex before the apex is the app.
 *   2. LOOP-SAFE + API-SAFE — only the `app.` and `www.` subdomains redirect;
 *      the bare apex `xidig.net` (and anything else) passes through, so there is
 *      no redirect loop. `/api/*` is excluded because server-to-server callers
 *      (cron-job.org → /api/cron/plaza, Resend → /api/webhooks/email, external
 *      API/MCP clients) frequently do NOT follow 308s and would silently break;
 *      those integrations are re-pointed to the apex by hand (cutover steps 5-6)
 *      instead. Browser page requests (incl. /auth/confirm email links) DO
 *      follow the redirect, which is exactly who needs it.
 */

const APEX_HOST = 'xidig.net';
const REDIRECT_HOSTS = new Set(['app.xidig.net', 'www.xidig.net']);

export function apexHostRedirect(opts: {
  isApex: boolean;
  host: string | null | undefined;
  pathname: string;
  search: string;
}): string | null {
  if (!opts.isApex) return null;
  if (!opts.host) return null;
  // Strip any :port and normalise case before matching the Host header.
  const bareHost = (opts.host.split(':')[0] ?? '').toLowerCase();
  if (!REDIRECT_HOSTS.has(bareHost)) return null; // apex + everything else pass through (loop guard)
  if (opts.pathname === '/api' || opts.pathname.startsWith('/api/')) return null;
  return `https://${APEX_HOST}${opts.pathname}${opts.search}`;
}
