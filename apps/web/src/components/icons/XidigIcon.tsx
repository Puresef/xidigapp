// apps/web/src/components/icons/XidigIcon.tsx
// Typed inline-SVG icon component for the D2 glyph family.
// New file — does not touch mark-canonical.svg, AnimatedMark, or the GATE test.
import * as React from 'react';
import {
  XIDIG_ICONS,
  XIDIG_ICON_DEFAULT_TONE,
  type XidigIconName,
  type XidigIconVariant,
  type XidigIconTone,
} from './paths';

export interface XidigIconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'name'> {
  name: XidigIconName;
  /** outline (default) | filled — filled garab is the lit dabqaad */
  variant?: XidigIconVariant;
  /** rendered px; 16 chip floor, 18 compact, 21 action rows, 24 default */
  size?: number;
  /**
   * Colour. 'inherit' (default for all but Guul) rides currentColor so the
   * surface token decides. Guul defaults to 'trust' — the ONLY default-orange
   * glyph. Pass tone="trust" explicitly for earned/celebration states elsewhere.
   */
  tone?: XidigIconTone;
  /** Resolved i18n string (MessageKey) when the icon carries meaning alone.
   *  Omit when a visible text label sits next to it (icon goes aria-hidden). */
  label?: string;
  /** Animate the garab smoke (CSS-gated by prefers-reduced-motion AND html[data-motion='off']). */
  animateSmoke?: boolean;
}

const TONE_CLASS: Record<XidigIconTone, string> = {
  inherit: '',
  accent: 'x-ic--accent',
  accentText: 'x-ic--accent-text',
  trust: 'x-ic--trust',
};

export function XidigIcon({
  name,
  variant = 'outline',
  size = 24,
  tone,
  label,
  animateSmoke = false,
  className,
  ...rest
}: XidigIconProps) {
  const paths = XIDIG_ICONS[name][variant];
  const resolvedTone = tone ?? XIDIG_ICON_DEFAULT_TONE[name];
  const toneClass = TONE_CLASS[resolvedTone];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['x-ic', toneClass, className].filter(Boolean).join(' ')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill ? 'currentColor' : 'none'}
          fillRule={p.evenodd ? 'evenodd' : undefined}
          stroke={p.stroke === false ? 'none' : undefined}
          strokeWidth={p.sw}
          className={
            p.smoke ? `x-ic-smk${p.smoke === 2 ? ' x-ic-smk--2' : ''}${animateSmoke ? ' x-ic-smk--on' : ''}` : undefined
          }
        />
      ))}
    </svg>
  );
}

export default XidigIcon;
