import { describe, expect, it } from 'vitest';

import {
  COMMENT_BODY_MAX,
  POLL_DEFAULT_DAYS,
  POST_BODY_MAX,
  POST_MAX_IMAGES,
  POST_TITLE_MAX,
  TAGS_PER_POST_MAX,
} from '@/lib/plaza/constants';
import {
  askActionSchema,
  commentCreateSchema,
  moderationDecisionSchema,
  postCreateSchema,
  postUpdateSchema,
  tagNameSchema,
  voteSchema,
} from '@/lib/plaza/schemas';

const UUID = '11111111-1111-4111-8111-111111111111';

const pollBase = { type: 'poll', body: 'Maalinta kulanka?' } as const;

describe('postCreateSchema', () => {
  it.each(['intro', 'ask', 'win', 'update'] as const)(
    'parses a minimal %s post (body only)',
    (type) => {
      const result = postCreateSchema.safeParse({ type, body: 'salaan' });
      expect(result.success).toBe(true);
    },
  );

  it('parses a minimal poll and defaults closesInDays', () => {
    const parsed = postCreateSchema.parse({ ...pollBase, options: ['Jimce', 'Sabti'] });
    expect(parsed.type).toBe('poll');
    if (parsed.type === 'poll') {
      expect(parsed.closesInDays).toBe(POLL_DEFAULT_DAYS);
    }
  });

  it('enforces poll option count bounds (2–6)', () => {
    expect(postCreateSchema.safeParse({ ...pollBase, options: ['A'] }).success).toBe(false);
    expect(
      postCreateSchema.safeParse({ ...pollBase, options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })
        .success,
    ).toBe(false);
    expect(postCreateSchema.safeParse({ ...pollBase, options: ['A', 'B'] }).success).toBe(true);
    expect(
      postCreateSchema.safeParse({ ...pollBase, options: ['A', 'B', 'C', 'D', 'E', 'F'] }).success,
    ).toBe(true);
  });

  it('enforces closesInDays bounds (1–7)', () => {
    const options = ['A', 'B'];
    expect(postCreateSchema.safeParse({ ...pollBase, options, closesInDays: 0 }).success).toBe(
      false,
    );
    expect(postCreateSchema.safeParse({ ...pollBase, options, closesInDays: 8 }).success).toBe(
      false,
    );
    expect(postCreateSchema.safeParse({ ...pollBase, options, closesInDays: 7 }).success).toBe(
      true,
    );
  });

  it('requires a non-empty body and enforces its max length', () => {
    expect(postCreateSchema.safeParse({ type: 'intro' }).success).toBe(false);
    expect(postCreateSchema.safeParse({ type: 'intro', body: '   ' }).success).toBe(false);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'a'.repeat(POST_BODY_MAX) }).success,
    ).toBe(true);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'a'.repeat(POST_BODY_MAX + 1) }).success,
    ).toBe(false);
  });

  it('enforces the title max length', () => {
    expect(
      postCreateSchema.safeParse({ type: 'win', body: 'guul', title: 'a'.repeat(POST_TITLE_MAX) })
        .success,
    ).toBe(true);
    expect(
      postCreateSchema.safeParse({
        type: 'win',
        body: 'guul',
        title: 'a'.repeat(POST_TITLE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it('only accepts http(s) linkUrl values', () => {
    expect(
      postCreateSchema.safeParse({ type: 'update', body: 'war', linkUrl: 'https://example.com' })
        .success,
    ).toBe(true);
    expect(
      postCreateSchema.safeParse({ type: 'update', body: 'war', linkUrl: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
    expect(
      postCreateSchema.safeParse({ type: 'update', body: 'war', linkUrl: 'not a url' }).success,
    ).toBe(false);
  });

  it('caps imageIds at POST_MAX_IMAGES', () => {
    const ids = (n: number): string[] => Array.from({ length: n }, () => UUID);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'x', imageIds: ids(POST_MAX_IMAGES) })
        .success,
    ).toBe(true);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'x', imageIds: ids(POST_MAX_IMAGES + 1) })
        .success,
    ).toBe(false);
  });

  it('caps tagIds at TAGS_PER_POST_MAX', () => {
    const ids = (n: number): string[] => Array.from({ length: n }, () => UUID);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'x', tagIds: ids(TAGS_PER_POST_MAX) })
        .success,
    ).toBe(true);
    expect(
      postCreateSchema.safeParse({ type: 'intro', body: 'x', tagIds: ids(TAGS_PER_POST_MAX + 1) })
        .success,
    ).toBe(false);
  });
});

describe('postUpdateSchema', () => {
  it('rejects an empty patch', () => {
    expect(postUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing the title with null', () => {
    expect(postUpdateSchema.safeParse({ title: null }).success).toBe(true);
  });

  it('accepts a body-only edit', () => {
    expect(postUpdateSchema.safeParse({ body: 'cusub' }).success).toBe(true);
  });
});

describe('askActionSchema', () => {
  it('credit requires a comment uuid', () => {
    expect(askActionSchema.safeParse({ action: 'credit', commentId: UUID }).success).toBe(true);
    expect(askActionSchema.safeParse({ action: 'credit', commentId: 'nope' }).success).toBe(false);
    expect(askActionSchema.safeParse({ action: 'credit' }).success).toBe(false);
  });

  it('close takes no extra fields', () => {
    expect(askActionSchema.safeParse({ action: 'close' }).success).toBe(true);
  });
});

describe('tagNameSchema (mirrors DB tags_name_format CHECK)', () => {
  it('accepts a well-formed slug', () => {
    expect(tagNameSchema.parse('halal-finance')).toBe('halal-finance');
  });

  it('lowercases before validating', () => {
    expect(tagNameSchema.parse('Fintech')).toBe('fintech');
  });

  it('rejects single characters, leading dashes, and >50 chars', () => {
    expect(tagNameSchema.safeParse('x').success).toBe(false);
    expect(tagNameSchema.safeParse('-bad').success).toBe(false);
    expect(tagNameSchema.safeParse('a'.repeat(51)).success).toBe(false);
    expect(tagNameSchema.safeParse('a'.repeat(50)).success).toBe(true);
  });
});

describe('voteSchema', () => {
  it('requires a uuid optionId', () => {
    expect(voteSchema.safeParse({ optionId: UUID }).success).toBe(true);
    expect(voteSchema.safeParse({ optionId: '123' }).success).toBe(false);
    expect(voteSchema.safeParse({}).success).toBe(false);
  });
});

describe('commentCreateSchema', () => {
  it('requires a non-empty trimmed body within the cap', () => {
    expect(commentCreateSchema.parse({ body: '  waad mahadsantahay  ' }).body).toBe(
      'waad mahadsantahay',
    );
    expect(commentCreateSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(commentCreateSchema.safeParse({ body: 'a'.repeat(COMMENT_BODY_MAX + 1) }).success).toBe(
      false,
    );
  });
});

describe('moderationDecisionSchema', () => {
  it('accepts only the three decisions', () => {
    expect(moderationDecisionSchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(moderationDecisionSchema.safeParse({ decision: 'removed' }).success).toBe(true);
    expect(moderationDecisionSchema.safeParse({ decision: 'dismissed' }).success).toBe(true);
    expect(moderationDecisionSchema.safeParse({ decision: 'pending' }).success).toBe(false);
  });

  it('caps the optional note at 1000 chars', () => {
    expect(
      moderationDecisionSchema.safeParse({ decision: 'removed', note: 'a'.repeat(1000) }).success,
    ).toBe(true);
    expect(
      moderationDecisionSchema.safeParse({ decision: 'removed', note: 'a'.repeat(1001) }).success,
    ).toBe(false);
  });
});
