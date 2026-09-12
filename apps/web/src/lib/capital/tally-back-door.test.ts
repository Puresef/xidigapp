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

  it('no app code asks the tier for a paused power', () => {
    const offenders = files.filter(({ src }) =>
      /has(Capability|Entitlement)\(\s*[^,]+,\s*['"](create_lab|vote_candidate|builder_path|governance_rights|investor_path)['"]/.test(
        src,
      ),
    );
    expect(offenders.map((f) => f.p)).toEqual([]);
  });
});
