import { Fragment } from 'react';

import { excerptSegments, highlightSegments, type HighlightSegment } from '@/lib/search-highlight';

/**
 * Renders result text with the member's own query marked in place.
 *
 * The segments arrive as DATA from lib/search-highlight — a list of runs and
 * whether each one matched — so result text is never assembled as an HTML
 * string and never passes through dangerouslySetInnerHTML. That matters here
 * more than most places: every string on this surface is member-authored
 * (display names, bios, business descriptions, post bodies).
 *
 * Translated copy is never highlighted, only member content: the dictionary
 * returns plain strings with no markup support, and a term that happens to
 * appear inside our own UI copy is not a search hit.
 */
function render(segments: HighlightSegment[]) {
  return segments.map((segment, index) =>
    segment.match ? (
      <mark key={index} className="xidig-search-mark">
        {segment.text}
      </mark>
    ) : (
      <Fragment key={index}>{segment.text}</Fragment>
    ),
  );
}

/** The whole string, with every literal occurrence of the query marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  return <>{render(highlightSegments(text, query))}</>;
}

/** A window of a longer body, centred on the first match and ellipsised. */
export function Excerpt({
  text,
  query,
  maxChars = 150,
}: {
  text: string;
  query: string;
  maxChars?: number;
}) {
  return <>{render(excerptSegments(text, query, maxChars))}</>;
}
