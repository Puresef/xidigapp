// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { formatBytes, MAP_EST_BYTES } from '@/lib/lite/estimates';
import { LITE_BUNDLES } from '@/lib/lite/prefs';
import { getSavedThisWeek } from '@/lib/lite/savings';

import { MediaSlot } from './media-slot';

/**
 * MediaSlot contract (§22 Lite keystone, Task 14): the deferred placeholder
 * is a same-layout box (aspect-ratio held) carrying label + ~size + Show; a
 * tap reveals that ONE asset and is remembered per browser session
 * (sessionStorage); deferred slots feed the savings meter exactly once per
 * src; images are connection-aware even outside Lite (thumb-first on
 * saveData/2g/3g with an explicit tap-to-full). Live-DOM suite: session
 * memory and the savings counter are real storage behavior, not mocks.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = 'https://cdn.test/photo-full.webp';
const THUMB = 'https://cdn.test/photo-thumb.webp';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  window.sessionStorage.clear();
  window.localStorage.clear();
  // trackClient fires a beacon on reveal; swallow it so no network is touched.
  Object.defineProperty(window.navigator, 'sendBeacon', {
    value: vi.fn(() => true),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  clearConnection();
});

/** Simulate the Network Information API (absent in jsdom by default). */
function setConnection(info: { saveData?: boolean; effectiveType?: string }) {
  Object.defineProperty(window.navigator, 'connection', {
    value: info,
    configurable: true,
  });
}

function clearConnection() {
  delete (window.navigator as { connection?: unknown }).connection;
}

function mount(ui: ReactNode) {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>));
}

function unmount() {
  if (root) act(() => root!.unmount());
  root = null;
  container.innerHTML = '';
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const img = () => container.querySelector<HTMLImageElement>('img');
const showButton = () => container.querySelector<HTMLButtonElement>('.xidig-media-slot__show');

describe('MediaSlot deferred placeholder (Lite)', () => {
  it('renders a same-layout box with label, ~size and Show — never the asset', () => {
    mount(
      <MediaSlot
        kind="image"
        src={SRC}
        alt="Suuq stall photo"
        estBytes={250_000}
        width={800}
        height={600}
        prefs={LITE_BUNDLES.essentials}
      />,
    );

    const frame = container.querySelector<HTMLElement>('.xidig-media-slot--image')!;
    expect(frame).not.toBeNull();
    // Same-layout: the box holds the asset's aspect ratio, so revealing
    // later cannot shift the page. (jsdom normalizes to "n / 1".)
    expect(frame.style.aspectRatio).toContain(String(800 / 600));
    expect(img()).toBeNull();

    expect(frame.querySelector('.xidig-media-slot__label')!.textContent).toBe('Suuq stall photo');
    expect(frame.querySelector('.xidig-media-slot__size')!.textContent).toBe(
      `~${formatBytes(250_000, 'en')}`,
    );
    const show = showButton()!;
    expect(show.textContent).toBe('Show');
    expect(show.getAttribute('aria-label')).toBe('Show Suuq stall photo');
  });

  it('tap reveals the asset and sessionStorage remembers it across remounts', () => {
    mount(<MediaSlot kind="image" src={SRC} alt="Photo" prefs={LITE_BUNDLES.essentials} />);
    expect(img()).toBeNull();

    click(showButton()!);
    expect(img()!.getAttribute('src')).toBe(SRC);
    expect(window.sessionStorage.getItem(`xidig_lite_rev:${SRC}`)).toBe('1');

    // Fresh mount, same session → opens immediately, no placeholder.
    unmount();
    mount(<MediaSlot kind="image" src={SRC} alt="Photo" prefs={LITE_BUNDLES.essentials} />);
    expect(showButton()).toBeNull();
    expect(img()!.getAttribute('src')).toBe(SRC);
  });

  it('counts a deferred slot toward the savings meter exactly once per src', () => {
    mount(
      <MediaSlot
        kind="image"
        src={SRC}
        alt="Photo"
        estBytes={100_000}
        prefs={LITE_BUNDLES.essentials}
      />,
    );
    expect(getSavedThisWeek()).toBe(100_000);

    // Remount (e.g. feed pagination re-render) → no double count.
    unmount();
    mount(
      <MediaSlot
        kind="image"
        src={SRC}
        alt="Photo"
        estBytes={100_000}
        prefs={LITE_BUNDLES.essentials}
      />,
    );
    expect(getSavedThisWeek()).toBe(100_000);

    // A different src is its own savings entry.
    unmount();
    mount(
      <MediaSlot
        kind="image"
        src="https://cdn.test/other.webp"
        alt="Other"
        estBytes={40_000}
        prefs={LITE_BUNDLES.essentials}
      />,
    );
    expect(getSavedThisWeek()).toBe(140_000);
  });

  it('does not touch the savings meter when the category loads normally', () => {
    mount(<MediaSlot kind="image" src={SRC} alt="Photo" prefs={LITE_BUNDLES.everything} />);
    expect(img()).not.toBeNull();
    expect(getSavedThisWeek()).toBe(0);
  });

  it('defers a map slot behind the placeholder and reveals children on tap', () => {
    // Task 12 convention: map surfaces route through MediaSlot with the
    // stable pseudo-src '/suuq/map#tiles' as their session-memory key.
    mount(
      <MediaSlot kind="map" src="/suuq/map#tiles" alt="Map" prefs={LITE_BUNDLES.essentials}>
        <div data-testid="tiles">tiles</div>
      </MediaSlot>,
    );

    expect(container.querySelector('[data-testid="tiles"]')).toBeNull();
    expect(container.querySelector('.xidig-media-slot__size')!.textContent).toBe(
      `~${formatBytes(MAP_EST_BYTES, 'en')}`,
    );

    click(showButton()!);
    expect(container.querySelector('.xidig-media-slot--map [data-testid="tiles"]')).not.toBeNull();
    expect(window.sessionStorage.getItem('xidig_lite_rev:/suuq/map#tiles')).toBe('1');
  });
});

describe('MediaSlot connection-aware image pick (non-Lite)', () => {
  // Regression net for the isSlowConnection dedupe (Task 14): behavior must
  // be identical through lib/lite/connection — saveData or a 2g/3g
  // effectiveType pick the thumb first; fast/unknown APIs load full.
  it.each([
    { name: 'saveData', info: { saveData: true } },
    { name: 'effectiveType 2g', info: { effectiveType: '2g' } },
    { name: 'effectiveType 3g', info: { effectiveType: '3g' } },
  ])('loads the thumb first on a slow connection ($name), tap upgrades to full', ({ info }) => {
    setConnection(info);
    mount(
      <MediaSlot
        kind="image"
        src={SRC}
        thumbSrc={THUMB}
        alt="Photo"
        prefs={LITE_BUNDLES.everything}
      />,
    );

    expect(img()!.getAttribute('src')).toBe(THUMB);
    const upgrade = container.querySelector<HTMLButtonElement>('.xidig-media-slot__thumb-btn')!;
    expect(upgrade.getAttribute('aria-label')).toBe('Load full image');

    click(upgrade);
    expect(img()!.getAttribute('src')).toBe(SRC);
    expect(container.querySelector('.xidig-media-slot__thumb-btn')).toBeNull();
  });

  it('loads the full asset straight away on a fast connection', () => {
    setConnection({ effectiveType: '4g' });
    mount(
      <MediaSlot
        kind="image"
        src={SRC}
        thumbSrc={THUMB}
        alt="Photo"
        prefs={LITE_BUNDLES.everything}
      />,
    );
    expect(img()!.getAttribute('src')).toBe(SRC);
    expect(container.querySelector('.xidig-media-slot__thumb-btn')).toBeNull();
  });

  it('goes straight to src when no separate thumb exists (API absent)', () => {
    mount(<MediaSlot kind="image" src={SRC} alt="Photo" prefs={LITE_BUNDLES.everything} />);
    expect(img()!.getAttribute('src')).toBe(SRC);
  });
});
