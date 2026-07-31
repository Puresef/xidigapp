// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { LiteMediaProvider, useLiteMedia } from './lite-media-provider';
import { MediaSlot } from './media-slot';

/**
 * Page-level Lite coordination (§22): deferred slots register with the
 * provider (hiddenCount), duplicate slots of one src stay in sync when either
 * is revealed, and the context is optional — no provider, null context,
 * standalone slots keep working (media-slot.test.tsx covers the standalone
 * behavior itself).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = 'https://cdn.test/shared.webp';

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  window.sessionStorage.clear();
  window.localStorage.clear();
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
});

function mount(ui: ReactNode) {
  root = createRoot(container);
  act(() => root!.render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>));
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Exposes the live context value for assertions. */
function HiddenCountProbe() {
  const lite = useLiteMedia();
  return <output data-testid="hidden-count">{lite ? lite.hiddenCount : 'null'}</output>;
}

const hiddenCount = () => container.querySelector('[data-testid="hidden-count"]')!.textContent;

describe('LiteMediaProvider', () => {
  it('useLiteMedia is null without a provider (slots stay standalone)', () => {
    mount(<HiddenCountProbe />);
    expect(hiddenCount()).toBe('null');
  });

  it('tracks deferred slots in hiddenCount and unregisters on reveal', () => {
    mount(
      <LiteMediaProvider>
        <HiddenCountProbe />
        <MediaSlot
          kind="image"
          src="https://cdn.test/a.webp"
          alt="A"
          prefs={LITE_BUNDLES.essentials}
        />
        <MediaSlot
          kind="image"
          src="https://cdn.test/b.webp"
          alt="B"
          prefs={LITE_BUNDLES.essentials}
        />
      </LiteMediaProvider>,
    );
    expect(hiddenCount()).toBe('2');

    click(container.querySelector('.xidig-media-slot__show')!);
    expect(hiddenCount()).toBe('1');
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('keeps duplicate slots of one src in sync: revealing either reveals both', () => {
    mount(
      <LiteMediaProvider>
        <HiddenCountProbe />
        <MediaSlot kind="image" src={SRC} alt="First" prefs={LITE_BUNDLES.essentials} />
        <MediaSlot kind="image" src={SRC} alt="Second" prefs={LITE_BUNDLES.essentials} />
      </LiteMediaProvider>,
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);

    click(container.querySelector('.xidig-media-slot__show')!);
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(hiddenCount()).toBe('0');
  });
});
