/**
 * Seed-target guard: which database a seeder or reset may write to.
 *
 * Why this exists (12 Sep 2026 production audit): the test-community seeder's
 * only guard was `NODE_ENV === 'production'`, a property of the APP PROCESS,
 * not of the database. A local `next dev` (NODE_ENV=development) pointed at the
 * Supabase project labelled "Dev Xidig App" passed that guard and seeded 62
 * fake members into what is in fact the live production database for
 * xidig.net. The process mode says nothing about the target.
 *
 * This guard decides from the target itself (the Supabase URL the service
 * client is built from) and FAILS CLOSED:
 *   - an unparseable or missing URL is refused;
 *   - a known production project ref is refused, whatever NODE_ENV says;
 *   - a hosted project ref is allowed ONLY if it is on the explicit,
 *     reviewed non-production allowlist below (empty today: no non-production
 *     rehearsal project is verified);
 *   - a loopback URL (a local `supabase start` stack, CI's 127.0.0.1) is
 *     non-production by construction and is allowed;
 *   - any other host (custom domain, proxy) is refused.
 *
 * Pure: no `@/env`, no network. Callers pass the URLs they build clients from.
 */

/** Supabase project refs that are PRODUCTION. Never seed, reset or mutate
 *  test data here. "Dev Xidig App" is the live xidig.net database. */
export const PRODUCTION_PROJECT_REFS: readonly string[] = ['tbdryvhxxiqadseuxclm'];

/**
 * Hosted Supabase project refs explicitly verified as NON-production. Adding a
 * ref here is a reviewed, owner-approved change: the project must be confirmed
 * to hold no real members and to serve no live site. Empty on purpose — the
 * paused "Staging Xidig App" project is unverified and is NOT listed.
 */
export const NON_PRODUCTION_PROJECT_REFS: readonly string[] = [];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const HOSTED_SUFFIX = '.supabase.co';

export type SeedTarget =
  | { kind: 'loopback'; host: string }
  | { kind: 'hosted'; ref: string }
  | { kind: 'other'; host: string }
  | { kind: 'unknown' };

/** Classify a Supabase URL. Anything that does not parse is `unknown`. */
export function classifySupabaseUrl(url: string | null | undefined): SeedTarget {
  if (typeof url !== 'string' || url.trim() === '') return { kind: 'unknown' };
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { kind: 'unknown' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { kind: 'unknown' };
  const host = parsed.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return { kind: 'loopback', host };
  if (host.endsWith(HOSTED_SUFFIX)) {
    const ref = host.slice(0, -HOSTED_SUFFIX.length);
    // A project ref is a single DNS label; anything nested is not a plain
    // project host and is not trusted.
    if (/^[a-z0-9]+$/.test(ref)) return { kind: 'hosted', ref };
    return { kind: 'other', host };
  }
  return { kind: 'other', host };
}

export type SeedTargetRefusal =
  | 'target_unknown'
  | 'target_production'
  | 'target_not_allowlisted'
  | 'target_mismatch';

export type SeedTargetDecision =
  | { allowed: true; target: string }
  | { allowed: false; reason: SeedTargetRefusal; detail: string };

function describe(target: SeedTarget): string {
  switch (target.kind) {
    case 'loopback':
      return `local stack (${target.host})`;
    case 'hosted':
      return `Supabase project ${target.ref}`;
    case 'other':
      return `host ${target.host}`;
    default:
      return 'an undeterminable target';
  }
}

function decideOne(url: string | null | undefined): SeedTargetDecision {
  const target = classifySupabaseUrl(url);
  if (target.kind === 'unknown') {
    return {
      allowed: false,
      reason: 'target_unknown',
      detail: 'The Supabase URL is missing or unparseable, so the target cannot be verified.',
    };
  }
  if (target.kind === 'loopback') return { allowed: true, target: describe(target) };
  if (target.kind === 'hosted') {
    if (PRODUCTION_PROJECT_REFS.includes(target.ref)) {
      return {
        allowed: false,
        reason: 'target_production',
        detail: `${describe(target)} is PRODUCTION (the live xidig.net database). Seeding and reset are refused regardless of NODE_ENV.`,
      };
    }
    if (NON_PRODUCTION_PROJECT_REFS.includes(target.ref)) {
      return { allowed: true, target: describe(target) };
    }
    return {
      allowed: false,
      reason: 'target_not_allowlisted',
      detail: `${describe(target)} is not on the verified non-production allowlist (lib/seed/target-guard.ts).`,
    };
  }
  return {
    allowed: false,
    reason: 'target_not_allowlisted',
    detail: `${describe(target)} is not a recognised non-production Supabase target.`,
  };
}

/**
 * Decide whether seeding/reset may touch the database behind these URLs.
 * Every URL the process could write through must pass (the server-side
 * service client URL and the public URL). They must also agree on the target;
 * a mismatch is refused rather than guessed.
 */
export function decideSeedTarget(
  urls: ReadonlyArray<string | null | undefined>,
): SeedTargetDecision {
  const present = urls.filter((u): u is string => typeof u === 'string' && u.trim() !== '');
  if (present.length === 0) return decideOne(undefined);
  const decisions = present.map(decideOne);
  const refused = decisions.find((d) => !d.allowed);
  if (refused) return refused;
  const targets = new Set(decisions.map((d) => (d.allowed ? d.target : '')));
  const [target] = [...targets];
  if (targets.size !== 1 || target === undefined) {
    return {
      allowed: false,
      reason: 'target_mismatch',
      detail: 'The configured Supabase URLs point at different targets; refusing rather than guessing.',
    };
  }
  return { allowed: true, target };
}

/** Thrown by seed library entry points when the target is refused. */
export class SeedTargetRefused extends Error {
  readonly reason: SeedTargetRefusal;
  constructor(decision: Extract<SeedTargetDecision, { allowed: false }>) {
    super(`Seed target refused (${decision.reason}): ${decision.detail}`);
    this.name = 'SeedTargetRefused';
    this.reason = decision.reason;
  }
}

/** Throw unless the target is allowed. Use at the top of every seed/reset. */
export function assertSeedTargetAllowed(urls: ReadonlyArray<string | null | undefined>): string {
  const decision = decideSeedTarget(urls);
  if (!decision.allowed) throw new SeedTargetRefused(decision);
  return decision.target;
}
