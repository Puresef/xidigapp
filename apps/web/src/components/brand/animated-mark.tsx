import type { ReactNode } from 'react';

/**
 * AnimatedMark — the brand mark with its three motions, by scenario
 * (mark-redesign spec §4, docs/superpowers/specs/2026-07-17-mark-redesign-design.md):
 *
 *   - `assemble`  plays ONCE on entry surfaces: the X converges from the four
 *                 corners, then the two woven star halves slide in and lock —
 *                 scattered → gathered.
 *   - `flap`      calm whole-butterfly fold loop — the loading/breathing pulse.
 *   - `ceremony`  one-shot wings-fold-and-spread — celebration moments only
 *                 (vote cast, co-sign, badge reveal), never routine taps.
 *   - `hero`      assemble once, then rest and occasionally breathe — the
 *                 living hero mark (assemble layers + a gentle wrapper loop).
 *   - `static`    the mark, no layers, no motion.
 *
 * CSS-only (keyframes in globals.css under .xidig-animark): server-renderable,
 * zero client JS. The BASE state of every layer is the FINAL frame — motion-off
 * and reduced-motion visitors always see the complete mark, never a mid-fold
 * frame (the house double gate lives in the CSS, not here).
 *
 * `label` is the accessible name — pass a translated brand string (t('app.name'))
 * so the component stays locale-pure under the i18n lint.
 *
 * Geometry: the canonical C2 pieces from apps/web/src/app/icon.svg — the X body
 * (3 paths) and the two woven star halves. Keep them in sync with the icon.
 */

export type AnimatedMarkMode = 'static' | 'assemble' | 'flap' | 'ceremony' | 'hero';

const VIEW_BOX = '437 119 540 540';

function ArmsSvg() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} aria-hidden="true">
      <path d="M580 178L668 266L669 269L655 303L652 314L706 386L707 189L712 197L743 267L829 182L844 171L855 166L877 162L903 167L920 175L938 193L947 210L951 229L949 251L941 271L927 288L811 389L929 492L945 514L951 533L949 557L941 580L932 593L923 601L906 611L888 615L863 614L843 607L817 585L815 581L812 580L740 507L738 503L733 500L708 474L703 476L590 592L569 607L545 615L515 613L494 604L476 586L467 570L463 553L464 529L472 507L486 491L603 388L479 281L471 270L464 250L463 231L464 215L473 197L482 186L493 176L513 166L530 163L548 164L565 169Z" fill="#2E78B0" /><path d="M909 169L920 175L934 188L942 198L947 210L951 236L949 251L945 264L937 277L927 288L795 401L830 516L708 388L706 376L707 189L712 197L743 267L825 186L844 171L858 165L877 162L890 163Z" fill="#2D78B0" /><path d="M580 178L668 266L669 269L655 303L652 314L703 382L706 388L583 516L617 407L618 401L480 282L468 262L464 250L462 238L464 215L473 197L487 181L505 169L521 164L539 163L556 166Z" fill="#2E78B0" />
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
      <path d="M580 178L668 266L669 269L655 303L652 314L706 386L707 189L712 197L743 267L829 182L844 171L855 166L877 162L903 167L920 175L938 193L947 210L951 229L949 251L941 271L927 288L811 389L929 492L945 514L951 533L949 557L941 580L932 593L923 601L906 611L888 615L863 614L843 607L817 585L815 581L812 580L740 507L738 503L733 500L708 474L703 476L590 592L569 607L545 615L515 613L494 604L476 586L467 570L463 553L464 529L472 507L486 491L603 388L479 281L471 270L464 250L463 231L464 215L473 197L482 186L493 176L513 166L530 163L548 164L565 169Z" fill="#2E78B0" /><path d="M909 169L920 175L934 188L942 198L947 210L951 236L949 251L945 264L937 277L927 288L795 401L830 516L708 388L706 376L707 189L712 197L743 267L825 186L844 171L858 165L877 162L890 163Z" fill="#2D78B0" /><path d="M580 178L668 266L669 269L655 303L652 314L703 382L706 388L583 516L617 407L618 401L480 282L468 262L464 250L462 238L464 215L473 197L487 181L505 169L521 164L539 163L556 166Z" fill="#2E78B0" />
      <path d="M707 165L713 174L770 303L920 303L916 308L806 402L845 531L708 388L706 374Z" fill="#2f3038" />
      <path d="M493 303L642 303L649 308L705 385L704 390L568 531L606 409L607 402Z" fill="#33343c" />
    </svg>
  );
}

export function AnimatedMark({
  mode = 'static',
  size = 20,
  label,
  className,
}: {
  mode?: AnimatedMarkMode;
  /** Rendered box in CSS px (square). */
  size?: number;
  /** Accessible name — pass t('app.name'). Omit when the mark sits beside
   *  visible brand text (e.g. the nav wordmark): it renders decorative
   *  (aria-hidden) instead of an img with an empty name. */
  label?: string | undefined;
  className?: string | undefined;
}) {
  const rootClass = ['xidig-animark', `xidig-animark--${mode}`, className]
    .filter(Boolean)
    .join(' ');
  let layers: ReactNode;
  if (mode === 'assemble' || mode === 'hero') {
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
  } else if (mode === 'ceremony') {
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
  return (
    <span
      className={rootClass}
      style={{ width: size, height: size }}
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {layers}
    </span>
  );
}
