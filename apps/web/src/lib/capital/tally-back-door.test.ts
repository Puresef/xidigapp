import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * No tally back door and no paid-tier gate on a paused power (Xidig Plus
 * doctrine, owner 12 Sep). The candidate vote is paused, and live tallies
 * must leave every normal API/UI surface:
 *   - no app code calls candidate_vote_tally (it is server-only in the DB,
 *     20260912100000, and no app route reads it while the vote is paused);
 *   - no app code projects a `voteTally` field;
 *   - no app code asks the tier for a paused power (create_lab,
 *     vote_candidate, builder_path, governance_rights, investor_path).
 * A source scan, so a future edit that quietly re-wires one fails here.
 */

const SRC = fileURLToPath(new URL('../../', import.meta.url)); // apps/web/src

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = walk(SRC).map((p) => ({ p: p.slice(SRC.length), src: readFileSync(p, 'utf8') }));

describe('no tally back door, no tier gate on a paused power', () => {
  it('scans the app source', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('no app code calls candidate_vote_tally', () => {
    // Comments may name the function; a call site passes it to rpc(...).
    const offenders = files.filter(({ src }) => /rpc\(\s*['"]candidate_vote_tally/.test(src));
    expect(offenders.map((f) => f.p)).toEqual([]);
  });

  it('no app code projects a voteTally field', () => {
    const offenders = files.filter(({ src }) => /\bvoteTally\b/.test(src));
    expect(offenders.map((f) => f.p)).toEqual([]);
  });

  it('no app code aggregates ballots another way (a service-role read of candidate_votes)', () => {
    // Service role bypasses RLS, so a plain select over candidate_votes would
    // rebuild the tally without the function. Only three places may touch the
    // table: the viewer's OWN ballot (views.ts, RLS client), the withdraw
    // DELETE (vote route, own row), and the Dev seeder's inserts.
    const ALLOWED = [
      'lib/capital/views.ts',
      'app/api/candidates/[id]/vote/route.ts',
      'lib/seed/test-community/run.ts',
    ];
    const offenders = files.filter(
      ({ p, src }) =>
        /from\(\s*['"]candidate_votes['"]\s*\)|['"]candidate_votes['"]\s*,/.test(src) &&
        !ALLOWED.includes(p),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
    // …and the vote route's only use of it is the own-row delete.
    const route = files.find((f) => f.p === 'app/api/candidates/[id]/vote/route.ts')!;
    expect(route.src).toMatch(/\.delete\(\)[\s\S]*\.eq\('voter_user_id', ctx\.appUser\.id\)/);
    expect(route.src).not.toMatch(/\.select\(/);
  });

  it('nothing outside the membership boundary calls has_capability, and no app path calls hasCapability', () => {
    // lib/membership.ts documents that no app path consults an active-only
    // capability while the paused powers stay paused. Pin it.
    const direct = files.filter(
      ({ p, src }) => /rpc\(\s*['"]has_capability['"]/.test(src) && p !== 'lib/membership.ts',
    );
    expect(direct.map((f) => f.p)).toEqual([]);
    const calls = files.filter(
      ({ p, src }) => /\bhasCapability\(/.test(src) && p !== 'lib/membership.ts',
    );
    expect(calls.map((f) => f.p)).toEqual([]);
  });

  it('no app code asks the tier for a paused power', () => {
    const offenders = files.filter(({ src }) =>
      /has(Capability|Entitlement)\(\s*[^,]+,\s*['"](create_lab|vote_candidate|builder_path|governance_rights|investor_path)['"]/.test(
        src,
      ),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
  });
});
