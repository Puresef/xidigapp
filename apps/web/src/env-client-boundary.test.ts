import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Client/server env boundary gate.
 *
 * `src/env.ts` validates the FULL server schema at import time and throws when
 * required vars are missing. In a browser bundle that is ALWAYS: Next.js only
 * inlines literal `process.env.NEXT_PUBLIC_*` accesses, so the wholesale
 * `process.env` object env.ts parses is empty there. Any `'use client'` file
 * that transitively VALUE-imports env.ts therefore crashes at module
 * evaluation — live incident (11 Jul): post-card → plaza/views →
 * media/storage → env took down the signed-in home, /plaza and /saved
 * (Sentry JAVASCRIPT-NEXTJS-C).
 *
 * This test walks the real import graph and fails on any such chain, printing
 * it. Type-only imports are fine (erased at compile). Client code that needs
 * a NEXT_PUBLIC var must read it as a literal property access instead — see
 * lib/supabase-browser.ts and lib/media/storage.ts for the pattern.
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

function resolveSpecifier(spec: string, from: string): string | null {
  let base: string | null = null;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null; // package imports can't reach src/env.ts
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Value imports only — `import type {...}` and all-`type` clauses are erased. */
function valueImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const deps: string[] = [];
  for (const match of text.matchAll(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = (match[1] ?? '').trim();
    const spec = match[2] ?? '';
    if (clause.startsWith('type ')) continue;
    const braces = /\{([\s\S]*?)\}/.exec(clause);
    const hasDefault = /^[A-Za-z_$][\w$]*/.test(clause) && !clause.startsWith('{');
    const hasStar = /\*\s+as\s+/.test(clause);
    const hasValueSpecifier = (braces?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .some((s) => !s.startsWith('type '));
    if (!hasDefault && !hasStar && !hasValueSpecifier) continue;
    const resolved = resolveSpecifier(spec, file);
    if (resolved) deps.push(resolved);
  }
  // side-effect imports (`import './x'`) are value imports too
  for (const match of text.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
    const resolved = resolveSpecifier(match[1] ?? '', file);
    if (resolved) deps.push(resolved);
  }
  return deps;
}

describe('env.ts client boundary', () => {
  it("no 'use client' file transitively value-imports src/env.ts", () => {
    const files = walk(SRC);
    const envFile = path.join(SRC, 'env.ts');

    // Reverse-BFS from env.ts along value-import edges.
    const importedBy = new Map<string, string[]>();
    for (const file of files) {
      for (const dep of valueImports(file)) {
        const list = importedBy.get(dep) ?? [];
        list.push(file);
        importedBy.set(dep, list);
      }
    }
    const parent = new Map<string, string>();
    const reachable = new Set<string>([envFile]);
    const queue = [envFile];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const importer of importedBy.get(current) ?? []) {
        if (reachable.has(importer)) continue;
        reachable.add(importer);
        parent.set(importer, current);
        queue.push(importer);
      }
    }

    const offenders: string[] = [];
    for (const file of reachable) {
      const head = readFileSync(file, 'utf8').slice(0, 200);
      if (/^['"]use client['"]/m.test(head)) {
        const chain: string[] = [];
        let cursor: string | undefined = file;
        while (cursor) {
          chain.push(path.relative(SRC, cursor));
          cursor = parent.get(cursor);
        }
        offenders.push(chain.join(' → '));
      }
    }

    expect(offenders, `client bundles importing env.ts:\n${offenders.join('\n')}`).toEqual([]);
  });
});
