/**
 * Scoped API-key permissions for the external REST + MCP layer (PRD §21).
 *
 * Scopes are least-privilege and additive. A key carries an explicit list; the
 * `admin` scope is a system/service superset (digest + seed jobs) that a member
 * can NEVER mint — only an admin may attach it (enforced in the mint route).
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

/** Scopes a plain member may attach to a self-service key. Excludes `admin`. */
export const MEMBER_MINTABLE_SCOPES: ApiScope[] = ['read', 'plaza:write', 'listings:write', 'labs:write'];

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
