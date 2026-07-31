// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { LITE_BUNDLES } from '@/lib/lite/prefs';

import { LiteMediaProvider } from './lite-media-provider';
import { LiteShowAll } from './lite-show-all';
import { MediaSlot } from './media-slot';

/**
 * "N hidden — Show all on this page" bar (§22): appears only under a provider
 * with 2+ deferred slots, one tap reveals every slot on the page, and the bar
 * removes itself afterwards.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const bar = () => container.querySelector<HTMLElement>('.xidig-lite-showall');

function slot(n: number) {
  return (
    <MediaSlot
      kind="image"
      src={`https://cdn.test/${n}.webp`}
      alt={`Photo ${n}`}
      prefs={LITE_BUNDLES.essentials}
    />
  );
}

describe('LiteShowAll', () => {
  it('renders nothing without a provider', () => {
    mount(<LiteShowAll />);
    expect(bar()).toBeNull();
  });

  it('renders nothing while fewer than 2 slots are deferred', () => {
    mount(
      <LiteMediaProvider>
        <LiteShowAll />
        {slot(1)}
      </LiteMediaProvider>,
    );
    expect(bar()).toBeNull();
  });

  it('shows the hidden count and reveals every slot on the page in one tap', () => {
    mount(
      <LiteMediaProvider>
        <LiteShowAll />
        {slot(1)}
        {slot(2)}
        {slot(3)}
      </LiteMediaProvider>,
    );

    expect(bar()!.textContent).toContain('3 hidden');
    expect(container.querySelectorAll('img')).toHaveLength(0);

    click(bar()!.querySelector('button')!);
    expect(container.querySelectorAll('img')).toHaveLength(3);
    // Everything shown → the bar removes itself.
    expect(bar()).toBeNull();
  });
});
