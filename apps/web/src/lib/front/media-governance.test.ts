import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Front-door image governance (front-door standard §2-B11; §4.1 item 9):
 * no raw `<img>` and no `next/image` on any surface an anonymous visitor
 * reaches through the front door. Every image there goes through MediaSlot
 * (deferred-by-default, 0-byte placeholder) so the weight budget in
 * scripts/front-door-weight.mjs governs it natively — an eager image would
 * silently reopen the 2G wound. organic.test.ts precedent: the invariant is
 * a source scan, not a convention.
 */

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Same scan scope as organic.test.ts. */
const FRONT_DOOR_DIRS = ['lib/front', 'components/front', 'app/(front)'];
const FRONT_DOOR_FILES = ['app/page.tsx', 'app/waitlist/page.tsx'];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Banned image mechanisms in a front-door module's source. */
export function bannedImageUsage(content: string): string[] {
  const findings: string[] = [];
  if (/<img\b/.test(content)) findings.push('raw <img>');
  if (/from\s+['"]next\/image['"]/.test(content)) findings.push('next/image import');
  return findings;
}

describe('bannedImageUsage', () => {
  it('detects a raw <img> tag', () => {
    expect(bannedImageUsage('return <img src="/hero.png" alt="" />;')).toEqual(['raw <img>']);
  });

  it('detects a next/image import', () => {
    expect(bannedImageUsage("import Image from 'next/image';")).toEqual(['next/image import']);
  });

  it('allows MediaSlot usage and image-free modules', () => {
    expect(bannedImageUsage('<MediaSlot media={media} prefs={prefs} />')).toEqual([]);
    expect(bannedImageUsage('const vignette = buildScene();')).toEqual([]);
  });
});

describe('front-door image-governance source scan', () => {
  it('no front-door module renders images outside MediaSlot', () => {
    const files = [
      ...FRONT_DOOR_DIRS.flatMap((dir) => collectSourceFiles(join(SRC_ROOT, dir))),
      ...FRONT_DOOR_FILES.map((file) => join(SRC_ROOT, file)),
    ];
    const offenders = files
      .map((path) => ({ path, findings: bannedImageUsage(readFileSync(path, 'utf8')) }))
      .filter(({ findings }) => findings.length > 0);
    expect(
      offenders.map(({ path, findings }) => `${path}: ${findings.join(', ')}`),
      'Front-door surface renders an image outside MediaSlot — route it through ' +
        'components/media/media-slot.tsx so the §2-B11 weight budget governs it',
    ).toEqual([]);
  });
});
