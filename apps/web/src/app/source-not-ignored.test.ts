import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Source that .gitignore swallows works on the machine that wrote it and is
 * missing from every build made from git. That is how the /out interstitial
 * 404'd in production: the page was written in July, but the unanchored
 * `out/` rule (meant for Next's static-export folder) also matched
 * apps/web/src/app/out/, so it was never committed. The still-unanchored
 * `dist/` and `build/` rules could swallow a route the same way. This fails
 * as soon as such a file exists on the machine running the suite.
 */

const here = fileURLToPath(new URL('.', import.meta.url));

function git(args: string[]) {
  return spawnSync('git', args, { cwd: here, encoding: 'utf8' });
}

const inCheckout = git(['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true';

/** OS litter an editor may drop anywhere — ignored on purpose, never source. */
const OS_LITTER = /(^|\/)\.DS_Store$/;

describe('source is never git-ignored', () => {
  it.skipIf(!inCheckout)(
    'no file under apps/web/src or packages/*/src matches an ignore rule',
    () => {
      const result = git([
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
        '--',
        ':(top)apps/web/src',
        ':(top)packages/*/src',
      ]);
      expect(result.status).toBe(0);
      const ignored = result.stdout
        .split('\n')
        .filter((path) => path !== '' && !OS_LITTER.test(path));
      expect(ignored).toEqual([]);
    },
  );
});
