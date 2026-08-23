import type {
  AnimationEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from 'react';

import { motionAllowed } from '@/lib/motion-policy';

/**
 * AnimatedMark — the brand mark and its motion states, by scenario
 * (mark-redesign spec §4 + the G1 motion direction approved 22 Aug 2026,
 * implemented as G3: docs/superpowers/specs/2026-07-17-mark-redesign-design.md
 * and the "Xidig Motion G3" design project):
 *
 *   - `static`     the mark, no layers, no motion.
 *   - `assemble`   plays ONCE on entry surfaces: the X converges from the four
 *                  corners, then the two woven star halves slide in and lock.
 *   - `hero`       assemble once, then rest and occasionally breathe — the
 *                  living hero mark.
 *   - `idle`       12 s wing-set — front door + auth ONLY.
 *   - `loading`    the calm whole-butterfly fold LOOP (the loading pulse).
 *                  This was called `flap` before G3; the class is unchanged.
 *   - `flap`       a 260 ms ONE-SHOT receipt: post published, Garab given, DM
 *                  accepted. Wire it behind createReceiptGuard() so a bulk
 *                  action or a retry storm collapses into one beat.
 *   - `celebrate`  a 2.2 s once-ever milestone (onboarding complete, first
 *                  post, Warshad created, Verified/Founding reveal). Pass
 *                  `earned` — or mode `celebrate-earned` — for the trust ring.
 *   - `ceremony`   legacy alias for `celebrate`.
 *
 * CSS-only (keyframes in globals.css under .xidig-animark): server-renderable,
 * zero client JS. The BASE state of every layer is the FINAL frame — motion-off
 * and reduced-motion visitors always see the complete mark, never a mid-fold
 * frame.
 *
 * GATING. The three global gates — prefers-reduced-motion, html[data-motion='off']
 * (Appearance + the Lite animations pref) and html[data-lite='1'] (Xawli yar) —
 * are enforced in CSS, and both attributes are server-rendered in app/layout.tsx,
 * so a gated visitor never paints a frame of motion. This component deliberately
 * does NOT consult the document at render time: doing so would either force the
 * whole mark into a client bundle or mismatch on hydration. Client callers that
 * want to skip the work entirely should ask lib/motion-policy's gatesOpen()
 * inside the event handler, next to motionFor().
 *
 * The SURFACE gate is enforced here, because it is pure: on a surface in
 * NO_MOTION_SURFACES (safety, moderation, court, errors, and every
 * finance/Maal/capital/ledger/demotion surface) a motion mode renders as the
 * static rest frame, same box.
 *
 * `label` is the accessible name — pass a translated brand string (t('app.name'))
 * so the component stays locale-pure under the i18n lint.
 *
 * Geometry: the canonical C2 pieces from
 * apps/web/src/components/brand/mark-canonical.svg — the X body (3 paths) and
 * the two woven star halves. Keep them in sync with that canonical SVG (the
 * GATE test in animated-mark.test.tsx enforces it). The arms are Somali Blue
 * #0077cc — unified with the favicon/install identity per the 1 Aug ruling
 * (docs/brand-direction.md §6).
 */

export type AnimatedMarkMode =
  | 'static'
  | 'assemble'
  | 'hero'
  | 'idle'
  | 'loading'
  | 'flap'
  | 'celebrate'
  | 'celebrate-earned'
  /** @deprecated legacy alias for `celebrate`. */
  | 'ceremony';

const VIEW_BOX = '437 119 540 540';

function ArmsSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} aria-hidden="true">
      <path d="M580 178L668 266L669 269L655 303L652 314L706 386L707 189L712 197L743 267L829 182L844 171L855 166L877 162L903 167L920 175L938 193L947 210L951 229L949 251L941 271L927 288L811 389L929 492L945 514L951 533L949 557L941 580L932 593L923 601L906 611L888 615L863 614L843 607L817 585L815 581L812 580L740 507L738 503L733 500L708 474L703 476L590 592L569 607L545 615L515 613L494 604L476 586L467 570L463 553L464 529L472 507L486 491L603 388L479 281L471 270L464 250L463 231L464 215L473 197L482 186L493 176L513 166L530 163L548 164L565 169Z" fill="#0077cc" /><path d="M909 169L920 175L934 188L942 198L947 210L951 236L949 251L945 264L937 277L927 288L795 401L830 516L708 388L706 376L707 189L712 197L743 267L825 186L844 171L858 165L877 162L890 163Z" fill="#0077cc" /><path d="M580 178L668 266L669 269L655 303L652 314L703 382L706 388L583 516L617 407L618 401L480 282L468 262L464 250L462 238L464 215L473 197L487 181L505 169L521 164L539 163L556 166Z" fill="#0077cc" />
    </svg>
  );
}

function StarRightSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} aria-hidden="true">
      <path d="M707 165L713 174L770 303L920 303L916 308L806 402L845 531L708 388L706 374Z" fill="#2f3038" />
    </svg>
  );
}

function StarLeftSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} aria-hidden="true">
      <path d="M493 303L642 303L649 308L705 385L704 390L568 531L606 409L607 402Z" fill="#33343c" />
    </svg>
  );
}

function FullSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} aria-hidden="true">
      <path d="M580 178L668 266L669 269L655 303L652 314L706 386L707 189L712 197L743 267L829 182L844 171L855 166L877 162L903 167L920 175L938 193L947 210L951 229L949 251L941 271L927 288L811 389L929 492L945 514L951 533L949 557L941 580L932 593L923 601L906 611L888 615L863 614L843 607L817 585L815 581L812 580L740 507L738 503L733 500L708 474L703 476L590 592L569 607L545 615L515 613L494 604L476 586L467 570L463 553L464 529L472 507L486 491L603 388L479 281L471 270L464 250L463 231L464 215L473 197L482 186L493 176L513 166L530 163L548 164L565 169Z" fill="#0077cc" /><path d="M909 169L920 175L934 188L942 198L947 210L951 236L949 251L945 264L937 277L927 288L795 401L830 516L708 388L706 376L707 189L712 197L743 267L825 186L844 171L858 165L877 162L890 163Z" fill="#0077cc" /><path d="M580 178L668 266L669 269L655 303L652 314L703 382L706 388L583 516L617 407L618 401L480 282L468 262L464 250L462 238L464 215L473 197L487 181L505 169L521 164L539 163L556 166Z" fill="#0077cc" />
      <path d="M707 165L713 174L770 303L920 303L916 308L806 402L845 531L708 388L706 374Z" fill="#2f3038" />
      <path d="M493 303L642 303L649 308L705 385L704 390L568 531L606 409L607 402Z" fill="#33343c" />
    </svg>
  );
}

/** Mode → rig class. `loading` keeps the shipped loop's class untouched. */
const MODE_CLASS: Record<Exclude<AnimatedMarkMode, 'ceremony' | 'celebrate-earned'>, string> = {
  static: '',
  assemble: 'xidig-animark--assemble',
  hero: 'xidig-animark--hero',
  idle: 'xidig-animark--idle',
  loading: 'xidig-animark--flap',
  flap: 'xidig-animark--flap1',
  celebrate: 'xidig-animark--celebrate',
};

/** Modes the surface gate can veto. Entry rituals are not motion "events". */
const GATEABLE = new Set(['idle', 'loading', 'flap', 'celebrate']);

export function AnimatedMark({
  mode = 'static',
  size = 20,
  label,
  surface,
  earned = false,
  interactive,
  className,
}: {
  mode?: AnimatedMarkMode;
  /** Rendered box in CSS px (square). */
  size?: number;
  /** Accessible name — pass t('app.name'). Omit when the mark sits beside
   *  visible brand text (e.g. the nav wordmark): it renders decorative
   *  (aria-hidden) instead of an img with an empty name. */
  label?: string | undefined;
  /** Where this mark lives. Surfaces in NO_MOTION_SURFACES render static. */
  surface?: string | undefined;
  /** Earned reveals only (Verified, Founding): adds the static-ringed
   *  celebrate. The ring is a ::after pseudo-element — the mark's own paths
   *  are never restyled. */
  earned?: boolean;
  /** Client-only DOM hooks for the skippable celebrate — see
   *  components/brand/celebrate-mark.tsx. NEVER pass this from a server
   *  component (handlers can't cross the RSC boundary); every other mount
   *  omits it, which is what keeps the mark zero-JS. */
  interactive?: {
    onClick?: MouseEventHandler<HTMLSpanElement>;
    onKeyDown?: KeyboardEventHandler<HTMLSpanElement>;
    onAnimationEnd?: AnimationEventHandler<HTMLSpanElement>;
    /** Set to 'button' when the mark itself is the skip affordance. */
    role?: 'button';
    tabIndex?: number;
  };
  className?: string | undefined;
}) {
  let resolved: Exclude<AnimatedMarkMode, 'ceremony' | 'celebrate-earned'> =
    mode === 'ceremony' || mode === 'celebrate-earned' ? 'celebrate' : mode;
  const ringed = earned || mode === 'celebrate-earned';
  if (GATEABLE.has(resolved) && !motionAllowed(surface)) resolved = 'static';

  const modeClass =
    resolved === 'celebrate' && ringed
      ? `${MODE_CLASS.celebrate} xidig-animark--earned`
      : MODE_CLASS[resolved];
  const rootClass = ['xidig-animark', modeClass, className].filter(Boolean).join(' ');

  let layers: ReactNode;
  if (resolved === 'assemble' || resolved === 'hero') {
    layers = (
      <>
        <span className="xidig-animark__q xidig-animark__q--1" aria-hidden="true"><ArmsSvg /></span>
        <span className="xidig-animark__q xidig-animark__q--2" aria-hidden="true"><ArmsSvg /></span>
        <span className="xidig-animark__q xidig-animark__q--3" aria-hidden="true"><ArmsSvg /></span>
        <span className="xidig-animark__q xidig-animark__q--4" aria-hidden="true"><ArmsSvg /></span>
        <span className="xidig-animark__star xidig-animark__star--r" aria-hidden="true"><StarRightSvg /></span>
        <span className="xidig-animark__star xidig-animark__star--l" aria-hidden="true"><StarLeftSvg /></span>
      </>
    );
  } else if (resolved === 'celebrate') {
    layers = (
      <>
        <span className="xidig-animark__half xidig-animark__half--l" aria-hidden="true"><FullSvg /></span>
        <span className="xidig-animark__half xidig-animark__half--r" aria-hidden="true"><FullSvg /></span>
      </>
    );
  } else {
    layers = <FullSvg />;
  }
  const named = typeof label === 'string' && label !== '';
  const a11y = interactive?.role
    ? { role: interactive.role, tabIndex: interactive.tabIndex ?? 0, 'aria-label': label }
    : named
      ? { role: 'img', 'aria-label': label }
      : { 'aria-hidden': true };
  return (
    <span
      className={rootClass}
      style={{ width: size, height: size }}
      onClick={interactive?.onClick}
      onKeyDown={interactive?.onKeyDown}
      onAnimationEnd={interactive?.onAnimationEnd}
      {...a11y}
    >
      {layers}
    </span>
  );
}
