import { describe, expect, it } from 'vitest';

import {
  checkLinkBack,
  documentKey,
  extractLinkedUrls,
  isSameDocument,
  linkPreviewStatus,
  linksBackToProfile,
  normalizeUrlKey,
  pageCarriesToken,
  parseOgMetadata,
  sameVerifiableHost,
} from './links';

/**
 * The two invariants this module exists to hold:
 *
 *   1. ONE destination = ONE key. `profile_link_meta` is keyed by url_key, so
 *      any spelling that collapses to a second key mints a second verification
 *      state for a page nobody checked.
 *   2. The orange check comes from a LINK, never a mention (acceptance A7).
 *      A page that types the handle in prose has asserted nothing checkable.
 */

const PROFILE = 'https://xidig.net/u/hodan';

describe('normalizeUrlKey — one destination, one key', () => {
  it('drops the scheme so http and https converge', () => {
    expect(normalizeUrlKey('https://hodan.dev')).toBe('hodan.dev');
    expect(normalizeUrlKey('http://hodan.dev')).toBe(normalizeUrlKey('https://hodan.dev'));
  });

  it('lowercases the host but preserves path case', () => {
    // Hosts are case-insensitive by spec; paths are not — /Blog and /blog are
    // two documents on most servers.
    expect(normalizeUrlKey('https://HODAN.Dev/Blog')).toBe('hodan.dev/Blog');
    expect(normalizeUrlKey('https://hodan.dev/blog')).not.toBe(normalizeUrlKey('https://hodan.dev/Blog'));
  });

  it('folds a leading www. into the bare host', () => {
    expect(normalizeUrlKey('https://www.hodan.dev/x')).toBe('hodan.dev/x');
    // Only the leading label — a host that merely contains "www" is untouched.
    expect(normalizeUrlKey('https://wwwx.hodan.dev')).toBe('wwwx.hodan.dev');
  });

  it('strips trailing slashes, including the bare root', () => {
    expect(normalizeUrlKey('https://hodan.dev/')).toBe('hodan.dev');
    expect(normalizeUrlKey('https://hodan.dev/blog/')).toBe('hodan.dev/blog');
    expect(normalizeUrlKey('https://hodan.dev/blog//')).toBe('hodan.dev/blog');
  });

  it('drops each scheme’s default port and keeps every other one', () => {
    expect(normalizeUrlKey('https://hodan.dev:443/x')).toBe('hodan.dev/x');
    expect(normalizeUrlKey('http://hodan.dev:80/x')).toBe('hodan.dev/x');
    expect(normalizeUrlKey('https://hodan.dev:8080/x')).toBe('hodan.dev:8080/x');
  });

  it('keeps the query but never the fragment', () => {
    // ?u=hodan addresses a different page on plenty of sites; #top does not
    // reach the server at all.
    expect(normalizeUrlKey('https://hodan.dev/p?a=1')).toBe('hodan.dev/p?a=1');
    expect(normalizeUrlKey('https://hodan.dev/p#top')).toBe('hodan.dev/p');
    expect(normalizeUrlKey('https://hodan.dev/p?')).toBe('hodan.dev/p');
    expect(normalizeUrlKey('https://hodan.dev/p?a=1')).not.toBe(normalizeUrlKey('https://hodan.dev/p'));
  });

  it('collapses a Unicode host onto its punycode spelling', () => {
    const unicode = normalizeUrlKey('https://sömali.example/blog');
    expect(unicode).toBe(normalizeUrlKey('https://xn--smali-jua.example/blog'));
    expect(unicode).toMatch(/^xn--/);
    // …and case-folds before the transcription, so SÖMALI is the same page.
    expect(normalizeUrlKey('https://SÖMALI.example/blog')).toBe(unicode);
  });

  it('accepts what members actually paste — no scheme, or protocol-relative', () => {
    expect(normalizeUrlKey('hodan.dev/blog/')).toBe('hodan.dev/blog');
    expect(normalizeUrlKey('//hodan.dev/blog')).toBe('hodan.dev/blog');
    // The colon here is a port, not a scheme — the scheme-less path must not
    // mistake `example.com:` for one.
    expect(normalizeUrlKey('hodan.dev:8080/x')).toBe('hodan.dev:8080/x');
  });

  it('trims surrounding whitespace and a trailing FQDN dot', () => {
    expect(normalizeUrlKey('  https://hodan.dev/x  ')).toBe('hodan.dev/x');
    expect(normalizeUrlKey('https://hodan.dev./x')).toBe('hodan.dev/x');
  });

  it('rejects anything that is not a fetchable web page', () => {
    for (const input of [
      'mailto:hodan@example.com',
      'javascript:alert(1)',
      'data:text/html,<h1>hi</h1>',
      'tel:+252612345678',
      'ftp://files.example/x',
      'ws://socket.example',
      'https://',
      '',
      '   ',
    ]) {
      expect(normalizeUrlKey(input)).toBeNull();
    }
  });

  it('rejects a URL longer than the profiles.links cap', () => {
    expect(normalizeUrlKey(`https://hodan.dev/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('documentKey / isSameDocument', () => {
  it('ignores the query, unlike the storage key', () => {
    expect(documentKey('https://xidig.net/u/hodan?ref=blog')).toBe('xidig.net/u/hodan');
    expect(normalizeUrlKey('https://xidig.net/u/hodan?ref=blog')).not.toBe(
      normalizeUrlKey(PROFILE),
    );
    expect(isSameDocument('https://xidig.net/u/hodan?ref=blog', PROFILE)).toBe(true);
  });

  it('still distinguishes two different profiles', () => {
    expect(isSameDocument('https://xidig.net/u/hodanx', PROFILE)).toBe(false);
    expect(isSameDocument('https://xidig.net/u/hodan/posts', PROFILE)).toBe(false);
  });

  it('is false when either side is unparseable', () => {
    expect(isSameDocument('mailto:hodan@example.com', PROFILE)).toBe(false);
    expect(documentKey('javascript:void(0)')).toBeNull();
  });
});

describe('sameVerifiableHost — a redirect cannot launder the check (A7)', () => {
  it('accepts the spellings a host redirects between', () => {
    // These are the same host wearing different clothes, and every one of them
    // is a redirect a normal site performs on its own traffic.
    expect(sameVerifiableHost('http://hodan.dev', 'https://hodan.dev')).toBe(true);
    expect(sameVerifiableHost('https://www.hodan.dev', 'https://hodan.dev')).toBe(true);
    expect(sameVerifiableHost('https://hodan.dev', 'https://hodan.dev/')).toBe(true);
    expect(sameVerifiableHost('https://HODAN.dev/about', 'https://hodan.dev/about')).toBe(true);
  });

  it('refuses a redirect that lands on another host', () => {
    // The attack this closes: point a throwaway domain at a page that really
    // does link back, collect the orange check, then repoint the redirect.
    expect(sameVerifiableHost('https://evil.example', 'https://github.com/hodan-c')).toBe(false);
    // A subdomain is a different host — it can be delegated to someone else.
    expect(sameVerifiableHost('https://hodan.dev', 'https://pages.hodan.dev')).toBe(false);
    // Same host, different port is a different service.
    expect(sameVerifiableHost('https://hodan.dev', 'https://hodan.dev:8443')).toBe(false);
  });

  it('refuses anything it cannot parse rather than passing it through', () => {
    expect(sameVerifiableHost('mailto:hodan@example.com', 'https://hodan.dev')).toBe(false);
    expect(sameVerifiableHost('', 'https://hodan.dev')).toBe(false);
  });
});

describe('extractLinkedUrls — attributes only', () => {
  it('reads href from anchors, quoted any way or not at all', () => {
    const html = `
      <a href="https://one.example">one</a>
      <a href='https://two.example'>two</a>
      <a href=https://three.example>three</a>
    `;
    expect(extractLinkedUrls(html)).toEqual([
      'https://one.example',
      'https://two.example',
      'https://three.example',
    ]);
  });

  it('takes <link rel="me"> and rel="author" but not other link relations', () => {
    const html = `
      <link rel="me" href="https://me.example">
      <link rel="author" href="https://author.example">
      <link rel="stylesheet" href="https://style.example/app.css">
      <link rel="canonical" href="https://canonical.example">
    `;
    expect(extractLinkedUrls(html)).toEqual(['https://me.example', 'https://author.example']);
  });

  it('ignores markup that is commented out or inside a script', () => {
    const html = `
      <!-- <a href="https://ghost.example">old</a> -->
      <script>document.write('<a href="https://injected.example">x</a>')</script>
      <a href="https://real.example">real</a>
    `;
    expect(extractLinkedUrls(html)).toEqual(['https://real.example']);
  });

  it('resolves relative hrefs against the page when one is given', () => {
    const html = '<a href="/u/hodan">me</a>';
    expect(extractLinkedUrls(html, 'https://hodan.dev/about')).toEqual([
      'https://hodan.dev/u/hodan',
    ]);
  });

  it('does not confuse data-href with href', () => {
    expect(extractLinkedUrls('<a data-href="https://ghost.example">x</a>')).toEqual([]);
  });
});

describe('linksBackToProfile — a link, never a mention (A7)', () => {
  it('accepts an anchor to the profile in any equivalent spelling', () => {
    for (const href of [
      'https://xidig.net/u/hodan',
      'http://XIDIG.net/u/hodan/',
      'https://www.xidig.net/u/hodan?utm_source=blog',
      '//xidig.net/u/hodan',
    ]) {
      expect(linksBackToProfile(`<a href="${href}">Xidig</a>`, PROFILE)).toBe(true);
    }
  });

  it('is NOT satisfied by the handle or the URL appearing as text', () => {
    const mentions = `
      <p>I'm @hodan on Xidig — find me at https://xidig.net/u/hodan</p>
      <p>xidig.net/u/hodan</p>
      <meta name="description" content="https://xidig.net/u/hodan">
    `;
    expect(linksBackToProfile(mentions, PROFILE)).toBe(false);
  });

  it('is not satisfied by a link to a different member', () => {
    expect(linksBackToProfile('<a href="https://xidig.net/u/deeqa">Deeqa</a>', PROFILE)).toBe(
      false,
    );
  });

  it('does not accept the page’s own relative path as a link back', () => {
    // hodan.dev/u/hodan is hodan.dev's page, not this profile.
    expect(linksBackToProfile('<a href="/u/hodan">me</a>', PROFILE, 'https://hodan.dev/about')).toBe(
      false,
    );
  });

  it('accepts a rel="me" verification link', () => {
    expect(linksBackToProfile(`<link rel="me" href="${PROFILE}">`, PROFILE)).toBe(true);
  });
});

describe('checkLinkBack', () => {
  const TOKEN = 'a3f1c0de9b7248e5a1c2d3e4f5061728';

  it('verifies a plain link back when no token was issued', () => {
    expect(checkLinkBack(`<a href="${PROFILE}">x</a>`, { profileUrl: PROFILE })).toEqual({
      verified: true,
    });
  });

  it('requires the token too once one has been issued', () => {
    const linkOnly = `<a href="${PROFILE}">x</a>`;
    expect(checkLinkBack(linkOnly, { profileUrl: PROFILE, token: TOKEN })).toEqual({
      verified: false,
      reason: 'token_missing',
    });
    expect(
      checkLinkBack(`${linkOnly}<meta name="xidig-verify" content="${TOKEN}">`, {
        profileUrl: PROFILE,
        token: TOKEN,
      }),
    ).toEqual({ verified: true });
  });

  it('never verifies a token without a link back', () => {
    expect(
      checkLinkBack(`<p>${TOKEN}</p>`, { profileUrl: PROFILE, token: TOKEN }),
    ).toEqual({ verified: false, reason: 'no_link_back' });
  });

  it('treats a suspiciously short token as unfound rather than trivially matched', () => {
    expect(pageCarriesToken('<p>abc</p>', 'abc')).toBe(false);
    expect(pageCarriesToken(`<p>${TOKEN}</p>`, TOKEN)).toBe(true);
    // Generated hex, not copy — case matters.
    expect(pageCarriesToken(`<p>${TOKEN.toUpperCase()}</p>`, TOKEN)).toBe(false);
  });
});

describe('parseOgMetadata', () => {
  it('reads the standard block and resolves a relative image', () => {
    const html = `
      <head>
        <meta property="og:title" content="Qormo: amniga xogta">
        <meta property="og:site_name" content="hodan.dev">
        <meta property="og:image" content="/media/cover.png">
      </head>
    `;
    expect(parseOgMetadata(html, 'https://hodan.dev/blog/amniga')).toEqual({
      title: 'Qormo: amniga xogta',
      siteName: 'hodan.dev',
      imageUrl: 'https://hodan.dev/media/cover.png',
    });
  });

  it('accepts name= and reversed attribute order', () => {
    const html = `<meta content="Hodan writes" name="og:title"><meta content="Hodan" property="og:site_name">`;
    expect(parseOgMetadata(html)).toMatchObject({ title: 'Hodan writes', siteName: 'Hodan' });
  });

  it('decodes entities and collapses whitespace', () => {
    const html = `<meta property="og:title" content="Caawimo &amp; marag-fur &#8212;\n  qaybta&nbsp;labaad">`;
    expect(parseOgMetadata(html).title).toBe('Caawimo & marag-fur — qaybta labaad');
  });

  it('falls back to twitter tags, then to <title>', () => {
    expect(parseOgMetadata('<meta name="twitter:title" content="From Twitter">').title).toBe(
      'From Twitter',
    );
    expect(parseOgMetadata('<title>  Bogga Hodan  </title>').title).toBe('Bogga Hodan');
    // A <title> inside a script body is code, not the document title.
    expect(parseOgMetadata('<script>var s = "<title>fake</title>";</script>').title).toBeNull();
  });

  it('keeps the first og:image when a page declares several', () => {
    const html = `
      <meta property="og:image" content="https://hodan.dev/1.png">
      <meta property="og:image" content="https://hodan.dev/2.png">
    `;
    expect(parseOgMetadata(html).imageUrl).toBe('https://hodan.dev/1.png');
  });

  it('drops an image URL that is not http(s)', () => {
    const html = '<meta property="og:image" content="data:image/png;base64,AAAA">';
    expect(parseOgMetadata(html).imageUrl).toBeNull();
  });

  it('truncates a hostile title instead of storing it whole', () => {
    const html = `<meta property="og:title" content="${'x'.repeat(900)}">`;
    const title = parseOgMetadata(html).title ?? '';
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never throws on garbage', () => {
    for (const html of ['', '<html', '<meta property="og:title">', '<<>>']) {
      expect(() => parseOgMetadata(html)).not.toThrow();
    }
  });
});

describe('linkPreviewStatus', () => {
  it('is failed when there is nothing to draw — the chip stands alone (A6)', () => {
    expect(linkPreviewStatus({ title: null, siteName: 'hodan.dev', imageUrl: null })).toBe('failed');
    expect(linkPreviewStatus(parseOgMetadata('<p>no head at all</p>'))).toBe('failed');
  });

  it('is ok as soon as there is a title or an image', () => {
    expect(linkPreviewStatus({ title: 'Qormo', siteName: null, imageUrl: null })).toBe('ok');
    expect(linkPreviewStatus({ title: null, siteName: null, imageUrl: 'https://x.dev/a.png' })).toBe(
      'ok',
    );
  });
});
