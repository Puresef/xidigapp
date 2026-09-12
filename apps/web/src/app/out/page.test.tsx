import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslator, type Locale } from '@xidig/i18n';

/**
 * /out — the unknown-link warning interstitial (§15; PRD Relook §8: an
 * unsupported embed must remain a usable link). Before this page existed,
 * every unknown-domain link in a post 404'd. Only the request-scoped inputs
 * (locale cookie, Host header) are stubbed; the page, the URL validator and
 * the real dictionaries run as shipped.
 */

const request = vi.hoisted(() => ({ locale: 'en' as Locale, host: 'xidig.net' }));

vi.mock('@/lib/locale', async () => {
  const { createTranslator: translator } = await import('@xidig/i18n');
  return { getT: async () => translator(request.locale) };
});

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: request.host }),
}));

import OutPage, { generateMetadata } from './page';

async function render(url?: string | string[]): Promise<string> {
  const searchParams = Promise.resolve(url === undefined ? {} : { url });
  return renderToStaticMarkup(await OutPage({ searchParams }));
}

/** The one anchor that leaves Xidig, if the page rendered it. */
function outboundAnchor(html: string): string | undefined {
  return html.match(/<a [^>]*href="https?:\/\/[^"]*"[^>]*>.*?<\/a>/)?.[0];
}

beforeEach(() => {
  request.locale = 'en';
  request.host = 'xidig.net';
});

describe('/out interstitial', () => {
  const en = createTranslator('en');

  it('offers a Continue link to the destination and names its host', async () => {
    const html = await render('https://example.org/menu?day=fri&x=1');
    const anchor = outboundAnchor(html);

    expect(anchor).toContain('href="https://example.org/menu?day=fri&amp;x=1"');
    expect(anchor).toContain('rel="nofollow noopener noreferrer"');
    expect(anchor).toContain(en('plaza.interstitialContinue', { host: 'example.org' }));
    expect(html).toContain(en('plaza.interstitialTitle'));
    expect(html).toContain(en('plaza.interstitialBody', { host: 'example.org' }));
  });

  it('offers a way back into Xidig', async () => {
    const html = await render('https://example.org/');
    expect(html).toMatch(new RegExp(`<a [^>]*href="/plaza"[^>]*>${en('action.back')}</a>`));
  });

  it('never leaves on its own — no refresh, no redirect', async () => {
    const html = await render('https://example.org/');
    expect(html).not.toContain('http-equiv');
    expect(html).not.toContain('<script');
  });

  it('shows the punycode host for an internationalised look-alike', async () => {
    const html = await render('https://аpple.com/login');
    expect(html).toContain('xn--pple-43d.com');
    expect(html).not.toContain('аpple');
  });

  it('renders markup in the destination inert', async () => {
    const html = await render('https://example.org/"><script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(outboundAnchor(html)).toContain(
      'href="https://example.org/%22%3E%3Cscript%3Ealert(1)%3C/script%3E"',
    );
  });

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,hello'],
    ['a relative path', '/signin'],
    ['a Xidig auth page', 'https://xidig.net/auth/callback?next=/admin'],
    ['a malformed value', 'not a url'],
  ])('refuses %s with plain-language copy and no way out', async (_label, url) => {
    const html = await render(url);
    expect(html).toContain(en('error.linkInvalid'));
    expect(outboundAnchor(html)).toBeUndefined();
    expect(html).not.toContain('javascript:');
    expect(html).toMatch(new RegExp(`<a [^>]*href="/"[^>]*>${en('action.goHome')} →</a>`));
  });

  it('refuses a missing or repeated url param', async () => {
    expect(await render()).toContain(en('error.linkInvalid'));
    expect(await render(['https://a.example/', 'https://b.example/'])).toContain(
      en('error.linkInvalid'),
    );
  });

  it('refuses a link back into the deployment serving the request', async () => {
    request.host = 'xidig-git-x.vercel.app';
    const html = await render('https://xidig-git-x.vercel.app/signin');
    expect(html).toContain(en('error.linkInvalid'));
    expect(outboundAnchor(html)).toBeUndefined();
  });

  it('speaks Somali when the request is Somali', async () => {
    request.locale = 'so';
    const so = createTranslator('so');
    const html = await render('https://example.org/');
    expect(html).toContain(so('plaza.interstitialTitle'));
    expect(outboundAnchor(html)).toContain(
      so('plaza.interstitialContinue', { host: 'example.org' }),
    );
  });

  it('is kept out of search indexes', async () => {
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
