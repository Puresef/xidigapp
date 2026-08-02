// apps/web/src/components/icons/paths.ts
// Xidig post/action glyph family — D2 exports (Icons / Mark project), 24px grid.
// Geometry is canon: do not re-draw here; regenerate from exports/glyphs/*.svg.

export type XidigIconName = 'salaan' | 'codsi' | 'guul' | 'war' | 'cod' | 'garab';
export type XidigIconVariant = 'outline' | 'filled';
export type XidigIconTone = 'inherit' | 'accent' | 'accentText' | 'trust';

export interface IconPath {
  d: string;
  /** fill with currentColor (closed silhouette) */
  fill?: boolean;
  /** evenodd knockout (codsi-filled, garab-filled cup) */
  evenodd?: boolean;
  /** stroke the path (default true; false for pure fills like the codsi knockout) */
  stroke?: boolean;
  /** stroke-width override: 1.4 engraving details, 1.7 smoke (default 2) */
  sw?: number;
  /** garab smoke wisp — animatable, second wisp delayed */
  smoke?: 1 | 2;
}

const P = (d: string, extra: Partial<IconPath> = {}): IconPath => ({ d, ...extra });

export const XIDIG_ICONS: Record<XidigIconName, Record<XidigIconVariant, IconPath[]>> = {
  salaan: {
    outline: [
      P('M3.5 18.5h17'),
      P('M7.5 18.5a4.5 4.5 0 0 1 9 0'),
      P('M12 7.5v3'),
      P('m5.6 11.9 2.1 2.1'),
      P('m18.4 11.9-2.1 2.1'),
    ],
    filled: [
      P('M3.5 18.5h17'),
      P('M7.5 18.5a4.5 4.5 0 0 1 9 0z', { fill: true }),
      P('M12 7.5v3'),
      P('m5.6 11.9 2.1 2.1'),
      P('m18.4 11.9-2.1 2.1'),
    ],
  },
  codsi: {
    outline: [
      P('M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 1 0 0-17.2Z'),
      P('M9.1 9.9c0-2.6 5.8-2.6 5.8 0 0 1.9-2.9 1.8-2.9 4'),
      P('M12 16.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 1 0 0-2.3Z', { fill: true, stroke: false }),
    ],
    filled: [
      P(
        'M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 1 0 0-17.2Zm0 3.3c2.1 0 3.5 1.3 3.5 3.1 0 1.1-.4 1.8-1.3 2.4-.8.5-1.1.8-1.1 1.4v.5h-2.2v-.6c0-1.1.4-1.7 1.3-2.3.8-.5 1.1-.8 1.1-1.4 0-.7-.5-1.1-1.3-1.1s-1.3.4-1.3 1.1H8.5c0-1.8 1.4-3.1 3.5-3.1Zm1.2 8.9v2.3h-2.4v-2.3Z',
        { fill: true, evenodd: true, stroke: false },
      ),
    ],
  },
  guul: {
    outline: [P('M12 3.8l2.1 5.7 6.1.2-4.8 3.8 1.7 5.9-5.1-3.4-5.1 3.4 1.7-5.9-4.8-3.8 6.1-.2Z')],
    filled: [P('M12 3.8l2.1 5.7 6.1.2-4.8 3.8 1.7 5.9-5.1-3.4-5.1 3.4 1.7-5.9-4.8-3.8 6.1-.2Z', { fill: true })],
  },
  war: {
    outline: [
      P('M8.6 15.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8Z'),
      P('M8.6 11.8A5.2 5.2 0 0 1 13.8 17'),
      P('M8.6 8.2A8.8 8.8 0 0 1 17.4 17'),
    ],
    filled: [
      P('M8.6 15.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8Z', { fill: true }),
      P('M8.6 11.8A5.2 5.2 0 0 1 13.8 17'),
      P('M8.6 8.2A8.8 8.8 0 0 1 17.4 17'),
    ],
  },
  cod: {
    outline: [
      P('M6.2 4.9h11.6a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z'),
      P('M6.2 10.3h6.1a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z'),
      P('M6.2 15.7h9.1a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z'),
    ],
    filled: [
      P('M6.2 4.9h11.6a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z', { fill: true }),
      P('M6.2 10.3h6.1a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z', { fill: true }),
      P('M6.2 15.7h9.1a1.7 1.7 0 0 1 0 3.4H6.2a1.7 1.7 0 0 1 0-3.4Z', { fill: true }),
    ],
  },
  garab: {
    // Approved D1 dabqaad. Outline = unlit; filled = lit (smoke).
    outline: [
      P('M7 9l2.3 1.8L12 8.6l2.7 2.2L17 9c-.3 3.4-1.8 5.6-3.6 6.6h-2.8C8.8 14.6 7.3 12.4 7 9Z'),
      P('m9.5 11 1.3 4.3', { sw: 1.4 }),
      P('m14.5 11-1.3 4.3', { sw: 1.4 }),
      P('M12 10.9l1.2 1.5-1.2 1.5-1.2-1.5Z', { sw: 1.4 }),
      P('M11.2 15.6h1.6v1.9c1.5.2 2.7 1.3 3 3.3H8.2c.3-2 1.5-3.1 3-3.3Z'),
      P('M9.6 18.5c.7-.4 4.1-.4 4.8 0', { sw: 1.4 }),
    ],
    filled: [
      P('M7 9l2.3 1.8L12 8.6l2.7 2.2L17 9c-.3 3.4-1.8 5.6-3.6 6.6h-2.8C8.8 14.6 7.3 12.4 7 9Zm5 1.9 1.2 1.5-1.2 1.5-1.2-1.5Z', { fill: true, evenodd: true }),
      P('M11.2 15.6h1.6v1.9c1.5.2 2.7 1.3 3 3.3H8.2c.3-2 1.5-3.1 3-3.3Z', { fill: true }),
      P('M11.3 9.3c-1.2-1.4 1.4-2.8.2-4.2-.7-.8-.4-1.8.3-2.3', { sw: 1.7, smoke: 1 }),
      P('M14.3 8.9c-.7-1 .7-1.9.1-2.9', { sw: 1.7, smoke: 2 }),
    ],
  },
};

/**
 * §2 colour law, kept in ONE place:
 * Guul is the only glyph that defaults to trust orange.
 * Everything else inherits (currentColor) so the surface's token decides.
 * Earned/trust states elsewhere must opt in with tone="trust" explicitly.
 */
export const XIDIG_ICON_DEFAULT_TONE: Record<XidigIconName, XidigIconTone> = {
  salaan: 'inherit',
  codsi: 'inherit',
  guul: 'trust',
  war: 'inherit',
  cod: 'inherit',
  garab: 'inherit',
};

/**
 * Post-type → glyph, in ONE place (like the tone map above) so PostCard, the
 * plaza filter tabs, and the composer picker can never drift apart. Keys match
 * the plaza PostType literals (Is-barasho · Weydiin · Guul · War · Codbixin).
 */
export const XIDIG_POST_TYPE_ICON = {
  intro: 'salaan',
  ask: 'codsi',
  win: 'guul',
  update: 'war',
  poll: 'cod',
} as const satisfies Record<string, XidigIconName>;
