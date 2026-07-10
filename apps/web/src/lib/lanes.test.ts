import { describe, expect, it } from 'vitest';

import { LANES } from './lanes';

/**
 * Regression: lane slugs are "shared with the tags table seed" (see lanes.ts),
 * so every lane MUST be a legal tag name — the DB tags_name_format CHECK is
 * `^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$`. This would have caught the Phase-8
 * import/export → import-export reconciliation (a '/' is not a valid tag).
 */
const TAG_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

describe('lane taxonomy', () => {
  it('every lane slug is a valid tag name (no slashes, dash form only)', () => {
    for (const lane of LANES) {
      expect(lane, `lane "${lane}" must match the tag-name format`).toMatch(TAG_NAME_REGEX);
    }
  });

  it('uses the canonical import-export slug, never import/export', () => {
    expect(LANES).toContain('import-export');
    expect(LANES as readonly string[]).not.toContain('import/export');
  });
});
