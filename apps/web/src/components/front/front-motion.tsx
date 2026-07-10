'use client';

import { useEffect } from 'react';

/**
 * Front-door motion runtime (~2KB): the ONLY client JS in the design layer.
 *
 * - IntersectionObserver adds `.is-inview` (once, threshold 0.25) to every
 *   [data-reveal] element — this triggers the CSS reveal + vignette scenes.
 * - A passive rAF-throttled scroll handler sets `--path-progress` on the
 *   `.xf-journey` wrapper (drives the star-path stroke draw), positions the
 *   travelling star along the real path geometry, and sets `--xf-scroll` on
 *   the main element (starfield parallax depth layers).
 *
 * Bail-out: under prefers-reduced-motion OR html[data-motion='off'] it does
 * nothing at all — no observers, no listeners. All gated CSS keys off the
 * `.xf-motion` class added here, so no-JS/motion-off visitors keep the
 * complete final-frame page (path fully drawn, vignettes finished).
 */
export function FrontMotion() {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (document.documentElement.dataset.motion === 'off') return;
    const main = document.querySelector('main.xidig-front');
    if (!(main instanceof HTMLElement)) return;
    main.classList.add('xf-motion');

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-inview');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.25 },
    );
    for (const el of main.querySelectorAll('[data-reveal]')) io.observe(el);

    const journey = main.querySelector<HTMLElement>('.xf-journey');
    const layer = journey?.querySelector<HTMLElement>('.xf-path-layer') ?? null;
    const svg = layer?.querySelector('svg');
    const path = layer?.querySelector<SVGPathElement>('.xf-path-draw') ?? null;
    const star = layer?.querySelector<HTMLElement>('.xf-path-star') ?? null;
    const total = path ? path.getTotalLength() : 0;
    const vbW = svg?.viewBox.baseVal.width || 100;
    const vbH = svg?.viewBox.baseVal.height || 1200;

    let raf = 0;
    const frame = () => {
      raf = 0;
      const vh = window.innerHeight;
      main.style.setProperty('--xf-scroll', Math.min(1, Math.max(0, window.scrollY / vh)).toFixed(4));
      if (!journey || !layer) return;
      const rect = journey.getBoundingClientRect();
      const travelled = vh * 0.8 - rect.top;
      const p = Math.min(1, Math.max(0, travelled / Math.max(1, rect.height - vh * 0.2)));
      journey.style.setProperty('--path-progress', p.toFixed(4));
      if (path && star && total > 0) {
        const pt = path.getPointAtLength(total * p);
        const lr = layer.getBoundingClientRect();
        star.style.transform = `translate(${((pt.x / vbW) * lr.width).toFixed(1)}px, ${((pt.y / vbH) * lr.height).toFixed(1)}px)`;
      }
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(frame);
    };
    frame();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (raf) window.cancelAnimationFrame(raf);
      main.classList.remove('xf-motion');
    };
  }, []);

  return null;
}
