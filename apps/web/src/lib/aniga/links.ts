/**
 * External-link plumbing for the Bogagga dibadda ladder (ANIGA-SPEC §3.3):
 * tier 1 chip → tier 2 OG preview → tier 3 link-back verified.
 *
 * Everything here is PURE. The network lives in the API routes
 * (`POST /api/me/profile/links/verify/check` fetches, this module decides), so
 * the two rules that must never bend — a link key is one destination, and the
 * orange check is granted only by a page that actually links back — are
 * unit-testable without a socket.
 *
 * The normalized key is the join column: `profile_link_meta.url_key` hangs
 * server-owned facts (OG cache, verification state) off a member-entered URL
 * in `profiles.links`. If `http://Hodan.dev/` and `https://hodan.dev` produced
 * two keys, one destination could carry two verification states — which is
 * exactly how a "verified" badge ends up on an unverified page.
 */

/** Longer than the `profiles.links` zod cap (2048) is not a URL a member typed. */
const MAX_URL_LENGTH = 2048;

/** og_title / og_site_name are unbounded text; a hostile page is not. */
const MAX_META_LENGTH = 200;

/**
 * Short tokens collide by accident. `verification_token` is a 32-char hex
 * nonce (migration 20260811000000 §5); anything shorter is a caller bug, and
 * treating it as "not found" fails closed.
 */
const MIN_TOKEN_LENGTH = 16;

interface UrlParts {
  /** Lowercased, punycoded, `www.`-stripped, no trailing dot. */
  host: string;
  /** `:8080` for a non-default port, `''` otherwise. */
  port: string;
  /** Leading slash, no trailing slash; `''` at the root. */
  path: string;
  /** `?a=1` verbatim, `''` when absent or empty. */
  search: string;
}

/**
 * Schemes that carry no web page. Checked explicitly because a scheme-less
 * paste is the common case: members type `hodan.dev`, and `example.com:8080/x`
 * has to survive the same code path that rejects `mailto:hodan@example.com`.
 */
const NON_PAGE_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;
const HIERARCHICAL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function parseUrl(input: string): UrlParts | null {
  const raw = input.trim();
  if (raw === '' || raw.length > MAX_URL_LENGTH) return null;

  let candidate = raw;
  if (HIERARCHICAL_SCHEME.test(raw)) {
    // ftp://, ws://, chrome-extension:// — a real scheme, just not a page.
    if (!/^https?:\/\//i.test(raw)) return null;
  } else if (raw.startsWith('//')) {
    candidate = `https:${raw}`;
  } else if (NON_PAGE_SCHEME.test(raw)) {
    return null;
  } else {
    candidate = `https://${raw}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // WHATWG already lowercases and punycodes the host and drops the scheme's
  // default port, so http/https and Unicode/ASCII spellings converge here.
  const host = url.hostname.replace(/\.+$/, '').replace(/^www\./, '');
  if (host === '') return null;

  return {
    host,
    port: url.port === '' ? '' : `:${url.port}`,
    path: url.pathname.replace(/\/+$/, ''),
    search: url.search === '?' ? '' : url.search,
  };
}

/**
 * The `profile_link_meta.url_key` form: scheme-less, host lowercased, no
 * trailing slash, no fragment. Returns null for anything that is not a
 * fetchable web page.
 *
 * The query string SURVIVES: `?u=hodan` addresses a different page on plenty
 * of sites, so folding it would let one verification cover a page nobody
 * checked. The fragment does not — a server never sees it.
 */
export function normalizeUrlKey(input: string): string | null {
  const parts = parseUrl(input);
  if (!parts) return null;
  return `${parts.host}${parts.port}${parts.path}${parts.search}`;
}

/**
 * The link-back comparison key: the same normalization with the query dropped.
 *
 * A member proving they own `hodan.dev` may link back as
 * `xidig.net/u/hodan?ref=blog` or with a UTM tail. That is still this profile,
 * so document identity is host + path — while `normalizeUrlKey` (which stores
 * verification state) stays query-sensitive.
 */
export function documentKey(input: string): string | null {
  const parts = parseUrl(input);
  if (!parts) return null;
  return `${parts.host}${parts.port}${parts.path}`;
}

/** Same page, ignoring query and fragment. */
export function isSameDocument(a: string, b: string): boolean {
  const left = documentKey(a);
  return left !== null && left === documentKey(b);
}

/**
 * Same host, for the purpose of granting a verification check.
 *
 * The badge is a claim about the host the member entered, so a redirect must not
 * be able to carry it somewhere else. Without this, `evil.example` could 302 to
 * a page that legitimately links back, collect the check, and then quietly
 * repoint at anything — the orange mark would outlive the only fact it ever
 * attested. Same-host redirects (http→https, www→apex, a trailing slash) still
 * pass, because `parseUrl` already folds those spellings together.
 */
export function sameVerifiableHost(a: string, b: string): boolean {
  const left = parseUrl(a);
  const right = parseUrl(b);
  return left !== null && right !== null && left.host === right.host && left.port === right.port;
}

/** Comments hide markup from the eye but not from a regex — and `<script>` bodies are code, not links. */
function stripInert(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ');
}

const ATTRIBUTE = (name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>\`]+))`, 'i');

function attribute(tag: string, name: string): string | null {
  const match = ATTRIBUTE(name).exec(tag);
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}

/**
 * Every URL the page LINKS to — `<a href>` plus `<link rel="me">` /
 * `rel="author">` (the IndieWeb convention this ladder borrows).
 *
 * Deliberately attribute-scoped: a page that merely writes "I'm @hodan on
 * Xidig" in prose, or prints the profile URL as text, has asserted nothing a
 * machine can check. Acceptance A7 — the check is a link, not a mention.
 *
 * `pageUrl` resolves relative hrefs. Without it a relative `/u/hodan` on
 * hodan.dev cannot be told apart from an absolute one, so it is simply dropped.
 */
export function extractLinkedUrls(html: string, pageUrl?: string): string[] {
  const urls: string[] = [];
  for (const [tag] of stripInert(html).matchAll(/<(?:a|link)\b[^>]*>/gi)) {
    const isAnchor = /^<a\b/i.test(tag);
    if (!isAnchor) {
      const rel = attribute(tag, 'rel')?.toLowerCase() ?? '';
      if (!/\b(me|author)\b/.test(rel)) continue;
    }
    const href = attribute(tag, 'href')?.trim();
    if (!href) continue;
    if (pageUrl) {
      try {
        urls.push(new URL(href, pageUrl).toString());
        continue;
      } catch {
        continue;
      }
    }
    urls.push(href);
  }
  return urls;
}

/** Does the fetched page carry a link to this member's profile? */
export function linksBackToProfile(html: string, profileUrl: string, pageUrl?: string): boolean {
  const target = documentKey(profileUrl);
  if (target === null) return false;
  return extractLinkedUrls(html, pageUrl).some((href) => documentKey(href) === target);
}

/**
 * The nonce the member pasted onto their page (`profile.linkVerifyToken`).
 * Case-sensitive: it is generated hex, not copy.
 */
export function pageCarriesToken(html: string, token: string): boolean {
  if (token.trim().length < MIN_TOKEN_LENGTH) return false;
  return stripInert(html).includes(token.trim());
}

export type LinkBackFailure = 'no_link_back' | 'token_missing' | 'offsite_redirect';

export type LinkBackResult = { verified: true } | { verified: false; reason: LinkBackFailure };

/**
 * Tier 3 of the ladder, in one call. The link back is mandatory; the token is
 * an ADDITIONAL proof, checked only when the caller issued one — so a member
 * who linked back before the token existed still passes, and a page that only
 * pastes the token (no link) never does.
 */
export function checkLinkBack(
  html: string,
  options: { profileUrl: string; pageUrl?: string; token?: string | null },
): LinkBackResult {
  if (!linksBackToProfile(html, options.profileUrl, options.pageUrl)) {
    return { verified: false, reason: 'no_link_back' };
  }
  const token = options.token?.trim();
  if (token && !pageCarriesToken(html, token)) {
    return { verified: false, reason: 'token_missing' };
  }
  return { verified: true };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Unicode's ceiling — `String.fromCodePoint` throws above it, and a page can send anything. */
const MAX_CODE_POINT = 0x10ffff;

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith('#')) {
      const hex = key.startsWith('#x');
      const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[key] ?? whole;
  });
}

function cleanMeta(value: string | null): string | null {
  if (value === null) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (text === '') return null;
  return text.length > MAX_META_LENGTH ? `${text.slice(0, MAX_META_LENGTH - 1).trimEnd()}…` : text;
}

/** Tier 2 payload — what `profile_link_meta.og_*` caches. */
export interface LinkPreview {
  title: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

/** First non-empty value among the given `property`/`name` keys, in priority order. */
function metaLookup(html: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const [tag] of stripInert(html).matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attribute(tag, 'property') ?? attribute(tag, 'name'))?.toLowerCase();
    const content = attribute(tag, 'content');
    if (!key || content === null) continue;
    // First declaration wins: og:image repeats for alternate sizes, and the
    // spec orders them best-first.
    if (!values.has(key)) values.set(key, content);
  }
  return values;
}

/**
 * Parse the OG block of a fetched page. Never throws — a malformed page is a
 * `failed` preview (which renders as a bare chip, A6), not an exception on a
 * profile render path.
 *
 * `pageUrl` resolves a relative `og:image`; a data:/javascript: image is
 * dropped rather than passed along to whatever renders it.
 */
export function parseOgMetadata(html: string, pageUrl?: string): LinkPreview {
  const meta = metaLookup(html);
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = cleanMeta(meta.get(key) ?? null);
      if (value !== null) return value;
    }
    return null;
  };

  const documentTitle = cleanMeta(
    /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(stripInert(html))?.[1] ?? null,
  );

  const rawImage = pick('og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image');
  let imageUrl: string | null = null;
  if (rawImage !== null) {
    try {
      const resolved = new URL(rawImage, pageUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        imageUrl = resolved.toString();
      }
    } catch {
      imageUrl = null;
    }
  }

  return {
    title: pick('og:title', 'twitter:title') ?? documentTitle,
    siteName: pick('og:site_name', 'application-name'),
    imageUrl,
  };
}

/**
 * `og_status` for a parsed preview. A card with neither a title nor an image
 * is an empty box; the ladder says degrade to the chip instead (A6), so it is
 * `failed`, not `ok`.
 */
export function linkPreviewStatus(preview: LinkPreview): 'ok' | 'failed' {
  return preview.title !== null || preview.imageUrl !== null ? 'ok' : 'failed';
}
