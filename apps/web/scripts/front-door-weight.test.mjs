import { describe, expect, it } from 'vitest';

import { assetUrls, eagerSameOriginImages } from './front-door-weight.mjs';

/**
 * Parsing helpers of the front-door delivery budget script (front-door
 * standard §2-E30 ratchet + §2-B11 image governance). The script's fetch
 * loop runs only when executed directly — importing it here is side-effect
 * free.
 */

describe('assetUrls', () => {
  it('collects same-origin js/css/font refs, deduped and query-stripped', () => {
    const html = `
      <script src="/_next/static/chunks/a.js?v=1"></script>
      <script src="/_next/static/chunks/a.js"></script>
      <link href="/_next/static/css/app.css" rel="stylesheet">
      <link href="/fonts/space.woff2" rel="preload">
      <script src="https://cdn.example.com/x.js"></script>`;
    expect([...assetUrls(html)].sort()).toEqual([
      '/_next/static/chunks/a.js',
      '/_next/static/css/app.css',
      '/fonts/space.woff2',
    ]);
  });

  it('ignores non-asset hrefs', () => {
    expect(assetUrls('<a href="/product">Product</a>')).toEqual([]);
  });
});

describe('eagerSameOriginImages (§2-B11: eager same-origin <img> is a breach)', () => {
  const ORIGIN = 'http://localhost:3000';

  it('flags a same-origin <img> without loading="lazy"', () => {
    const html = `
      <img src="/hero.png" alt="">
      <img loading="lazy" src="/deferred.avif" alt="">
      <img src="https://cdn.example.com/external.png" alt="">`;
    expect(eagerSameOriginImages(html, ORIGIN)).toEqual(['/hero.png']);
  });

  it('resolves absolute same-origin srcs and is attribute-order agnostic', () => {
    const html = `
      <img alt="" src="${ORIGIN}/eager.avif">
      <img src="${ORIGIN}/fine.avif" loading="lazy" alt="">`;
    expect(eagerSameOriginImages(html, ORIGIN)).toEqual(['/eager.avif']);
  });

  it('treats loading="eager" as eager and protocol-relative as cross-origin', () => {
    const html = `
      <img loading="eager" src="/a.png">
      <img src="//cdn.example.com/b.png">`;
    expect(eagerSameOriginImages(html, ORIGIN)).toEqual(['/a.png']);
  });

  it('returns nothing for an image-free page', () => {
    expect(eagerSameOriginImages('<main><p>no images</p></main>', ORIGIN)).toEqual([]);
  });
});
