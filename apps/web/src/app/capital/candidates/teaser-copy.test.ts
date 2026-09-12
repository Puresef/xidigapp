import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The signed-out hero and the <meta description> of /capital/candidates are
 * rendered from the SAME dictionary key. That coupling is what lets the
 * wording pin in packages/i18n/src/capital-teaser.test.ts cover the metadata
 * surface too — if someone hard-codes a separate description, the pin
 * silently stops covering it. Fail loudly here instead.
 */

const PAGE = fileURLToPath(new URL('./page.tsx', import.meta.url));

describe('/capital/candidates teaser copy', () => {
  it('reads one dictionary key for both the hero and the page description', () => {
    const source = readFileSync(PAGE, 'utf8');
    expect(source.match(/t\('marketing\.capitalTeaserBody'\)/g) ?? []).toHaveLength(2);
    expect(source).toMatch(/description:\s*t\('marketing\.capitalTeaserBody'\)/);
  });
});
