import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Packet B gate — Show support (Garab) unlocks nothing.
 *
 * Owner ruling: Show support is a lightweight, non-financial encouragement
 * signal. It does not unlock counts, does not change governance rights, does
 * not imply investment interest, does not verify a Candidate, Venture, person,
 * business, skill or work quality, and must never be used as due-diligence,
 * readiness, ranking or funding proof.
 *
 * The data behind it is `post_cosigns` (fulfilled Asks) and `interests` rows
 * of type 'cosign' (candidates). This test pins WHERE the app reads either:
 * only the toggle routes, the count views, the controls that display them,
 * the schema enum and the dev seeder. A new reader — a tally, a submit gate,
 * a ranking, a badge grant, a capability check — fails here until someone
 * decides, deliberately, that support should feed it. The database half of
 * the same pin is packages/db/src/support-is-inert.test.ts.
 */

const SRC = path.resolve(__dirname);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** Comments can mention the concept freely; only code counts as a reader. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const SUPPORT_READ =
  /post_cosigns|fetchPostCosigns|['"]cosign['"]|\.cosign\b|\bcosign\s*:|cosignInterests/;

/** file (relative to src) → why it may touch support rows. */
const ALLOWED: Record<string, string> = {
  'app/api/posts/[id]/cosign/route.ts': 'the fulfilled-Ask toggle (write own row, echo count)',
  'app/api/candidates/[id]/interests/route.ts': 'the candidate toggle (write own row, echo counts)',
  'lib/plaza/cosigns.ts': 'count + own-row view for the Ask control',
  'lib/capital/views.ts': 'aggregate count for the candidate control',
  'lib/capital/schemas.ts': 'interest_type enum validation',
  'app/p/[id]/page.tsx': 'hands the count to GarabButton',
  'components/capital/interest-bar.tsx': 'the /c/[id] control itself',
  'lib/seed/test-community/run.ts': 'Dev seeder writes fixture support rows',
  'lib/seed/test-community/spaces.ts': 'Dev seeder fixture data',
};

function readers(): string[] {
  return walk(SRC)
    .filter((file) => SUPPORT_READ.test(stripComments(readFileSync(file, 'utf8'))))
    .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
    .sort();
}

describe('Show support is read only where it is displayed or toggled', () => {
  it('no module outside the display/toggle allowlist reads support rows', () => {
    expect(readers()).toEqual(Object.keys(ALLOWED).sort());
  });

  it('consequential modules exist and do not read support (vote tally, submission, capability, reputation, badges)', () => {
    const consequential = [
      'lib/capital/tally.ts',
      'app/api/candidates/[id]/submit/route.ts',
      'app/api/candidates/[id]/vote/route.ts',
      'app/api/candidates/[id]/decision/route.ts',
      'app/api/candidates/[id]/reviews/route.ts',
      'lib/membership.ts',
      'lib/reputation/constants.ts',
      'lib/reputation/service.ts',
      'lib/aniga/badges.ts',
    ];
    for (const rel of consequential) {
      const file = path.join(SRC, rel);
      expect(existsSync(file), `${rel} moved — update this gate`).toBe(true);
      expect(SUPPORT_READ.test(stripComments(readFileSync(file, 'utf8'))), rel).toBe(false);
    }
  });

  it('every allowlisted reader carries a stated reason', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, file).toBeGreaterThan(10);
    }
  });
});
