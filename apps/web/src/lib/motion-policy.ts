/**
 * Xidig mark motion policy — G1 direction approved 22 Aug 2026, G3
 * implementation (design project "Xidig Motion G3", file g3/motion-policy.js).
 *
 * Framework-free and side-effect-free: safe to import from server components,
 * client components and tests. There is NO animation runtime anywhere — the
 * motion itself is CSS on the shipped `.xidig-animark` rig (globals.css). This
 * module only answers "may this play, here, now?".
 *
 * Locked rules encoded here:
 *   - `message_sent` never animates. Frequency kills meaning; the pressed
 *     send state is the receipt.
 *   - Maal / capital / ledger / finance / compliance / demotion never animate.
 *     Where provenance is earned, a STATIC trust ring goes on the card or
 *     chip — never on the mark.
 *   - `celebrate` is for once-ever moments only.
 *   - flap receipts pass through a frequency guard, so a bulk action or a
 *     retry storm collapses into one beat.
 */

/** What the CSS rig can play. `null` = no motion, by rule. */
export type MotionState = 'flap' | 'celebrate' | 'celebrate-earned';

/** Event → motion state. `null` entries are locked closed, not unassigned. */
export const TRIGGERS = {
  post_published: 'flap',
  garab_given: 'flap',
  dm_accepted: 'flap',
  message_sent: null /* locked: never — frequency kills meaning */,
  onboarding_complete: 'celebrate',
  first_post: 'celebrate',
  warshad_created: 'celebrate',
  verified_reveal: 'celebrate-earned',
  founding_reveal: 'celebrate-earned',
  maal_promotion: null /* locked: finance — static trust ring only */,
  maal_repromotion: null,
} as const satisfies Record<string, MotionState | null>;

export type MotionEvent = keyof typeof TRIGGERS;

/**
 * Surfaces where the mark NEVER animates, whatever the event. Matched
 * case-insensitively against the `surface` prop passed to <AnimatedMark>.
 */
export const NO_MOTION_SURFACES = [
  'safety',
  'report',
  'moderation',
  'systemnotice',
  'court',
  'appeals',
  'error',
  'danger',
  'blocked',
  'gated',
  'finance',
  'compliance',
  'maal',
  'capital',
  'ledger',
  'demotion',
] as const;

/** `true` when this surface is allowed to carry motion at all. */
export function motionAllowed(surface?: string | null): boolean {
  if (surface == null || surface === '') return true;
  return !(NO_MOTION_SURFACES as readonly string[]).includes(surface.toLowerCase());
}

/**
 * The global gates, read from the live document. All three resolve to the
 * static rest frame with layout preserved; the CSS gates independently, so
 * this exists to let CLIENT callers skip firing motion at all (zero animation
 * work on gated paths) rather than to be the only line of defence.
 *
 * Returns `false` when there is no document (server render) — server code has
 * no viewer document to consult, and the CSS gate is the one that decides
 * there. Never call this from a component's render path: `data-motion` and
 * `data-lite` are server-rendered on <html> in app/layout.tsx, so gating in
 * render would mismatch on hydration. Call it from an event handler, next to
 * `motionFor()`.
 */
export function gatesOpen(win?: Window | null): boolean {
  const w = win ?? (typeof window !== 'undefined' ? window : null);
  if (!w?.document) return false;
  const html = w.document.documentElement;
  if (html.getAttribute('data-motion') === 'off') return false;
  if (html.getAttribute('data-lite') === '1') return false;
  if (w.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

/**
 * The one entry point: what may play for this event on this surface?
 * Frequency (flap) and once-ever (celebrate) are the caller's to enforce with
 * the guards below — this answers the rule question only.
 */
export function motionFor(event: string, surface?: string | null): MotionState | null {
  if (!motionAllowed(surface)) return null;
  return Object.prototype.hasOwnProperty.call(TRIGGERS, event)
    ? (TRIGGERS[event as MotionEvent] as MotionState | null)
    : null;
}

/**
 * Frequency guard for flap receipts: bulk actions, retries and repeated taps
 * collapse into one beat. `now` is injectable for tests.
 */
export function createReceiptGuard(minGapMs = 1200, now?: () => number): () => boolean {
  const clock = now ?? (() => Date.now());
  let last = -Infinity;
  return function shouldPlay(): boolean {
    const t = clock();
    if (t - last < minGapMs) return false;
    last = t;
    return true;
  };
}

/** Minimal store shape behind the once-ever guard. */
export interface OnceEverStore {
  get(key: string): boolean;
  set(key: string): void;
  clear?(): void;
}

/** In-memory default — fine for a single page view, not for "once ever". */
export function createMemoryStore(): Required<OnceEverStore> {
  const seen = new Set<string>();
  return {
    get: (key) => seen.has(key),
    set: (key) => {
      seen.add(key);
    },
    clear: () => seen.clear(),
  };
}

/**
 * Once-ever guard for celebrates. Pass an ACCOUNT-backed store for the real
 * thing — the in-memory default forgets on reload, which would let a milestone
 * celebrate again on the next visit.
 */
export function createOnceEver(store?: OnceEverStore) {
  const s = store ?? createMemoryStore();
  return {
    shouldPlay(key: string): boolean {
      if (s.get(key)) return false;
      s.set(key);
      return true;
    },
    reset(): void {
      s.clear?.();
    },
  };
}
