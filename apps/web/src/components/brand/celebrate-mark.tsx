'use client';

import type { AnimationEvent, KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AnimatedMark } from '@/components/brand/animated-mark';
import { gatesOpen, motionAllowed } from '@/lib/motion-policy';

/**
 * CelebrateMark — the skippable 2.2 s milestone celebration (G3 locked rule:
 * "celebrate is skippable — any tap or keypress lands the final frame").
 *
 * Why this is a separate component: <AnimatedMark> is deliberately zero-JS so
 * the nav, footer, hero and every empty state stay pure server HTML. Skip and
 * completion need state and DOM handlers, so they live here, in the one place
 * that pays for a client bundle — and only celebrate call sites import it.
 *
 * Mount it ONLY for a once-ever moment (onboarding complete, first post,
 * Warshad created, Verified/Founding reveal), behind an account-backed
 * createOnceEver() store. Everything routine is a `flap` receipt on the plain
 * <AnimatedMark>, and finance/Maal/moderation surfaces get no motion at all.
 *
 * `onDone` always fires exactly once, whichever way the moment ends:
 *   'done'    the celebration played out
 *   'skipped' the member tapped / pressed a key
 *   'static'  a gate was closed (reduced motion, data-motion, Lite, or a
 *             no-motion surface) — nothing animated, so callers that chain
 *             off the celebration aren't left waiting
 */
export type CelebrateOutcome = 'done' | 'skipped' | 'static';

const LIFT_ANIMATION = 'xidig-animark-cel-lift';

export function CelebrateMark({
  size = 20,
  label,
  surface,
  earned = false,
  skippable = true,
  onDone,
  className,
}: {
  size?: number;
  /** Accessible name for the skip affordance — pass t('a11y.skipCelebration').
   *  Taken as a prop rather than read from the locale context so a SERVER
   *  component (which already holds getT) can mount this directly. */
  label?: string | undefined;
  surface?: string | undefined;
  /** Earned reveals only (Verified, Founding) — adds the trust ring. */
  earned?: boolean;
  skippable?: boolean;
  onDone?: ((outcome: CelebrateOutcome) => void) | undefined;
  className?: string | undefined;
}) {
  const [skipped, setSkipped] = useState(false);
  // Kept in a ref so an inline arrow from the caller can't retrigger the
  // gate effect on every render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const settled = useRef(false);

  const finish = useCallback((outcome: CelebrateOutcome) => {
    if (settled.current) return;
    settled.current = true;
    onDoneRef.current?.(outcome);
  }, []);

  // The gates live in CSS (and are server-rendered on <html>), so reading them
  // during render would mismatch on hydration. After mount we can look: if
  // nothing is going to animate, settle immediately.
  useEffect(() => {
    if (!gatesOpen() || !motionAllowed(surface)) finish('static');
  }, [surface, finish]);

  const skip = useCallback(() => {
    setSkipped(true);
    finish('skipped');
  }, [finish]);

  const interactive = skippable
    ? {
        onClick: skip,
        onKeyDown: (event: KeyboardEvent<HTMLSpanElement>) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
            event.preventDefault();
            skip();
          }
        },
        onAnimationEnd: (event: AnimationEvent<HTMLSpanElement>) => {
          if (event.animationName === LIFT_ANIMATION) finish('done');
        },
        role: 'button' as const,
        tabIndex: 0,
      }
    : {
        onAnimationEnd: (event: AnimationEvent<HTMLSpanElement>) => {
          if (event.animationName === LIFT_ANIMATION) finish('done');
        },
      };

  return (
    <AnimatedMark
      mode={skipped ? 'static' : 'celebrate'}
      size={size}
      surface={surface}
      earned={earned}
      className={className}
      {...(skippable && !skipped
        ? { label, interactive }
        : { interactive: { onAnimationEnd: interactive.onAnimationEnd } })}
    />
  );
}
