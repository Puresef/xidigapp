/**
 * @handle mention parsing (§13 "Mentions: @handle for users … mentioning
 * notifies"). Pure + deterministic so it is unit-testable; the DB-side
 * resolution + notification fan-out lives in lib/notifications/mentions.ts.
 *
 * Handles are `[a-z0-9_]{3,30}` (lib/profiles.ts HANDLE_REGEX, mirrored by the
 * profiles_handle_format CHECK). The mention pattern therefore:
 *   - requires the `@` to sit at a token boundary (start or a non-handle
 *     char), so `someone@example.com` is NOT a mention;
 *   - captures 3–30 handle chars and asserts the next char is also a
 *     non-handle char, so an over-long token can't yield a bogus 30-char
 *     handle prefix.
 */

const MENTION_RE = /(?:^|[^a-z0-9_@])@([a-z0-9_]{3,30})(?![a-z0-9_])/gi;

/** Hard cap on mentions honoured per piece of content — anti-spam fan-out guard. */
export const MAX_MENTIONS_PER_CONTENT = 20;

/**
 * Extract unique, lowercased handles mentioned in `text`, in first-seen order,
 * capped at MAX_MENTIONS_PER_CONTENT. Returns handles WITHOUT the leading `@`.
 */
export function parseMentions(text: string, limit = MAX_MENTIONS_PER_CONTENT): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[1]?.toLowerCase();
    if (!handle) continue;
    if (!seen.has(handle)) {
      seen.add(handle);
      if (seen.size >= limit) break;
    }
  }
  return [...seen];
}
