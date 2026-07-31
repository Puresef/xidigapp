import { describe, expect, it } from 'vitest';

import { aggregateComments, COMMENT_SNIPPET_MAX, type CommentAggregateRow } from './views';

/**
 * Pure comment-aggregation tests (Task 7 inline latest comment): one pass over
 * the fetched comment rows yields BOTH the published-comment count and the
 * newest comment per post (server-trimmed snippet). DB fetch + author
 * hydration are the same service-role patterns proven elsewhere; the logic
 * worth pinning is the per-post max pick and the snippet trim.
 */

function row(overrides: Partial<CommentAggregateRow> = {}): CommentAggregateRow {
  return {
    post_id: 'p1',
    author_user_id: 'u1',
    body: 'a comment',
    created_at: '2026-07-30T10:00:00Z',
    ...overrides,
  };
}

describe('aggregateComments', () => {
  it('counts comments per post', () => {
    const { counts } = aggregateComments([
      row({ post_id: 'p1' }),
      row({ post_id: 'p1' }),
      row({ post_id: 'p2' }),
    ]);
    expect(counts.get('p1')).toBe(2);
    expect(counts.get('p2')).toBe(1);
    expect(counts.get('p3')).toBeUndefined();
  });

  it('picks the newest comment per post regardless of row order', () => {
    const { latest } = aggregateComments([
      row({ post_id: 'p1', author_user_id: 'old', created_at: '2026-07-29T00:00:00Z' }),
      row({ post_id: 'p1', author_user_id: 'new', created_at: '2026-07-31T00:00:00Z' }),
      row({ post_id: 'p1', author_user_id: 'mid', created_at: '2026-07-30T00:00:00Z' }),
    ]);
    expect(latest.get('p1')?.author_user_id).toBe('new');
    expect(latest.get('p1')?.created_at).toBe('2026-07-31T00:00:00Z');
  });

  it('keeps short bodies whole and trims long ones to the snippet cap', () => {
    const short = aggregateComments([row({ body: 'short and sweet' })]);
    expect(short.latest.get('p1')?.snippet).toBe('short and sweet');

    const long = aggregateComments([row({ body: 'x'.repeat(400) })]);
    const snippet = long.latest.get('p1')?.snippet ?? '';
    expect(snippet.length).toBeLessThanOrEqual(COMMENT_SNIPPET_MAX);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('flattens newlines/whitespace so the snippet renders on one line', () => {
    const { latest } = aggregateComments([row({ body: '  line one\n\nline two\tend  ' })]);
    expect(latest.get('p1')?.snippet).toBe('line one line two end');
  });

  it('skips rows without a post_id and handles empty input', () => {
    const { counts, latest } = aggregateComments([row({ post_id: null })]);
    expect(counts.size).toBe(0);
    expect(latest.size).toBe(0);

    const empty = aggregateComments([]);
    expect(empty.counts.size).toBe(0);
    expect(empty.latest.size).toBe(0);
  });
});
