import { describe, expect, it } from 'vitest';

import { excerptSegments, highlightSegments, matchRanges } from './search-highlight';

/**
 * Result-row term highlighting. The search itself matches on the FOLDED
 * skeleton (search-norm), but folding is lossy and length-changing — digraphs
 * collapse (dh→d), repeats collapse (mm→m) — so a folded offset cannot be
 * mapped back onto the raw string. Highlighting therefore marks LITERAL
 * case-insensitive occurrences only: when a row matched by transliteration
 * ("Mohamed" finding "Maxamed") nothing is marked, which is honest — we never
 * paint a highlight over characters the member did not type.
 */
describe('matchRanges', () => {
  it('finds a literal occurrence regardless of case', () => {
    expect(matchRanges('Toddobaadkan Xidig', 'toddobaad')).toEqual([[0, 9]]);
    expect(matchRanges('the TODDOBAAD digest', 'Toddobaad')).toEqual([[4, 13]]);
  });

  it('finds every occurrence, in order', () => {
    expect(matchRanges('toddobaad iyo toddobaadkan', 'toddobaad')).toEqual([
      [0, 9],
      [14, 23],
    ]);
  });

  it('treats each whitespace-separated word as its own term', () => {
    expect(matchRanges('Xawaash House', 'xawaash house')).toEqual([
      [0, 7],
      [8, 13],
    ]);
  });

  it('merges overlapping and adjacent ranges into one', () => {
    // "todd" and "toddobaad" both hit at 0 — one range, not two nested marks.
    expect(matchRanges('toddobaadkan', 'todd toddobaad')).toEqual([[0, 9]]);
    // "xaw" + "aash" are adjacent — they join rather than producing a seam.
    expect(matchRanges('xawaash', 'xaw aash')).toEqual([[0, 7]]);
  });

  it('ignores terms shorter than the minimum, so one stray letter cannot light up the page', () => {
    expect(matchRanges('Toddobaadkan Xidig', 'a')).toEqual([]);
    expect(matchRanges('Toddobaadkan Xidig', 'xidig a')).toEqual([[13, 18]]);
  });

  it('treats the query as literal text, never as a pattern', () => {
    expect(matchRanges('a.c and abc', '.c')).toEqual([[1, 3]]);
    expect(matchRanges('cost is $5 (each)', '(each)')).toEqual([[11, 17]]);
    expect(() => matchRanges('anything', '[')).not.toThrow();
  });

  it('returns nothing for an empty or all-noise query', () => {
    expect(matchRanges('Toddobaadkan', '')).toEqual([]);
    expect(matchRanges('Toddobaadkan', '   ')).toEqual([]);
    expect(matchRanges('', 'toddobaad')).toEqual([]);
  });

  it('degrades to no highlight when case folding would shift offsets', () => {
    // Turkish dotted capital lowercases to two code units; slicing by the
    // folded offsets would cut the raw string in the wrong place. Marking
    // nothing beats marking the wrong characters.
    const text = 'İstanbul toddobaad';
    expect(text.toLowerCase().length).not.toBe(text.length);
    expect(matchRanges(text, 'toddobaad')).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('splits the text into alternating plain and matched segments', () => {
    expect(highlightSegments('Toddobaadkan Xidig', 'toddobaad')).toEqual([
      { text: 'Toddobaad', match: true },
      { text: 'kan Xidig', match: false },
    ]);
  });

  it('preserves the original casing of the matched run', () => {
    const [first] = highlightSegments('TODDOBAADkan', 'toddobaad');
    expect(first).toEqual({ text: 'TODDOBAAD', match: true });
  });

  it('returns one plain segment when nothing matches', () => {
    expect(highlightSegments('Maxamed Warsame', 'mohamed')).toEqual([
      { text: 'Maxamed Warsame', match: false },
    ]);
  });

  it('handles a match that spans the whole string', () => {
    expect(highlightSegments('xidig', 'xidig')).toEqual([{ text: 'xidig', match: true }]);
  });

  it('emits no empty segments', () => {
    for (const segment of highlightSegments('toddobaad kasta toddobaad', 'toddobaad')) {
      expect(segment.text.length).toBeGreaterThan(0);
    }
  });

  it('reconstructs the original text exactly when the segments are joined', () => {
    const text = 'Dalabka toddobaadkan: diiwaangelintu waxay xirmaysaa Jimcaha';
    const joined = highlightSegments(text, 'toddobaad jimcaha')
      .map((segment) => segment.text)
      .join('');
    expect(joined).toBe(text);
  });
});

describe('excerptSegments', () => {
  const body =
    'Wararkii ugu waaweynaa ee toddobaadkan: saddex Lab oo cusub, laba guul, ' +
    'iyo suaalaha bulshada oo dhan — akhri warbixinta buuxda halkan.';

  it('leaves a short text alone, with no ellipsis', () => {
    expect(excerptSegments('Short line', 'short', 120)).toEqual([
      { text: 'Short', match: true },
      { text: ' line', match: false },
    ]);
  });

  it('windows around the first match rather than truncating from the start', () => {
    const text = `${'x'.repeat(300)} toddobaad tail`;
    const joined = excerptSegments(text, 'toddobaad', 60)
      .map((segment) => segment.text)
      .join('');
    expect(joined).toContain('toddobaad');
    expect(joined.startsWith('…')).toBe(true);
  });

  it('keeps the match marked inside the window', () => {
    const segments = excerptSegments(body, 'toddobaad', 60);
    expect(segments.some((segment) => segment.match && /toddobaad/i.test(segment.text))).toBe(true);
  });

  it('never exceeds the budget by more than the two ellipses', () => {
    const joined = excerptSegments(body, 'bulshada', 60)
      .map((segment) => segment.text)
      .join('');
    expect(joined.length).toBeLessThanOrEqual(62);
  });

  it('falls back to a head window when nothing matches', () => {
    const joined = excerptSegments(body, 'zzzzzz', 40)
      .map((segment) => segment.text)
      .join('');
    expect(joined.startsWith('Wararkii')).toBe(true);
    expect(joined.endsWith('…')).toBe(true);
  });

  it('trims to a word boundary instead of cutting mid-word', () => {
    const joined = excerptSegments(body, 'zzzzzz', 40)
      .map((segment) => segment.text)
      .join('');
    const kept = joined.replace(/…$/, '');
    // The source character right after the kept run must be a space — i.e.
    // the excerpt ends on a whole word, with the ellipsis flush against it.
    expect(body.slice(kept.length, kept.length + 1)).toMatch(/\s/);
  });

  it('returns nothing for empty text', () => {
    expect(excerptSegments('', 'toddobaad', 60)).toEqual([]);
    expect(excerptSegments('   ', 'toddobaad', 60)).toEqual([]);
  });
});
