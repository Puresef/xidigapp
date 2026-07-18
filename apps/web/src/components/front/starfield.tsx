/**
 * Static night-sky SVG for the front-door hero (Xidig = "star").
 *
 * Server component, zero client JS: every coordinate is computed once at
 * module scope from a fixed-seed PRNG, so the sky is identical on every
 * render (deterministic markup, hydration-safe) and ships as plain SVG —
 * no images, no external requests. (The old traced-constellation star was
 * replaced by the living mark — AnimatedMark mode="hero" in front-home.)
 *
 * Purely decorative: aria-hidden, pointer-events disabled via CSS
 * (.xidig-starfield in front.css). Twinkle classes are animated only under
 * motion-safe media queries; html[data-motion='off'] kills them globally.
 */

const VB_W = 1440;
const VB_H = 720;

/** mulberry32 — tiny deterministic PRNG; the fixed seed keeps the sky stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly opacity: number;
  readonly fill: string;
  readonly twinkle: number; // 0 = static; 1–3 pick a stagger class
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const STARS: ReadonlyArray<Star> = (() => {
  const rand = mulberry32(0x51d16);
  const stars: Star[] = [];
  for (let i = 0; i < 112; i += 1) {
    const x = round1(rand() * VB_W);
    const y = round1(rand() * VB_H);
    const r = round1(0.5 + rand() * 1.1);
    // The hero copy sits over the lower-left of the canvas — keep that zone dim
    // so the display type stays perfectly readable.
    const overCopy = x < 700 && y > 160;
    const opacity = Math.round(Math.min(0.15 + rand() * 0.75, overCopy ? 0.35 : 0.9) * 100) / 100;
    const fill = i % 7 === 0 ? '#8fc3f0' : '#e8f0ff';
    const twinkle = i % 9 === 0 ? 1 + (i % 3) : 0;
    stars.push({ x, y, r, opacity, fill, twinkle });
  }
  return stars;
})();

export function Starfield() {
  return (
    <div className="xidig-starfield" aria-hidden="true">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMaxYMin slice"
        xmlns="http://www.w3.org/2000/svg"
      >

        {/* Three depth layers (small/medium/large radii) — FrontMotion drives
            --xf-scroll and CSS translates each layer at a different rate for
            subtle parallax; motion-off leaves them exactly in place. */}
        {([1, 2, 3] as const).map((depth) => (
          <g key={depth} className={`xf-sf-d${depth}`}>
            {STARS.filter((star) => 1 + (star.r > 0.9 ? 1 : 0) + (star.r > 1.3 ? 1 : 0) === depth).map(
              (star, i) => (
                <circle
                  key={`s${star.x}-${star.y}-${i}`}
                  cx={star.x}
                  cy={star.y}
                  r={star.r}
                  fill={star.fill}
                  opacity={star.opacity}
                  className={star.twinkle ? `xf-tw xf-tw--${star.twinkle}` : undefined}
                />
              ),
            )}
          </g>
        ))}

      </svg>
    </div>
  );
}
