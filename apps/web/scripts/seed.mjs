/**
 * Seed CLI (PRD §21). A dependency-free wrapper that drives the idempotent seed
 * job exposed at POST /api/admin/seed, authenticating with the shared
 * CRON_SECRET (service scope). Re-running is safe — the job de-duplicates.
 *
 * Usage (dev server or staging must be running):
 *   CRON_SECRET=... APP_URL=http://localhost:3000 node apps/web/scripts/seed.mjs
 *   CRON_SECRET=... APP_URL=http://localhost:3000 node apps/web/scripts/seed.mjs --reset
 *
 * Or via pnpm:  pnpm --filter @xidig/web seed   [-- --reset]
 */
const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const reset = process.argv.includes('--reset');

if (!CRON_SECRET) {
  console.error('✗ CRON_SECRET is required (it authorises the seed job). Set it and retry.');
  process.exit(1);
}

const url = `${APP_URL.replace(/\/$/, '')}/api/admin/seed`;
const method = reset ? 'DELETE' : 'POST';

try {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`✗ Seed ${method} failed (${res.status}):`, JSON.stringify(body));
    process.exit(1);
  }
  console.log(`✓ Seed ${reset ? 'reset' : 'run'} complete:`, JSON.stringify(body.data ?? body, null, 2));
} catch (err) {
  console.error(`✗ Could not reach ${url} — is the server running?`, err?.message ?? err);
  process.exit(1);
}
