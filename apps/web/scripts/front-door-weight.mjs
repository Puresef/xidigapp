#!/usr/bin/env node
/**
 * Front-door delivery budgets (docs/front-door-plan.md §5/§6; front-door
 * standard §2-E30 + §2-B11). Three checks per signed-out route:
 *
 *   1. WEIGHT RATCHET — compressed transfer size: the HTML document plus
 *      every same-origin script/stylesheet/font it references, plus any
 *      EAGER same-origin image bytes (lazy / MediaSlot-deferred images are
 *      exempt — deferring them is the point). BUDGET_BYTES is a RATCHET:
 *      seeded 11 Jul 2026 at measured-current +5% (see the constant), and
 *      LOWERED in the same PR as each bundle-diet item lands (§4.1 items
 *      8a/8b…). Floor and end state: 100KB — the original invariant. Never
 *      raise it without the explicit W-14 re-scope decision.
 *
 *   2. EAGER-IMAGE GOVERNANCE — any same-origin <img> without
 *      loading="lazy" fails the run outright (§2-B11): front-door images go
 *      through MediaSlot or are at least lazy; an eager image silently
 *      reopens the 2G wound the brand promises against.
 *
 *   3. WARM-TTFB TRIPWIRE — every route is fetched twice; the SECOND
 *      (warm: unstable_cache populated) request must reach first byte under
 *      TTFB_BUDGET_MS. This guards the §4.1-item-6 streaming/caching work: a
 *      reintroduced first-byte-blocking read shows up here, not in prod.
 *
 * Usage (against a production build — dev bundles are unminified and always
 * blow the budget), with the server already running (`next start`):
 *
 *   node scripts/front-door-weight.mjs [origin]   # default http://localhost:3000
 *
 * Env: TTFB_BUDGET_MS overrides the tripwire threshold (default 1000).
 * Exits 1 on any breach. Wired into CI after `pnpm build` (ci.yml).
 */

import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * RATCHET SEED (11 Jul 2026): worst signed-out route measured 499.4 KB gz
 * (`/`, local prod build, HTML + 15 same-origin js/css/font assets, zero
 * images — consistent with the 484 KB anon JS live-measured for §3-E28);
 * +5% headroom → 524 KB. Ratchet DOWN with every diet PR (§4.1 items 8a/8b
 * are the next two big cuts); floor 100 KB (docs/front-door-plan.md §5's
 * original budget).
 */
export const BUDGET_BYTES = 524 * 1024;

/** Warm-second-request first-byte ceiling (ms). Generous for CI runners. */
export const TTFB_BUDGET_MS = Number(process.env.TTFB_BUDGET_MS || 1000);

export const ROUTES = [
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

/** Same-origin js/css/font URLs referenced by the document, deduped. */
export function assetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|woff2?))(?:\?[^"]*)?"/g)) {
    const url = match[1];
    if (url.startsWith('/') && !url.startsWith('//')) urls.add(url);
  }
  return [...urls];
}

/**
 * Same-origin <img> srcs that load EAGERLY (no loading="lazy") — each one is
 * a §2-B11 budget breach. Cross-origin (incl. protocol-relative) srcs are
 * out of scope: they can't be fetched deterministically from CI.
 */
export function eagerSameOriginImages(html, origin) {
  const srcs = [];
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (/\bloading=["']lazy["']/i.test(tag)) continue;
    let src = tag.match(/\bsrc=["']([^"']+)["']/)?.[1];
    if (!src) continue;
    if (src.startsWith(origin)) src = src.slice(origin.length);
    if (src.startsWith('/') && !src.startsWith('//')) srcs.push(src);
  }
  return srcs;
}

async function main() {
  const origin = process.argv[2] ?? 'http://localhost:3000';
  let failed = false;

  for (const route of ROUTES) {
    try {
      const page = await fetchSize(`${origin}${route}`);
      const html = page.body.toString('utf8');
      let total = page.wire;

      const assets = assetUrls(html);
      for (const asset of assets) {
        try {
          total += (await fetchSize(`${origin}${asset}`)).wire;
        } catch {
          // Asset fetch failure shouldn't fail the measurement run.
        }
      }

      // Eager same-origin images: counted into the total AND a breach.
      const eagerImages = eagerSameOriginImages(html, origin);
      for (const image of eagerImages) {
        try {
          total += (await fetchSize(`${origin}${image}`)).wire;
        } catch {
          // Missing image file: the lazy-loading breach below still reports.
        }
      }

      // Warm second request: fetch() resolves at response headers, so this
      // approximates TTFB with caches (unstable_cache) populated.
      const start = performance.now();
      const warm = await fetch(`${origin}${route}`);
      const ttfb = performance.now() - start;
      await warm.arrayBuffer();

      const overWeight = total > BUDGET_BYTES;
      const overTtfb = ttfb > TTFB_BUDGET_MS;
      const imageBreach = eagerImages.length > 0;
      if (overWeight || overTtfb || imageBreach) failed = true;

      const kb = (total / 1024).toFixed(1);
      console.log(
        `${overWeight || overTtfb || imageBreach ? '✗' : '✓'} ${route.padEnd(14)} ` +
          `${kb.padStart(7)} KB gz (${assets.length} assets) · warm TTFB ${ttfb.toFixed(0)} ms`,
      );
      if (imageBreach) {
        console.log(`    eager same-origin <img> without loading="lazy": ${eagerImages.join(', ')}`);
      }
    } catch (error) {
      failed = true;
      console.log(`✗ ${route.padEnd(14)} ERROR: ${error.message}`);
    }
  }

  console.log(
    `\nBudget: ${(BUDGET_BYTES / 1024).toFixed(0)} KB compressed per signed-out route ` +
      `(ratchet — lower per diet PR, floor 100 KB) · warm TTFB < ${TTFB_BUDGET_MS} ms.`,
  );
  process.exit(failed ? 1 : 0);
}

// Import-safe: the fetch loop runs only when executed directly, so the vitest
// suite can import the parsing helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
