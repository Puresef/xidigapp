import { describe, expect, it } from 'vitest';

import { detectLink, interstitialHref, resolveInterstitialTarget } from './embeds';

/**
 * §15 embed-first video: whitelisted providers get an in-app player, our own
 * hosts stay internal, everything else goes behind the /out interstitial.
 * Detection must be strict — lookalike hosts, credentials and non-http
 * schemes must never reach the video path.
 */

function expectVideo(raw: string, provider: string, embedUrl: string): void {
  const result = detectLink(raw);
  expect(result).toEqual({ kind: 'video', provider, embedUrl, originalUrl: expect.any(String) });
}

describe('detectLink: youtube', () => {
  it('detects watch?v= URLs and embeds via youtube-nocookie', () => {
    expectVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('detects youtu.be short links', () => {
    expectVideo(
      'https://youtu.be/dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('detects /shorts/ URLs', () => {
    expectVideo(
      'https://www.youtube.com/shorts/abc123XYZ_-',
      'youtube',
      'https://www.youtube-nocookie.com/embed/abc123XYZ_-',
    );
  });

  it('detects /live/ URLs', () => {
    expectVideo(
      'https://youtube.com/live/dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('detects m.youtube.com mobile URLs', () => {
    expectVideo(
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('still detects plain-http youtube links (http allowed)', () => {
    expectVideo(
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'youtube',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});

describe('detectLink: other providers', () => {
  it('detects numeric vimeo ids', () => {
    expectVideo(
      'https://vimeo.com/123456789',
      'vimeo',
      'https://player.vimeo.com/video/123456789',
    );
  });

  it('detects tiktok @user/video/{digits}', () => {
    expectVideo(
      'https://www.tiktok.com/@xidig.builder/video/7234567890123456789',
      'tiktok',
      'https://www.tiktok.com/embed/v2/7234567890123456789',
    );
  });

  it('detects x.com status links via platform.twitter.com', () => {
    expectVideo(
      'https://x.com/someone/status/1690000000000000000',
      'x',
      'https://platform.twitter.com/embed/Tweet.html?id=1690000000000000000',
    );
  });

  it('detects twitter.com status links the same way', () => {
    expectVideo(
      'https://twitter.com/someone/status/1690000000000000000',
      'x',
      'https://platform.twitter.com/embed/Tweet.html?id=1690000000000000000',
    );
  });

  it('detects instagram /p/ posts', () => {
    expectVideo(
      'https://www.instagram.com/p/Cu5xQ2LMnop/',
      'instagram',
      'https://www.instagram.com/p/Cu5xQ2LMnop/embed',
    );
  });

  it('detects instagram /reel/ links and normalizes to /p/{code}/embed', () => {
    expectVideo(
      'https://www.instagram.com/reel/Cu5xQ2LMnop/',
      'instagram',
      'https://www.instagram.com/p/Cu5xQ2LMnop/embed',
    );
  });
});

describe('detectLink: internal hosts', () => {
  it('treats xidig.net as internal and preserves the path', () => {
    expect(detectLink('https://xidig.net/u/x')).toEqual({
      kind: 'internal',
      url: 'https://xidig.net/u/x',
      path: '/u/x',
    });
  });

  it('treats app.xidig.net as internal', () => {
    expect(detectLink('https://app.xidig.net/p/y')).toEqual({
      kind: 'internal',
      url: 'https://app.xidig.net/p/y',
      path: '/p/y',
    });
  });
});

describe('detectLink: external + hostile inputs', () => {
  it('classifies an unknown https domain as external with its host', () => {
    const result = detectLink('https://somoblog.example.com/article?id=7');
    expect(result).toEqual({
      kind: 'external',
      url: 'https://somoblog.example.com/article?id=7',
      host: 'somoblog.example.com',
    });
  });

  it('rejects lookalike host evil-youtube.com from the video path', () => {
    const result = detectLink('https://evil-youtube.com/watch?v=x');
    expect(result?.kind).toBe('external');
  });

  it('rejects suffix-spoof host youtube.com.evil.com from the video path', () => {
    const result = detectLink('https://youtube.com.evil.com/watch?v=abc');
    expect(result?.kind).toBe('external');
  });

  it('returns null for URLs carrying credentials', () => {
    expect(detectLink('https://user:pass@youtube.com/watch?v=abcdef')).toBeNull();
  });

  it('returns null for javascript: URLs', () => {
    expect(detectLink('javascript:alert(1)')).toBeNull();
  });

  it('returns null for ftp: URLs', () => {
    expect(detectLink('ftp://youtube.com/watch?v=abcdef')).toBeNull();
  });

  it('returns null for strings that are not URLs at all', () => {
    expect(detectLink('not-a-url')).toBeNull();
  });
});

describe('interstitialHref', () => {
  it('URL-encodes the target', () => {
    const target = 'https://example.com/a b?c=d&e=f';
    expect(interstitialHref(target)).toBe(`/out?url=${encodeURIComponent(target)}`);
  });
});

/**
 * /out's `url` param is attacker-controlled: anyone can craft an /out link and
 * post it anywhere. Only an absolute http(s) destination on a host that is not
 * Xidig ever becomes a Continue link (PRD Relook §8: an unsupported embed must
 * stay a usable link — behind a warning, never a silent redirect).
 */
describe('resolveInterstitialTarget', () => {
  it('accepts an absolute https destination and names its host', () => {
    expect(resolveInterstitialTarget('https://example.org/menu?day=fri#top')).toEqual({
      href: 'https://example.org/menu?day=fri#top',
      host: 'example.org',
    });
  });

  it('accepts plain http too', () => {
    expect(resolveInterstitialTarget('http://shop.example.so/')).toEqual({
      href: 'http://shop.example.so/',
      host: 'shop.example.so',
    });
  });

  it('normalises the destination: lowercase host, default port dropped, spaces encoded', () => {
    expect(resolveInterstitialTarget('HTTPS://Example.COM:443/a b?x=1')).toEqual({
      href: 'https://example.com/a%20b?x=1',
      host: 'example.com',
    });
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'mailto:someone@example.com',
  ])('refuses the non-http(s) scheme in %j', (raw) => {
    expect(resolveInterstitialTarget(raw)).toBeNull();
  });

  it.each(['/signin', '//evil.example/phish', 'example.com', 'https://', 'not a url', ''])(
    'refuses relative or malformed input %j',
    (raw) => {
      expect(resolveInterstitialTarget(raw)).toBeNull();
    },
  );

  it('refuses a missing param', () => {
    expect(resolveInterstitialTarget(null)).toBeNull();
    expect(resolveInterstitialTarget(undefined)).toBeNull();
  });

  it('refuses credentials in the URL (the "xidig.net@evil" disguise)', () => {
    expect(resolveInterstitialTarget('https://xidig.net@evil.example/')).toBeNull();
    expect(resolveInterstitialTarget('https://user:pass@example.com/')).toBeNull();
  });

  it.each([
    'https://xidig.net/auth/callback?next=/admin',
    'https://www.xidig.net/signin',
    'https://APP.XIDIG.NET/reset-password',
  ])('refuses our own hosts — /out never fronts a Xidig page (%s)', (raw) => {
    expect(resolveInterstitialTarget(raw)).toBeNull();
  });

  it('refuses the host serving this request (preview and local deployments)', () => {
    expect(
      resolveInterstitialTarget('https://xidig-git-x.vercel.app/signin', 'xidig-git-x.vercel.app'),
    ).toBeNull();
    expect(resolveInterstitialTarget('http://localhost:3000/signin', 'localhost:3000')).toBeNull();
    expect(resolveInterstitialTarget('https://example.org/', 'localhost:3000')).toEqual({
      href: 'https://example.org/',
      host: 'example.org',
    });
  });

  it('does not mistake a look-alike host for ours', () => {
    expect(resolveInterstitialTarget('https://xidig.net.evil.example/signin')).toEqual({
      href: 'https://xidig.net.evil.example/signin',
      host: 'xidig.net.evil.example',
    });
  });

  it('shows internationalised hosts in punycode, so a homograph cannot pass as a familiar name', () => {
    // Cyrillic "а" (U+0430) followed by "pple.com".
    expect(resolveInterstitialTarget('https://аpple.com/login')?.host).toBe('xn--pple-43d.com');
    expect(resolveInterstitialTarget('https://müller.de/')).toEqual({
      href: 'https://xn--mller-kva.de/',
      host: 'xn--mller-kva.de',
    });
  });

  it('refuses overlong destinations', () => {
    const base = 'https://example.com/';
    expect(resolveInterstitialTarget(base + 'a'.repeat(2048 - base.length))).not.toBeNull();
    expect(resolveInterstitialTarget(base + 'a'.repeat(2049 - base.length))).toBeNull();
  });

  it('round-trips through interstitialHref and query-string decoding', () => {
    const target = 'https://example.com/a?b=1&c=two words#frag';
    const param = new URL(interstitialHref(target), 'https://xidig.net').searchParams.get('url');
    expect(resolveInterstitialTarget(param)).toEqual({
      href: 'https://example.com/a?b=1&c=two%20words#frag',
      host: 'example.com',
    });
  });
});
