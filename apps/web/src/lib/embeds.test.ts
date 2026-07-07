import { describe, expect, it } from 'vitest';

import { detectLink, interstitialHref } from './embeds';

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
