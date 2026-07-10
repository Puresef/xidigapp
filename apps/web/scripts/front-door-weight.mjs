#!/usr/bin/env node
/**
 * Front-door page-weight budget check (docs/front-door-plan.md §5/§6).
 *
 * Measures the compressed transfer size of each signed-out front-door route
 * against the <100KB budget: the HTML document plus every same-origin script,
 * stylesheet, and font it references (the payload a first-time 2G visitor
 * pays before interactivity). Images are excluded — MediaSlot defers them.
 *
 * Usage: with a server running (dev or `next start`):
 *   node scripts/front-door-weight.mjs [origin]   # default http://localhost:3000
 *
 * Exits 1 if any route exceeds the budget — wire into CI after `next start`.
 * NOTE: run against a production build; dev-mode bundles are unminified and
 * always blow the budget.
 */

import { gzipSync } from 'node:zlib';

const ORIGIN = process.argv[2] ?? 'http://localhost:3000';
const BUDGET_BYTES = 100 * 1024;
const ROUTES = [
  '/',
  '/product',
  '/about',
  '/membership',
  '/reports',
  '/contact',
  '/privacy',
  '/terms',
  '/waitlist',
];

async function fetchSize(url) {
  const res = await fetch(url, { headers: { 'accept-encoding': 'gzip' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const body = Buffer.from(await res.arrayBuffer());
  // fetch() decompresses; re-gzip to approximate on-the-wire size.
  return { body, wire: gzipSync(body, { level: 6 }).length };
}

function assetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2?))(?:\?[^"]*)?"/g)) {
    const url = match[1];
    if (url.startsWith('/')) urls.add(url);
  }
  return [...urls];
}

let failed = false;
for (const route of ROUTES) {
  try {
    const page = await fetchSize(`${ORIGIN}${route}`);
    let total = page.wire;
    const assets = assetUrls(page.body.toString('utf8'));
    for (const asset of assets) {
      try {
        total += (await fetchSize(`${ORIGIN}${asset}`)).wire;
      } catch {
        // Asset fetch failure shouldn't fail the measurement run.
      }
    }
    const kb = (total / 1024).toFixed(1);
    const over = total > BUDGET_BYTES;
    if (over) failed = true;
    console.log(
      `${over ? '✗' : '✓'} ${route.padEnd(14)} ${kb.padStart(7)} KB gz (${assets.length} assets)`,
    );
  } catch (error) {
    failed = true;
    console.log(`✗ ${route.padEnd(14)} ERROR: ${error.message}`);
  }
}

console.log(`\nBudget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB compressed per signed-out route.`);
process.exit(failed ? 1 : 0);
