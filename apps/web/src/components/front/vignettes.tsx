import type { CSSProperties, ReactNode } from 'react';

/**
 * Front-door feature vignettes — honest schematic animated scenes, one per
 * feature block (front-door-plan Phase B; approved motion v2).
 *
 * Invariants:
 * - NAMELESS and schematic: no invented people, names, or photos. Labels are
 *   generic or reuse existing i18n copy — the platform's no-fabrication rule.
 * - Server components, zero JS: all animation is CSS keyframes in front.css,
 *   class-triggered by `.is-inview` (added by FrontMotion) and double-gated
 *   behind (prefers-reduced-motion: no-preference) + html:not([data-motion='off']).
 * - Final-frame rule: every animated element's BASE style is its 100% state,
 *   so motion-off / no-JS users see the complete finished scene, never an
 *   empty box.
 * - Purely decorative: aria-hidden; the block's heading/body carry meaning.
 */

/* Real Plaza reaction taxonomy (§ Plaza) — module constants so the emoji stay
   out of JSX text (lint) and can never drift from the real set by accident. */
const REACTIONS: ReadonlyArray<{ emoji: string; count: number }> = [
  { emoji: '🔥', count: 4 },
  { emoji: '💪', count: 3 },
  { emoji: '🤲', count: 5 },
  { emoji: '💡', count: 2 },
  { emoji: '👀', count: 3 },
];

/** All translated decorative labels the vignettes use — built once by the
 *  page from existing keys + the marketing.vig* additions. */
export interface VignetteLabels {
  readonly ask: string; // plaza.typeAsk
  readonly skills: readonly [string, string, string]; // marketing.vigSkill*
  readonly suuqQuery: string; // marketing.vigSuuqQuery
  readonly accept: string; // action.accept
  readonly club: string; // term.club (Koox)
  readonly lab: string; // term.lab (Warshad)
  readonly rooms: readonly [string, string, string]; // lab.tabUpdates/Decisions/Members
  readonly garab: string; // term.garab (Co-sign)
  readonly show: string; // lite.show (Muuji)
  readonly off: string; // settings.toggleOff
  readonly bait: string; // marketing.vigBaitLabel
}

export type VignetteKind =
  | 'feed'
  | 'profile'
  | 'suuq'
  | 'dm'
  | 'labs'
  | 'capital'
  | 'lite'
  | 'owned';

/** Odometer count: a vertical strip of digits 0..n; base state shows the
 *  final digit, motion rolls up from 0. Single digits only — schematic. */
function Odometer({ n }: { n: number }) {
  const digits = Array.from({ length: n + 1 }, (_, i) => String(i));
  return (
    <span className="xf-vg-count">
      <span className="xf-vg-count__strip" style={{ '--n': n } as CSSProperties}>
        {digits.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    </span>
  );
}

/* 1 ── Madal/feed: a post card assembling, then the real reaction chips
       popping in with counts ticking up. */
function FeedVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-card xf-vg-card--feed">
      <div className="xf-vg-row">
        <span className="xf-vg-dot" />
        <span className="xf-vg-bar xf-vg-bar--w35 xf-vg-a1" />
        <span className="xf-vg-tag">{labels.ask}</span>
      </div>
      <span className="xf-vg-bar xf-vg-bar--w90 xf-vg-a2" />
      <span className="xf-vg-bar xf-vg-bar--w75 xf-vg-a3" />
      <span className="xf-vg-bar xf-vg-bar--w55 xf-vg-a4" />
      <div className="xf-vg-reactions">
        {REACTIONS.map((r, i) => (
          <span key={r.emoji} className={`xf-vg-chip xf-vg-chip--r${i + 1}`}>
            <span className="xf-vg-chip__emoji">{r.emoji}</span>
            <Odometer n={r.count} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* 2 ── Profiles: avatar ring draws, skill chips slot in, a badge star sparks. */
function ProfileVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-card xf-vg-card--profile">
      <div className="xf-vg-row xf-vg-row--top">
        <svg viewBox="0 0 48 48" className="xf-vg-avatar">
          <circle className="xf-vg-avatar__ring" cx="24" cy="24" r="21.5" pathLength={1} />
          <circle className="xf-vg-avatar__head" cx="24" cy="18.5" r="6.5" />
          <path className="xf-vg-avatar__body" d="M11.5 38.5a12.5 9.5 0 0 1 25 0" />
        </svg>
        <div className="xf-vg-col">
          <span className="xf-vg-bar xf-vg-bar--w60 xf-vg-a1" />
          <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w40 xf-vg-a2" />
        </div>
        <svg viewBox="0 0 24 24" className="xf-vg-badge">
          <polygon points="12,2.5 14.7,9.1 21.5,9.6 16.3,14 18,21 12,17.2 6,21 7.7,14 2.5,9.6 9.3,9.1" />
        </svg>
      </div>
      <div className="xf-vg-chips">
        {labels.skills.map((skill, i) => (
          <span key={skill} className={`xf-vg-chip xf-vg-chip--skill xf-vg-chip--s${i + 1}`}>
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

/* 3 ── Suuq: a typing search query, a pulsing map pin, results fanning out. */
function SuuqVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-scene xf-vg-scene--suuq">
      <div className="xf-vg-search">
        <svg viewBox="0 0 20 20" className="xf-vg-search__icon">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13l4.5 4.5" />
        </svg>
        <span className="xf-vg-search__q">{labels.suuqQuery}</span>
        <span className="xf-vg-search__caret" />
      </div>
      <div className="xf-vg-map">
        <svg viewBox="0 0 120 64" className="xf-vg-map__grid" preserveAspectRatio="none">
          <path d="M0 22h120M0 44h120M30 0v64M60 0v64M90 0v64" />
        </svg>
        <span className="xf-vg-pin">
          <span className="xf-vg-pin__ring" />
          <svg viewBox="0 0 24 24" className="xf-vg-pin__glyph">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
        </span>
        <div className="xf-vg-result xf-vg-result--1">
          <span className="xf-vg-dot xf-vg-dot--sm" />
          <span className="xf-vg-col">
            <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w70" />
            <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w45" />
          </span>
        </div>
        <div className="xf-vg-result xf-vg-result--2">
          <span className="xf-vg-dot xf-vg-dot--sm" />
          <span className="xf-vg-col">
            <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w60" />
            <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w40" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* 4 ── Fariimo: bubbles + a request gate flipping locked→accepted, a reply
       arriving, a shield pulsing once. */
function DmVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-scene xf-vg-scene--dm">
      <div className="xf-vg-bubble xf-vg-bubble--in xf-vg-b1">
        <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w80" />
        <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w50" />
      </div>
      <div className="xf-vg-gate">
        <span className="xf-vg-gate__icons">
          <svg viewBox="0 0 24 24" className="xf-vg-gate__lock">
            <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" />
            <rect x="5" y="10" width="14" height="10" rx="2.5" />
          </svg>
          <svg viewBox="0 0 24 24" className="xf-vg-gate__check">
            <path d="M4.5 12.5l5 5 10-11" fill="none" />
          </svg>
        </span>
        <span className="xf-vg-gate__label">{labels.accept}</span>
      </div>
      <div className="xf-vg-bubble xf-vg-bubble--out xf-vg-b2">
        <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w70" />
      </div>
      <div className="xf-vg-bubble xf-vg-bubble--in xf-vg-b3">
        <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w60" />
        <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w35" />
      </div>
      <svg viewBox="0 0 24 24" className="xf-vg-shield">
        <path d="M12 2.5l7.5 3v6c0 5-3.2 8.3-7.5 10-4.3-1.7-7.5-5-7.5-10v-6z" />
        <path className="xf-vg-shield__tick" d="M8.5 12l2.5 2.5 4.5-5" fill="none" />
      </svg>
    </div>
  );
}

/* 5 ── Labs: a loose Koox bubble-cluster converging into an ordered Warshad
       room with named slots snapping into place. */
function LabsVignette({ labels }: { labels: VignetteLabels }) {
  const scatter: ReadonlyArray<readonly [string, string]> = [
    ['-64px', '-30px'],
    ['52px', '-38px'],
    ['-38px', '30px'],
    ['66px', '26px'],
    ['8px', '-8px'],
  ];
  return (
    <div className="xf-vg-scene xf-vg-scene--labs">
      <span className="xf-vg-tag xf-vg-tag--club">{labels.club}</span>
      {scatter.map(([x, y], i) => (
        <span
          key={`${x}${y}`}
          className={`xf-vg-blob xf-vg-blob--${i + 1}`}
          style={{ '--bx': x, '--by': y } as CSSProperties}
        />
      ))}
      <div className="xf-vg-room">
        <div className="xf-vg-room__head">
          <span className="xf-vg-tag xf-vg-tag--lab">{labels.lab}</span>
        </div>
        {labels.rooms.map((room, i) => (
          <div key={room} className={`xf-vg-slot xf-vg-slot--${i + 1}`}>
            <span className="xf-vg-slot__mark" />
            <span className="xf-vg-slot__label">{room}</span>
            <span className="xf-vg-bar xf-vg-bar--thin xf-vg-bar--w30" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* 6 ── Capital: a build-in-public timeline drawing left→right, milestones
       lighting up, a Garab (co-sign) counter incrementing. */
function CapitalVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-scene xf-vg-scene--capital">
      <svg viewBox="0 0 200 56" className="xf-vg-timeline" preserveAspectRatio="none">
        <path className="xf-vg-timeline__track" d="M12 28H188" />
        <path className="xf-vg-timeline__draw" d="M12 28H188" pathLength={1} />
      </svg>
      <span className="xf-vg-ms xf-vg-ms--1" />
      <span className="xf-vg-ms xf-vg-ms--2" />
      <span className="xf-vg-ms xf-vg-ms--3 xf-vg-ms--gold" />
      <div className="xf-vg-cosign">
        <span className="xf-vg-cosign__emoji">🤲</span>
        <Odometer n={7} />
        <span className="xf-vg-cosign__label">{labels.garab}</span>
      </div>
    </div>
  );
}

/* 7 ── Lite: the data meter shrinking; a deferred (blurred, abstract — never a
       fake photo) tile revealed by the real Muuji chip. */
function LiteVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-scene xf-vg-scene--lite">
      <div className="xf-vg-meter">
        <span className="xf-vg-meter__fill" />
      </div>
      <div className="xf-vg-tilewrap">
        <div className="xf-vg-tile" />
        <span className="xf-vg-muuji">
          <span className="xf-vg-muuji__ring" />
          {labels.show}
        </span>
      </div>
    </div>
  );
}

/* 8 ── Community-owned: the engagement-bait dial switching OFF; a tangled
       ranking scribble untangling into a straight chronological line. */
function OwnedVignette({ labels }: { labels: VignetteLabels }) {
  return (
    <div className="xf-vg-scene xf-vg-scene--owned">
      <div className="xf-vg-dial">
        <span className="xf-vg-dial__label">{labels.bait}</span>
        <span className="xf-vg-switch">
          <span className="xf-vg-switch__knob" />
        </span>
        <span className="xf-vg-dial__state">{labels.off}</span>
      </div>
      <svg viewBox="0 0 200 48" className="xf-vg-lines" preserveAspectRatio="none">
        <path
          className="xf-vg-lines__scribble"
          d="M8 24c14-18 22 22 36-4s24 26 38-6 22 24 36-2 24 22 38-4 22 18 36 2"
          pathLength={1}
        />
        <path className="xf-vg-lines__straight" d="M8 24H192" pathLength={1} />
      </svg>
      <div className="xf-vg-ticks">
        <span className="xf-vg-tick xf-vg-tick--1" />
        <span className="xf-vg-tick xf-vg-tick--2" />
        <span className="xf-vg-tick xf-vg-tick--3" />
        <span className="xf-vg-tick xf-vg-tick--4" />
      </div>
    </div>
  );
}

const VIGNETTES: Record<VignetteKind, (props: { labels: VignetteLabels }) => ReactNode> = {
  feed: FeedVignette,
  profile: ProfileVignette,
  suuq: SuuqVignette,
  dm: DmVignette,
  labs: LabsVignette,
  capital: CapitalVignette,
  lite: LiteVignette,
  owned: OwnedVignette,
};

export function Vignette({
  kind,
  labels,
  compact = false,
}: {
  kind: VignetteKind;
  labels: VignetteLabels;
  compact?: boolean;
}) {
  const Scene = VIGNETTES[kind];
  return (
    <div
      className={`xf-vig xf-vig--${kind}${compact ? ' xf-vig--compact' : ''}`}
      aria-hidden="true"
    >
      <Scene labels={labels} />
    </div>
  );
}
