import { ApiError } from '@/lib/api';
import { normalizeUrlKey } from '@/lib/aniga/links';
import type { AuthContext } from '@/lib/auth/guards';
import { env } from '@/env';

/**
 * Server half of the link-back ladder (tier 3): who may ask for a check, and
 * what the server is allowed to fetch on their behalf.
 *
 * `lib/aniga/links.ts` decides the VERDICT from a document; this decides
 * whether a document may be retrieved at all. Kept apart because the verdict
 * has to be unit-testable without a socket, while everything here is inherently
 * about the socket.
 */

/** One redirect chain, not a crawl. */
const MAX_REDIRECTS = 3;

/**
 * A link-back sits in the head or the footer of a normal page. Half a megabyte
 * is generous for that and small enough that a hostile endpoint streaming
 * forever cannot hold a route handler open.
 */
const MAX_BYTES = 512 * 1024;

const TIMEOUT_MS = 6_000;

/** Why the server declined to fetch. Logged, never echoed — see fetchLinkPage. */
export type LinkFetchRefusal = 'scheme' | 'credentials' | 'port' | 'private_host';

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function ipv4Blocked(octets: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0] = octets;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC6598)
  if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // protocol assignments / TEST-NET-1
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

function ipv6Blocked(bracketed: string): boolean {
  const address = bracketed.slice(1, -1).toLowerCase();
  if (address === '::1' || address === '::') return true;
  if (/^f[cd]/.test(address)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(address)) return true; // fe80::/10 link-local

  // A private v4 wearing a v6 hat. WHATWG re-serializes the dotted form
  // (`::ffff:169.254.169.254`) into hex groups (`::ffff:a9fe:a9fe`), so the
  // hex spelling is the one that actually arrives — matching only the dotted
  // one would leave the metadata endpoint reachable.
  const mapped = /^::ffff:(.+)$/.exec(address)?.[1];
  if (mapped === undefined) return false;
  if (mapped.includes('.')) {
    const octets = parseIpv4(mapped);
    return octets === null || ipv4Blocked(octets);
  }
  const groups = mapped.split(':');
  if (groups.length !== 2) return true; // unrecognised mapped form — fail closed
  const [high, low] = groups.map((group) => Number.parseInt(group, 16));
  if (high === undefined || low === undefined || Number.isNaN(high) || Number.isNaN(low)) {
    return true;
  }
  return ipv4Blocked([high >> 8, high & 0xff, low >> 8, low & 0xff]);
}

/**
 * The SSRF gate: null means the server may fetch this URL, anything else names
 * the reason it must not.
 *
 * Strict about ports (scheme default only) because an arbitrary port turns the
 * checker into a port scanner that reports through response timing. Strict
 * about dotless hostnames because `http://db` resolves inside a container
 * network and nowhere on the public internet.
 *
 * KNOWN GAP: a public hostname whose DNS answer points at a private address
 * (DNS rebinding) still passes — `fetch` offers no hook to inspect the resolved
 * socket. Re-running this on every redirect hop closes the redirect-to-metadata
 * variant; closing rebinding needs a custom dispatcher (noted for follow-up).
 */
export function refuseLinkFetch(url: URL): LinkFetchRefusal | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'scheme';
  if (url.username || url.password) return 'credentials';
  if (url.port && url.port !== '80' && url.port !== '443') return 'port';

  const hostname = url.hostname.toLowerCase();
  if (hostname.startsWith('[')) return ipv6Blocked(hostname) ? 'private_host' : null;

  const octets = parseIpv4(hostname);
  if (octets) return ipv4Blocked(octets) ? 'private_host' : null;

  if (BLOCKED_HOSTS.has(hostname)) return 'private_host';
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return 'private_host';
  if (!hostname.includes('.')) return 'private_host';

  return null;
}

/** Read at most `MAX_BYTES`, then hang up. A truncated head is still checkable. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder('utf-8');
  const chunks: string[] = [];
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      seen += value.byteLength;
      if (seen >= MAX_BYTES) {
        chunks.push(decoder.decode(value.slice(0, value.byteLength - (seen - MAX_BYTES))));
        break;
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return chunks.join('');
}

export interface FetchedPage {
  document: string;
  /** The URL the chain landed on — resolves relative hrefs in the matcher. */
  finalUrl: string;
}

/**
 * Fetch a member-supplied page under the guard. Returns null for every failure
 * — refused destination, transport error, non-HTML body, HTTP error status —
 * because the route treats all of them identically: the check did not find a
 * link back, which is `failed`, not a server fault.
 */
export async function fetchLinkPage(target: URL): Promise<FetchedPage | null> {
  let current = target;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const refusal = refuseLinkFetch(current);
    if (refusal) {
      // Host and reason only: echoing the URL would let a prober map what the
      // server can reach by reading its own logs through an error response.
      console.warn(`[aniga] link check refused (${refusal})`);
      return null;
    }

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': `Xidig-LinkCheck/1.0 (+${env.APP_URL})`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) return null;
      try {
        current = new URL(location, current);
      } catch {
        return null;
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/^text\/(html|plain)/i.test(contentType)) {
      await response.body?.cancel().catch(() => {});
      return null;
    }

    return { document: await readCapped(response), finalUrl: current.toString() };
  }

  return null;
}

/** A stored `profiles.links` entry may be scheme-less; the fetcher needs absolute. */
function toAbsoluteUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  for (const candidate of [trimmed, `https://${trimmed}`]) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url;
    } catch {
      // Try the next spelling.
    }
  }
  return null;
}

export interface OwnLink {
  /** `profile_link_meta.url_key`. */
  urlKey: string;
  /** Absolute URL to fetch, scheme preserved from what the member stored. */
  url: URL;
  handle: string;
}

/**
 * Resolve a submitted URL against the caller's OWN `profiles.links`.
 *
 * This is the authorization for both verify routes. Without it the endpoints
 * would mint owner-only nonces for arbitrary URLs and fetch arbitrary pages on
 * request — a token oracle bolted to a proxy. A member can only ever verify a
 * link they have already published on their profile.
 */
export async function resolveOwnLink(ctx: AuthContext, rawUrl: string): Promise<OwnLink> {
  const urlKey = normalizeUrlKey(rawUrl);
  if (urlKey === null) throw new ApiError('invalid_request', 400);

  const { data: profile, error } = await ctx.supabase
    .from('profiles')
    .select('handle, links')
    .eq('user_id', ctx.appUser.id)
    .maybeSingle();
  if (error) throw new Error(`profile links lookup failed: ${error.message}`);
  if (!profile) throw new ApiError('profile_incomplete', 409);

  const stored = Array.isArray(profile.links) ? (profile.links as Array<{ url?: unknown }>) : [];
  const match = stored.find(
    (link) => typeof link?.url === 'string' && normalizeUrlKey(link.url) === urlKey,
  );
  if (!match || typeof match.url !== 'string') throw new ApiError('invalid_request', 400);

  const url = toAbsoluteUrl(match.url);
  if (url === null) throw new ApiError('invalid_request', 400);

  return { urlKey, url, handle: profile.handle };
}

/**
 * Every spelling of the member's profile URL a link-back may legitimately use.
 *
 * The apex is accepted alongside APP_URL because that is the URL members
 * actually share — a deployment serving app.xidig.net must still honour a blog
 * that links to xidig.net/u/hodan. `isSameDocument` in links.ts already folds
 * scheme, `www.`, trailing slash and query, so this list is only about hosts.
 */
export function profileUrlCandidates(handle: string): string[] {
  const bases = new Set([(env.APP_URL ?? '').replace(/\/+$/, ''), 'https://xidig.net']);
  return [...bases].filter((base) => base !== '').map((base) => `${base}/u/${handle}`);
}
