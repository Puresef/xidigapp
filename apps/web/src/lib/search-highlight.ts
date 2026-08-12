/**
 * Result-row term highlighting for /search.
 *
 * The search itself matches on the folded skeleton (search-norm.ts, the twin
 * of `public.xidig_name_norm`). That fold is lossy AND length-changing —
 * digraphs collapse (dh→d, kh→k), repeats collapse (mm→m), `c` is dropped —
 * so a folded offset cannot be mapped back onto the raw string. Highlighting
 * therefore marks LITERAL case-insensitive occurrences of what the member
 * typed, and marks nothing when a row was reached by transliteration alone
 * ("Mohamed" finding "Maxamed"). Painting a highlight over characters the
 * member never typed would be a lie about why the row is here; showing the
 * row unmarked is not.
 *
 * Output is data, never markup: callers map segments to <mark> elements, so
 * no result text is ever fed through dangerouslySetInnerHTML.
 */

/** One run of result text, flagged for whether the member's query hit it. */
export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Single letters match everything; two is the same floor the query box uses. */
const MIN_TERM_LENGTH = 2;

/** Pathological queries ("a b c d e …") cannot turn a row into confetti. */
const MAX_TERMS = 8;

type Range = [start: number, end: number];

/**
 * Case-insensitive literal occurrences of every query term, merged and
 * ordered. Ranges are offsets into `text` as given — the caller slices the
 * original string, so the member sees the source's own casing.
 */
export function matchRanges(text: string, query: string): Range[] {
  if (!text || !query.trim()) return [];

  // Offsets are taken from the folded copy and used to slice the raw string,
  // which is only sound while folding is length-preserving. Some code points
  // lowercase to a different length (İ → i̇); rather than mis-slice, we skip.
  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) return [];

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return [];

  const found: Range[] = [];
  for (const term of terms) {
    // indexOf, not RegExp: the query is member input and must never be
    // compiled as a pattern.
    let from = haystack.indexOf(term);
    while (from !== -1) {
      found.push([from, from + term.length]);
      from = haystack.indexOf(term, from + 1);
    }
  }
  if (found.length === 0) return [];

  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge overlapping AND touching ranges so "todd" + "toddobaad" produce one
  // mark rather than a nested pair or a visible seam.
  const merged: Range[] = [found[0]!];
  for (const [start, end] of found.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Split `text` into alternating unmatched/matched runs. Never emits empties. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (!text) return [];
  const ranges = matchRanges(text, query);
  if (ranges.length === 0) return [{ text, match: false }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

/** Pull the window back to a whole word, but never past the match itself. */
function wordStart(text: string, from: number, limit: number): number {
  if (from === 0) return 0;
  const space = text.indexOf(' ', from);
  return space !== -1 && space + 1 <= limit ? space + 1 : from;
}

/** Push the window back to a whole word, but never before the match itself. */
function wordEnd(text: string, to: number, limit: number): number {
  if (to >= text.length) return text.length;
  const space = text.lastIndexOf(' ', to);
  return space !== -1 && space >= limit ? space : to;
}

/**
 * A `maxChars` window of `text` centred on the first match, highlighted, with
 * an ellipsis on each truncated side. With no match it falls back to the head
 * of the text — a body preview is still worth showing.
 */
export function excerptSegments(text: string, query: string, maxChars: number): HighlightSegment[] {
  const source = text.trim();
  if (!source) return [];
  if (source.length <= maxChars) return highlightSegments(source, query);

  const ranges = matchRanges(source, query);
  const first = ranges[0];

  let start = 0;
  if (first) {
    const slack = Math.max(0, maxChars - (first[1] - first[0]));
    start = Math.max(0, first[0] - Math.floor(slack / 2));
    // Keep the window full when the match sits near the end.
    start = Math.min(start, Math.max(0, source.length - maxChars));
  }
  let end = Math.min(source.length, start + maxChars);

  // Snap both edges to word boundaries without ever dropping the match.
  start = wordStart(source, start, first ? first[0] : end);
  end = wordEnd(source, end, first ? first[1] : start);

  const window = source.slice(start, end).trim();
  const segments = highlightSegments(window, query);
  if (start > 0) segments.unshift({ text: '…', match: false });
  if (end < source.length) segments.push({ text: '…', match: false });
  return segments;
}
