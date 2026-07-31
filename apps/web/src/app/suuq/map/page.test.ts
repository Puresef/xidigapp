import { describe, expect, it } from 'vitest';

import SuuqMapRedirect from './page';

/**
 * Task 12: /suuq/map is a permanent redirect to the canonical /suuq?tab=map
 * surface. next's permanentRedirect throws a control-flow error whose digest
 * encodes destination + status — assert both so a future edit can't silently
 * downgrade the redirect or point it elsewhere.
 */
describe('/suuq/map', () => {
  it('permanently redirects to /suuq?tab=map', () => {
    let digest = '';
    try {
      SuuqMapRedirect();
      expect.unreachable('page rendered instead of redirecting');
    } catch (error) {
      digest = (error as { digest?: string }).digest ?? '';
    }
    expect(digest).toContain('NEXT_REDIRECT');
    expect(digest).toContain('/suuq?tab=map');
    expect(digest).toContain('308');
  });
});
