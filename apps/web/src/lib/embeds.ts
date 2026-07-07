/**
 * Link embeds (§15): embed-first video — a pasted YouTube / TikTok / Vimeo /
 * X / Instagram link plays in-app via a provider iframe. Whitelisted-domain
 * links render rich; anything else renders as a plain URL behind the
 * unknown-link warning interstitial (/out).
 *
 * Pure module — safe for client and server. Detection is strict: https(+http)
 * only, exact host allowlist (no substring matching — "evil-youtube.com"
 * must not pass), no credentials in the URL.
 */

export type EmbedProvider = 'youtube' | 'vimeo' | 'tiktok' | 'x' | 'instagram';

export type LinkKind =
  /** Whitelisted video link with an in-app player. */
  | { kind: 'video'; provider: EmbedProvider; embedUrl: string; originalUrl: string }
  /** A link back into Xidig itself — never interstitialed. */
  | { kind: 'internal'; url: string; path: string }
  /** Unknown domain → plain URL + warning interstitial (§15). */
  | { kind: 'external'; url: string; host: string };

/** Hosts that count as "us" (§28 public layer stays at xidig.net). */
const INTERNAL_HOSTS = new Set(['xidig.net', 'www.xidig.net', 'app.xidig.net']);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const DIGITS = /^\d{6,25}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const TIKTOK_USER = /^@[\w.-]{1,60}$/;

function parseHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url;
}

/** Lowercased host without a leading www. */
function bareHost(url: URL): string {
  const host = url.hostname.toLowerCase();
  return host.startsWith('www.') ? host.slice(4) : host;
}

function youtubeEmbed(url: URL): string | null {
  const host = bareHost(url);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else if ((segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') && segments[1]) {
      id = segments[1];
    }
  } else {
    return null;
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

function vimeoEmbed(url: URL): string | null {
  if (bareHost(url) !== 'vimeo.com' && bareHost(url) !== 'player.vimeo.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  const id = segments[0] === 'video' ? segments[1] : segments[0];
  if (!id || !DIGITS.test(id)) return null;
  return `https://player.vimeo.com/video/${id}`;
}

function tiktokEmbed(url: URL): string | null {
  const host = bareHost(url);
  if (host !== 'tiktok.com' && host !== 'm.tiktok.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  // https://www.tiktok.com/@user/video/1234567890
  if (segments.length >= 3 && TIKTOK_USER.test(segments[0] ?? '') && segments[1] === 'video') {
    const id = segments[2];
    if (id && DIGITS.test(id)) return `https://www.tiktok.com/embed/v2/${id}`;
  }
  return null;
}

function xEmbed(url: URL): string | null {
  const host = bareHost(url);
  if (host !== 'x.com' && host !== 'twitter.com' && host !== 'mobile.twitter.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  // https://x.com/user/status/1234567890
  if (segments.length >= 3 && segments[1] === 'status') {
    const id = segments[2];
    if (id && DIGITS.test(id)) return `https://platform.twitter.com/embed/Tweet.html?id=${id}`;
  }
  return null;
}

function instagramEmbed(url: URL): string | null {
  if (bareHost(url) !== 'instagram.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  // https://www.instagram.com/p/CODE/ or /reel/CODE/
  if (segments.length >= 2 && (segments[0] === 'p' || segments[0] === 'reel')) {
    const code = segments[1];
    if (code && INSTAGRAM_CODE.test(code)) return `https://www.instagram.com/p/${code}/embed`;
  }
  return null;
}

const DETECTORS: ReadonlyArray<[EmbedProvider, (url: URL) => string | null]> = [
  ['youtube', youtubeEmbed],
  ['vimeo', vimeoEmbed],
  ['tiktok', tiktokEmbed],
  ['x', xEmbed],
  ['instagram', instagramEmbed],
];

/**
 * Classify a member-pasted link. Returns null for values that aren't valid
 * http(s) URLs at all (the zod layer should have rejected those already).
 */
export function detectLink(raw: string): LinkKind | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;

  if (INTERNAL_HOSTS.has(url.hostname.toLowerCase())) {
    return { kind: 'internal', url: url.toString(), path: url.pathname + url.search };
  }

  for (const [provider, detect] of DETECTORS) {
    const embedUrl = detect(url);
    if (embedUrl) {
      return { kind: 'video', provider, embedUrl, originalUrl: url.toString() };
    }
  }

  return { kind: 'external', url: url.toString(), host: url.hostname.toLowerCase() };
}

/** Href for the unknown-link warning interstitial (§15). */
export function interstitialHref(url: string): string {
  return `/out?url=${encodeURIComponent(url)}`;
}
