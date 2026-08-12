import type { MessageKey } from '@xidig/i18n';

/**
 * Aniga v3 module identity — the client-side mirror of `profile_module_kinds`
 * (migration 20260811000000). The header is fixed chrome; everything below the
 * bio is a module the owner orders and toggles, so identity, default slot and
 * flag-gating have to be answerable without a round trip.
 *
 * Mirroring rather than fetching is deliberate, same precedent as lib/lanes.ts:
 * a member with zero `profile_modules` rows must render exactly like one who
 * saved the defaults, which means the defaults are layout data, not remote
 * data. `modules.test.ts` parses the migration seed and fails if the two drift.
 */
export const ANIGA_MODULE_IDS = [
  'showcase',
  'skills',
  'links',
  'looking_for',
  'spaces',
  'helper',
  'suuq',
  'metrics',
] as const;

export type AnigaModuleId = (typeof ANIGA_MODULE_IDS)[number];

/**
 * Default order + visibility, mirroring the `profile_module_kinds` seed rows.
 *
 * `requiresFlag` names a PLATFORM decision, not an owner setting (ruling 7).
 * The key must match `profile_module_kinds.requires_flag` exactly — get it
 * wrong and the manager offers a toggle the DB trigger rejects.
 */
export const ANIGA_MODULE_DEFAULTS = [
  { id: 'showcase', position: 1, visible: true, requiresFlag: null },
  { id: 'skills', position: 2, visible: true, requiresFlag: null },
  { id: 'links', position: 3, visible: true, requiresFlag: null },
  { id: 'looking_for', position: 4, visible: true, requiresFlag: null },
  { id: 'spaces', position: 5, visible: true, requiresFlag: null },
  { id: 'helper', position: 6, visible: true, requiresFlag: null },
  { id: 'suuq', position: 7, visible: true, requiresFlag: null },
  // Tirakoobka: built and visitor-facing-capable, OFF platform-wide.
  { id: 'metrics', position: 8, visible: false, requiresFlag: 'profile_metrics_module' },
] as const satisfies ReadonlyArray<{
  id: AnigaModuleId;
  position: number;
  visible: boolean;
  requiresFlag: string | null;
}>;

/** Module → the uppercase card label its header renders. */
export const ANIGA_MODULE_TITLE_KEYS: Record<AnigaModuleId, MessageKey> = {
  showcase: 'profile.moduleShowcase',
  skills: 'profile.moduleSkills',
  links: 'profile.moduleLinks',
  looking_for: 'profile.moduleLookingFor',
  spaces: 'profile.moduleSpaces',
  helper: 'profile.moduleHelper',
  suuq: 'profile.moduleSuuq',
  metrics: 'profile.moduleMetrics',
};

export interface AnigaModuleState {
  id: AnigaModuleId;
  position: number;
  visible: boolean;
  /** Non-null when a platform flag governs this module. */
  requiresFlag: string | null;
  /** True when requiresFlag is set and the flag is OFF. Owner sees a locked row; toggle is rejected. */
  lockedByFlag: boolean;
}

/**
 * Merge stored rows over the defaults. Always returns all 8 in render order —
 * dropping the ones that don't render is `publishedModules`' job, because the
 * owner manager needs the full list (including the hidden and the locked rows)
 * while the visitor needs none of it.
 *
 * Iterating the defaults rather than the rows means a stored `module_id` that
 * is no longer a known module is ignored. Retiring a module is then a one-line
 * edit here: stale rows stop rendering with no data migration and no `default:`
 * branch in the renderer.
 */
export function resolveModuleStates(
  rows: ReadonlyArray<{ module_id: string; position: number; visible: boolean }>,
  flags: Readonly<Record<string, boolean>>,
): AnigaModuleState[] {
  const stored = new Map<string, { position: number; visible: boolean }>();
  for (const row of rows) {
    stored.set(row.module_id, { position: row.position, visible: row.visible });
  }

  const states = ANIGA_MODULE_DEFAULTS.map((kind): AnigaModuleState => {
    const override = stored.get(kind.id);
    const requiresFlag: string | null = kind.requiresFlag;
    return {
      id: kind.id,
      position: override?.position ?? kind.position,
      visible: override?.visible ?? kind.visible,
      requiresFlag,
      // A flag key nobody has created reads as OFF: an unknown platform
      // decision locks the module rather than silently opening it.
      lockedByFlag: requiresFlag !== null && flags[requiresFlag] !== true,
    };
  });

  // Array#sort is spec-stable and the map above runs in seed order, so two
  // modules sharing a position — reachable when only one of them has a stored
  // row — settle into default order instead of flipping between reads.
  return states.sort((a, b) => a.position - b.position);
}

/**
 * The visitor projection, and the enforcement point for "a hidden module is
 * ABSENT from the DOM, not dimmed" (acceptance A2). Callers map over this
 * array, so anything dropped here cannot emit a node — no card, no wrapper.
 * Filtering inside the renderer instead would not hold: a `{visible && …}`
 * guard within a module still ships the module's own frame.
 *
 * Flag-locked modules drop for the same reason the owner's toggle is rejected
 * server-side (ruling 7) — the platform owns that decision, so absence must not
 * depend on the owner having also left the module hidden.
 */
export function publishedModules(states: readonly AnigaModuleState[]): AnigaModuleState[] {
  return states.filter((state) => state.visible && !state.lockedByFlag);
}
