import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Ratchet: no platform-role literal comparison outside lib/auth/privilege.ts.
 *
 * `role === 'admin'` / `role === 'mod'` in a route or page grants privilege on
 * the role alone — a pending_deletion, suspended, deactivated or deleted
 * admin keeps it wherever the check runs through the service role (the
 * database's active-only is_mod()/is_admin() never see those paths). The 11
 * Sep inventory found 29 such sites; all now go through the active-aware
 * helpers (isActiveModOrAdmin / isActiveAdmin / hasActiveRole /
 * effectivePlatformRole). A new literal fails here — use a helper instead.
 */

const WEB_SRC = join(__dirname, '..', '..');
const ALLOWED = new Set(['lib/auth/privilege.ts']);
const LITERAL =
  /\brole\s*[!=]==?\s*['"](admin|mod)['"]|['"](admin|mod)['"]\s*[!=]==?\s*[\w.]*role\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      out.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('platform-role literals', () => {
  it('appear only in lib/auth/privilege.ts', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(WEB_SRC)) {
      const rel = relative(WEB_SRC, file);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (LITERAL.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits, 'use the active-aware helpers in lib/auth/privilege.ts').toEqual([]);
  });

  it('the scanner itself catches the patterns it exists for', () => {
    expect(LITERAL.test(`if (ctx.appUser.role === 'admin') return;`)).toBe(true);
    expect(LITERAL.test(`const isMod = role === 'mod' || x;`)).toBe(true);
    expect(LITERAL.test(`if (ctx.appUser.role !== 'admin') redirect('/');`)).toBe(true);
    expect(LITERAL.test(`if ('admin' === user.role) {}`)).toBe(true);
    expect(LITERAL.test(`const lead = membership.role === 'lead';`)).toBe(false);
  });
});
