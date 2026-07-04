// Runtime-facing exports for @xidig/config.
// The ESLint / Prettier / TS configs are exposed via package.json "exports"
// subpaths (./eslint, ./prettier, ./tsconfig.base.json) rather than from here.

/** Workspace-wide constants shared across apps and packages. */
export const WORKSPACE_SCOPE = '@xidig' as const;

/** The single source of truth for the app's display name. */
export const APP_NAME = 'Xidig' as const;
