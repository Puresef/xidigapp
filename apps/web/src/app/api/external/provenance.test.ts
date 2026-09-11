import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  API_SCOPES,
  MEMBER_MINTABLE_SCOPES,
  SCOPE_PROVENANCE,
  type ApiScope,
} from '@/lib/api-keys/scopes';

/**
 * External API writes never simulate or obscure organic member activity
 * (owner ruling, 11 Sep).
 *
 * Every external write today publishes as the PLATFORM, not as the key's
 * owner: Plaza posts are authored by the badged AI account, seeded listings
 * have no owner, Lab templates have no creator — only the audit log records
 * which key and owner made the call. None preserves member provenance, so
 * every write scope is an OPERATIONAL scope: admin-only, audited, labelled.
 *
 * This contract scans every route under app/api/external and pins:
 *   * each scope has a declared provenance class;
 *   * a member/mod may mint only read-only scopes;
 *   * every write handler requires a non-read-only scope and writes an
 *     audit row;
 *   * any route that publishes through the seed builders / seed actor is
 *     behind a `platform_seed_actor` scope.
 * A new write route that skips any of this fails here.
 */

const EXTERNAL = __dirname;
const WRITE_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];
const SEED_MARKER = /\b(getSeedActorUserId|createSeeded\w*|updateSeeded\w*)\(/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

/** Each exported handler's source, keyed by method. */
function handlers(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /export async function (GET|POST|PATCH|PUT|DELETE)\(/g;
  const starts = [...source.matchAll(re)].map((m) => ({ method: m[1]!, at: m.index! }));
  starts.forEach((s, i) =>
    out.set(s.method, source.slice(s.at, starts[i + 1]?.at ?? source.length)),
  );
  return out;
}

const requiredScope = (body: string) =>
  body.match(/requireApiKey\(\s*request,\s*'([^']+)'/)?.[1] as ApiScope | undefined;

describe('external API scope provenance', () => {
  it('every scope has a declared provenance class', () => {
    expect(Object.keys(SCOPE_PROVENANCE).sort()).toEqual(Object.keys(API_SCOPES).sort());
  });

  it('members and mods may mint read-only scopes only', () => {
    for (const scope of MEMBER_MINTABLE_SCOPES) {
      expect(SCOPE_PROVENANCE[scope], scope).toBe('read_only');
    }
  });

  const files = routeFiles(EXTERNAL);

  it('finds the external routes it is meant to police', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => [relative(EXTERNAL, f), f]))(
    '%s: writes are operational (admin-only scope) and audited',
    (_rel, file) => {
      const source = readFileSync(file, 'utf8');
      for (const [method, body] of handlers(source)) {
        const scope = requiredScope(body);
        if (!WRITE_METHODS.includes(method)) continue;
        expect(scope, `${method} must authenticate with a scoped key`).toBeDefined();
        expect(SCOPE_PROVENANCE[scope!], `${method} ${scope}`).not.toBe('read_only');
        expect(MEMBER_MINTABLE_SCOPES).not.toContain(scope);
        expect(body, `${method} must audit`).toMatch(/writeAudit\(/);
        if (SEED_MARKER.test(body)) {
          expect(SCOPE_PROVENANCE[scope!], `${method} publishes as the platform`).toBe(
            'platform_seed_actor',
          );
        }
      }
    },
  );
});
