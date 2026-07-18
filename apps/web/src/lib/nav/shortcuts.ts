/**
 * Global keyboard shortcuts (18 Jul nav review): `/` focuses search, `c`
 * opens the composer — GitHub-style single letters, suppressed while typing
 * in any field and when a modifier is held (browser shortcuts win).
 */

export type ShortcutAction = 'search' | 'compose';

export function shortcutFor(
  key: string,
  { typing, modifier }: { typing: boolean; modifier: boolean },
): ShortcutAction | null {
  if (typing || modifier) return null;
  if (key === '/') return 'search';
  if (key === 'c') return 'compose';
  return null;
}
