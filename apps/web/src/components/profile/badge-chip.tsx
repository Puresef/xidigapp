'use client';

import { useT } from '@xidig/i18n/react';

import { XidigIcon } from '@/components/icons/XidigIcon';
import { badgePrefix, badgeVariant, isInlineRenderable, type AnigaBadge } from '@/lib/aniga/badges';

/**
 * One badge, rendered by its class (Badge Canon b1–b4, ruling 10).
 *
 * `size="chip"` — profile and detail surfaces: prefix glyph + label, trust or
 * neutral per `badgeVariant`, with the earning criterion on the tooltip.
 * `size="inline"` — ≤20px surfaces (feed bylines, Suuq rows): the Xaqiiqeysan
 * check, alone. Every other class returns **null** rather than shrinking, so a
 * milestone chip in a byline is structurally impossible rather than merely
 * discouraged (acceptance A10).
 *
 * Client component on purpose: badges render inside both RSC profile chrome and
 * the client feed/Suuq trees, and one component that works in both is what stops
 * two divergent badge treatments from appearing.
 */

/** The canon check — one stroked path, sized to its container. Decorative: the
 *  chip label (or the disc's aria-label) already carries the meaning. */
function CheckGlyph({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function BadgeChip({
  badge,
  size = 'chip',
}: {
  badge: AnigaBadge;
  size?: 'chip' | 'inline';
}) {
  const t = useT();
  // Only tier-bearing labels carry {count}; toAnigaBadge refuses to build one
  // without a tier, so the placeholder can never reach the DOM.
  const params = badge.tier === null ? undefined : { count: badge.tier };
  const label = t(badge.labelKey, params);

  if (size === 'inline') {
    if (!isInlineRenderable(badge)) return null;
    // The disc is the whole badge here, so it names itself — `title` alone is
    // a hover affordance, not an accessible name.
    return (
      <span className="xidig-badge-check" role="img" aria-label={label} title={label}>
        <CheckGlyph size={10} />
      </span>
    );
  }

  const prefix = badgePrefix(badge);
  const tooltip = badge.tooltipKey ? t(badge.tooltipKey, params) : undefined;

  return (
    <span
      className={`xidig-tag xidig-badge-chip${
        badgeVariant(badge) === 'trust' ? ' xidig-tag--trust' : ''
      }`}
      title={tooltip}
    >
      {prefix === 'check' ? <CheckGlyph size={12} /> : null}
      {/* Guul keeps its default trust tone: pure #ff8c00 is a redundant echo of
          a label already rendered at the AA-passing --x-trust-fg, the same
          allowance the verified avatar ring runs on. */}
      {prefix === 'star' ? <XidigIcon name="guul" variant="filled" size={12} /> : null}
      {label}
    </span>
  );
}

export default BadgeChip;
