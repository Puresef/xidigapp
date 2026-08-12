import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ANIGA_MODULE_DEFAULTS,
  ANIGA_MODULE_IDS,
  ANIGA_MODULE_TITLE_KEYS,
  publishedModules,
  resolveModuleStates,
  type AnigaModuleId,
} from './modules';

const MIGRATION = readFileSync(
  fileURLToPath(
    new URL(
      '../../../../../packages/db/supabase/migrations/20260811000000_aniga_v3.sql',
      import.meta.url,
    ),
  ),
  'utf8',
);

/** The `values … on conflict` body of a seed INSERT, so descriptions can't confuse the row regex. */
function seedBody(table: string): string {
  const body = new RegExp(`insert into ${table}\\b[\\s\\S]*?values([\\s\\S]*?)on conflict`).exec(
    MIGRATION,
  )?.[1];
  if (!body) throw new Error(`no seed INSERT found for ${table}`);
  return body;
}

/** (id, default_position, default_visible, requires_flag, …) — the four structural columns. */
function seededModuleKinds(): Array<{
  id: string;
  position: number;
  visible: boolean;
  requiresFlag: string | null;
}> {
  const rows = seedBody('profile_module_kinds').matchAll(
    /\(\s*'([a-z_]+)'\s*,\s*(\d+)\s*,\s*(true|false)\s*,\s*(null|'[a-z_]+')\s*,/g,
  );
  return [...rows].map(([, id, position, visible, flag]) => ({
    id: id as string,
    position: Number(position),
    visible: visible === 'true',
    requiresFlag: flag === 'null' ? null : (flag as string).slice(1, -1),
  }));
}

const rows = (
  ...entries: Array<[string, number, boolean]>
): Array<{ module_id: string; position: number; visible: boolean }> =>
  entries.map(([module_id, position, visible]) => ({ module_id, position, visible }));

const idsOf = (states: ReadonlyArray<{ id: AnigaModuleId }>): AnigaModuleId[] =>
  states.map((state) => state.id);

const stateFor = <T extends { id: AnigaModuleId }>(states: readonly T[], id: AnigaModuleId): T => {
  const found = states.find((state) => state.id === id);
  if (!found) throw new Error(`expected ${id} in the resolved set`);
  return found;
};

describe('Aniga module registry', () => {
  it('mirrors the profile_module_kinds seed rows exactly', () => {
    // The DB owns module identity; this const is the client copy that lets a
    // member with zero stored rows render without a round trip. Drift here is
    // an owner toggling a module the server has never heard of.
    expect(ANIGA_MODULE_DEFAULTS.map((kind) => ({ ...kind }))).toEqual(seededModuleKinds());
  });

  it('lists the same ids as the defaults, in the same order', () => {
    expect([...ANIGA_MODULE_IDS]).toEqual(ANIGA_MODULE_DEFAULTS.map((kind) => kind.id));
  });

  it('gates metrics on a flag the migration actually seeds, defaulting OFF', () => {
    // A typo'd flag key would read as "flag missing" → locked forever, with the
    // owner-facing copy blaming a platform decision that does not exist.
    const seededFlags = [...seedBody('feature_flags').matchAll(/\(\s*'([a-z_]+)'\s*,\s*(true|false)\s*,/g)];
    const flagState = new Map(seededFlags.map(([, key, enabled]) => [key, enabled === 'true']));

    for (const kind of ANIGA_MODULE_DEFAULTS) {
      if (kind.requiresFlag === null) continue;
      expect(flagState.has(kind.requiresFlag)).toBe(true);
      expect(flagState.get(kind.requiresFlag)).toBe(false);
    }
    expect(ANIGA_MODULE_DEFAULTS.find((kind) => kind.id === 'metrics')?.requiresFlag).toBe(
      'profile_metrics_module',
    );
  });

  it('carries a distinct profile.* title key for every module', () => {
    const keys = ANIGA_MODULE_IDS.map((id) => ANIGA_MODULE_TITLE_KEYS[id]);
    expect(keys).toHaveLength(ANIGA_MODULE_IDS.length);
    expect(new Set(keys).size).toBe(ANIGA_MODULE_IDS.length);
    for (const key of keys) expect(key).toMatch(/^profile\.[a-z][A-Za-z0-9]*$/);
  });
});

describe('resolveModuleStates', () => {
  it('returns the seed defaults for a member with no stored rows', () => {
    const states = resolveModuleStates([], {});

    expect(states).toEqual(
      ANIGA_MODULE_DEFAULTS.map((kind) => ({
        id: kind.id,
        position: kind.position,
        visible: kind.visible,
        requiresFlag: kind.requiresFlag,
        lockedByFlag: kind.requiresFlag !== null,
      })),
    );
  });

  it('lets a stored row override position and visibility', () => {
    const states = resolveModuleStates(rows(['links', 1, false], ['showcase', 3, true]), {});

    expect(stateFor(states, 'links')).toMatchObject({ position: 1, visible: false });
    expect(stateFor(states, 'showcase')).toMatchObject({ position: 3, visible: true });
  });

  it('keeps defaults for modules the member never stored', () => {
    const states = resolveModuleStates(rows(['skills', 7, false]), {});

    expect(stateFor(states, 'skills')).toMatchObject({ position: 7, visible: false });
    // Untouched neighbours stay exactly where the seed put them.
    expect(stateFor(states, 'helper')).toMatchObject({ position: 6, visible: true });
    expect(stateFor(states, 'suuq')).toMatchObject({ position: 7, visible: true });
  });

  it('always returns all eight modules, whatever the stored set', () => {
    for (const stored of [rows(), rows(['metrics', 1, false]), rows(['helper', 2, true])]) {
      const states = resolveModuleStates(stored, {});
      expect(states).toHaveLength(ANIGA_MODULE_IDS.length);
      expect(new Set(idsOf(states))).toEqual(new Set(ANIGA_MODULE_IDS));
    }
  });

  it('sorts by stored position', () => {
    const states = resolveModuleStates(
      rows(
        ['suuq', 1, true],
        ['helper', 2, true],
        ['spaces', 3, true],
        ['looking_for', 4, true],
        ['links', 5, true],
        ['skills', 6, true],
        ['showcase', 7, true],
        ['metrics', 8, false],
      ),
      {},
    );

    expect(idsOf(states)).toEqual([
      'suuq',
      'helper',
      'spaces',
      'looking_for',
      'links',
      'skills',
      'showcase',
      'metrics',
    ]);
  });

  it('breaks a position tie by seed order, identically on every call', () => {
    // Reachable without corrupt data: the per-user unique constraint only binds
    // STORED rows, so one stored row can collide with an unstored default.
    const stored = rows(['helper', 2, true]);
    const first = idsOf(resolveModuleStates(stored, {}));

    expect(first.indexOf('skills')).toBeLessThan(first.indexOf('helper'));
    expect(idsOf(resolveModuleStates(stored, {}))).toEqual(first);
  });

  it('ignores a stored row for an unknown module', () => {
    // Forward-compat: retiring a module is a one-line edit to the defaults, and
    // the orphaned preference rows simply stop resolving.
    const states = resolveModuleStates(rows(['retired_module', 1, true], ['skills', 2, true]), {});

    expect(idsOf(states)).not.toContain('retired_module' as AnigaModuleId);
    expect(states).toHaveLength(ANIGA_MODULE_IDS.length);
  });

  it('computes lockedByFlag from the flag map, treating a missing flag as OFF', () => {
    expect(stateFor(resolveModuleStates([], {}), 'metrics').lockedByFlag).toBe(true);
    expect(
      stateFor(resolveModuleStates([], { profile_metrics_module: false }), 'metrics').lockedByFlag,
    ).toBe(true);
    expect(
      stateFor(resolveModuleStates([], { profile_metrics_module: true }), 'metrics').lockedByFlag,
    ).toBe(false);
  });

  it('never locks a module that no flag governs', () => {
    const states = resolveModuleStates([], { profile_metrics_module: false, unrelated: false });

    for (const state of states) {
      if (state.requiresFlag === null) expect(state.lockedByFlag).toBe(false);
    }
  });

  it('keeps a stored visible:true on a flag-locked module locked', () => {
    // Ruling 7: the flag is a platform decision. A row that got past the trigger
    // (or predates the flag being switched off) must not re-open the module.
    const state = stateFor(resolveModuleStates(rows(['metrics', 8, true]), {}), 'metrics');

    expect(state.visible).toBe(true);
    expect(state.lockedByFlag).toBe(true);
  });
});

describe('publishedModules', () => {
  it('publishes every default module except the flag-gated one', () => {
    const published = publishedModules(resolveModuleStates([], {}));

    expect(idsOf(published)).toEqual([
      'showcase',
      'skills',
      'links',
      'looking_for',
      'spaces',
      'helper',
      'suuq',
    ]);
  });

  it('omits a hidden module entirely rather than marking it', () => {
    // A2 is structural: callers map over this array, so an omitted module can
    // emit no node at all. A dimmed/aria-hidden entry would still be DOM.
    const published = publishedModules(resolveModuleStates(rows(['looking_for', 4, false]), {}));

    expect(idsOf(published)).not.toContain('looking_for');
    expect(published.some((state) => state.id === 'looking_for')).toBe(false);
    expect(published).toHaveLength(ANIGA_MODULE_IDS.length - 2);
  });

  it('never publishes a flag-locked module, even stored visible', () => {
    const published = publishedModules(resolveModuleStates(rows(['metrics', 1, true]), {}));

    expect(idsOf(published)).not.toContain('metrics');
  });

  it('publishes the flag-gated module once the flag is on and the owner shows it', () => {
    const flags = { profile_metrics_module: true };

    expect(idsOf(publishedModules(resolveModuleStates([], flags)))).not.toContain('metrics');
    expect(
      idsOf(publishedModules(resolveModuleStates(rows(['metrics', 8, true]), flags))),
    ).toContain('metrics');
  });

  it('preserves resolved order', () => {
    const states = resolveModuleStates(rows(['suuq', 1, true], ['showcase', 7, true]), {});

    expect(idsOf(publishedModules(states))).toEqual(
      idsOf(states).filter((id) => id !== 'metrics'),
    );
  });

  it('returns an empty array when the owner has hidden everything', () => {
    const allHidden = rows(
      ['showcase', 1, false],
      ['skills', 2, false],
      ['links', 3, false],
      ['looking_for', 4, false],
      ['spaces', 5, false],
      ['helper', 6, false],
      ['suuq', 7, false],
      ['metrics', 8, false],
    );

    expect(publishedModules(resolveModuleStates(allHidden, {}))).toEqual([]);
  });
});
