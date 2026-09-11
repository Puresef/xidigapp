import { isActiveAccount, isActiveAdmin, type AccountStanding } from '@/lib/auth/privilege';

/**
 * Scoped API-key permissions for the external REST + MCP layer (PRD §21).
 *
 * Scopes are least-privilege and additive. A key carries an explicit list; the
 * `admin` scope is a system/service superset that a member can NEVER mint.
 *
 * Provenance (owner ruling, 11 Sep — external writes never simulate or obscure
 * organic member activity): every write scope publishes as the PLATFORM, not
 * as the key's owner (see SCOPE_PROVENANCE). They are therefore OPERATIONAL
 * scopes — admin-only, audited, and labelled in the UI by the content's
 * non-member `source`. Members and mods mint and use `read` only; a write key
 * minted before this rule narrows to `read` on use (effectiveScopes).
 *
 * These slugs are the contract shared by the REST routes, the MCP tools, the
 * key-management UI, and the docs — never rename a shipped one.
 */
export const API_SCOPES = {
  /** Read member/public-visible directory, listings, Labs, Plaza + digest candidates. */
  read: 'Read public/member-visible directory, listings, Labs and Plaza content',
  /** Create labelled seeded/AI Plaza posts. */
  'plaza:write': 'Create labelled seeded Plaza posts',
  /** Create or update labelled seeded business listings. */
  'listings:write': 'Create and update labelled seeded business listings',
  /** Create or update labelled seeded Labs / playbooks. */
  'labs:write': 'Create and update labelled seeded Labs',
  /** System/service only: trigger digest + seed jobs. Never member-mintable. */
  admin: 'System operations: trigger digest and seed jobs (admin-only)',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export const ALL_SCOPES = Object.keys(API_SCOPES) as ApiScope[];

/**
 * How each scope's writes are attributed:
 *   read_only            — no writes;
 *   platform_seed_actor  — writes publish as the platform (Plaza posts by the
 *                          badged AI account; seeded listings with no owner;
 *                          Lab templates with no creator). The key owner is
 *                          recorded only in audit_logs;
 *   system_superset      — `admin`: satisfies every scope.
 * No scope today preserves a member's own provenance.
 */
export const SCOPE_PROVENANCE: Record<
  ApiScope,
  'read_only' | 'platform_seed_actor' | 'system_superset'
> = {
  read: 'read_only',
  'plaza:write': 'platform_seed_actor',
  'listings:write': 'platform_seed_actor',
  'labs:write': 'platform_seed_actor',
  admin: 'system_superset',
};

/** Scopes a member or mod may attach to a self-service key: read-only ones. */
export const MEMBER_MINTABLE_SCOPES: ApiScope[] = ['read'];

export function isApiScope(value: string): value is ApiScope {
  return value in API_SCOPES;
}

/**
 * Does a key's granted scopes satisfy a required scope? `admin` is a superset
 * that satisfies every scope (system keys can do anything the API exposes).
 */
export function scopeSatisfies(granted: readonly string[], required: ApiScope): boolean {
  return granted.includes('admin') || granted.includes(required);
}

/** The only scope a key owner in the §19 deletion grace may use or mint. */
export const GRACE_SCOPES: ApiScope[] = ['read'];

/**
 * The scopes an owner's CURRENT standing allows — for minting a key and, at
 * every request, for using one (owner rulings, 11 Sep: keys never bypass the
 * account lifecycle, and write scopes are operational). Active admin: all
 * (the operational write scopes + `admin`); active member or mod: `read`; the
 * grace: `read`; suspended / deactivated / deleted: nothing.
 */
export function allowedScopesFor(owner: AccountStanding): ApiScope[] {
  if (isActiveAdmin(owner)) return [...ALL_SCOPES];
  if (isActiveAccount(owner)) return [...MEMBER_MINTABLE_SCOPES];
  if (owner.status === 'pending_deletion') return [...GRACE_SCOPES];
  return [];
}

/** A key's granted scopes narrowed to what its owner's standing allows today. */
export function effectiveScopes(granted: readonly string[], owner: AccountStanding): string[] {
  const allowed: readonly string[] = allowedScopesFor(owner);
  return granted.filter((scope) => allowed.includes(scope));
}
