/**
 * The guiding star-path — the homepage signature (approved motion v2).
 *
 * Xidig means star; stars guided Somali nomads home; the page's last line is
 * "Come home to the Somali social app." One continuous SVG asterism path runs
 * down the homepage journey, weaving between the feature stations, drawn
 * progressively on scroll (stroke-dashoffset ← --path-progress, set by
 * FrontMotion) with a small dawn-gold star travelling it. It terminates at
 * the final CTA, where the five-pointed Somali star assembles from five
 * staggered stroke draws.
 *
 * Server component, deterministic markup. The layer never intercepts pointer
 * events, and the final frame is the fully-drawn path + assembled star — so
 * Lite / reduced-motion / no-JS visitors get the complete static picture.
 */

/* Normalized viewBox, stretched over the journey with preserveAspectRatio
   ="none" (vector-effect keeps strokes crisp). FrontMotion reads these off
   svg.viewBox at runtime — no shared constants to drift. */
const VB_W = 100;
const VB_H = 1200;

/* A gentle weave: right/left swings past the six stations, then settling to
   the centre spine for the trust/honesty/teaser rows and the final CTA. */
const PATH_D = [
  'M 50 0',
  'C 50 30, 74 52, 74 92',
  'C 74 140, 26 166, 26 214',
  'C 26 262, 74 288, 74 336',
  'C 74 384, 26 410, 26 458',
  'C 26 506, 74 532, 74 580',
  'C 74 628, 26 654, 26 702',
  'C 26 760, 50 800, 50 856',
  'C 50 920, 50 980, 50 1040',
  'L 50 1200',
].join(' ');

/** Absolutely-positioned decorative layer inside `.xf-journey`. */
export function StarPath() {
  return (
    <div className="xf-path-layer" aria-hidden="true">
      <svg
        className="xf-path-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path className="xf-path-track" d={PATH_D} pathLength={1} vectorEffect="non-scaling-stroke" />
        <path className="xf-path-draw" d={PATH_D} pathLength={1} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* HTML traveller (positioned by FrontMotion) — an HTML dot avoids the
          non-uniform viewBox stretch distorting its glow. Hidden at rest;
          only motion mode reveals it. */}
      <span className="xf-path-star" />
    </div>
  );
}

/* ── Final CTA: the five-pointed star assembling from five strokes ─────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* Pentagram chords: the classic five-stroke star — each stroke connects every
   second vertex of a pentagon (apex up), so five staggered line draws
   assemble the Somali star. */
const STAR_R = 26;
const STAR_C = 32;
const P = Array.from({ length: 5 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  return [round2(STAR_C + STAR_R * Math.cos(angle)), round2(STAR_C + STAR_R * Math.sin(angle))] as const;
});
const CHORD_ORDER = [0, 2, 4, 1, 3] as const;
const CHORDS: ReadonlyArray<string> = CHORD_ORDER.map((from, i) => {
  const to = CHORD_ORDER[(i + 1) % 5] ?? 0;
  const [x1, y1] = P[from] ?? [0, 0];
  const [x2, y2] = P[to] ?? [0, 0];
  return `M ${x1} ${y1} L ${x2} ${y2}`;
});

export function StarAssembly() {
  return (
    <div className="xf-asm" aria-hidden="true">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <circle className="xf-asm__glow" cx={STAR_C} cy={STAR_C} r="30" />
        {CHORDS.map((d, i) => (
          <path key={d} className={`xf-asm__stroke xf-asm__stroke--${i + 1}`} d={d} pathLength={1} />
        ))}
      </svg>
    </div>
  );
}
