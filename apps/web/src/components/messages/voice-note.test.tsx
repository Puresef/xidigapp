// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import { VoiceRecorderButton } from './voice-note';

/**
 * The composer mic must never strand the member on a broken button: whether
 * the environment lacks MediaRecorder entirely or the member denies the
 * browser's mic prompt (getUserMedia rejects NotAllowedError — also what a
 * misconfigured Permissions-Policy produces), the control degrades to the
 * announced role=status note. The header side of that contract is pinned in
 * lib/security-headers.test.ts (microphone=(self)).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
  delete (window.navigator as { mediaDevices?: unknown }).mediaDevices;
});

function mount() {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="en">
        <VoiceRecorderButton disabled={false} onClip={() => {}} />
      </LocaleProvider>,
    ),
  );
}

function recordButton() {
  return container.querySelector('button[aria-label="Record a voice note"]');
}

function unavailableNote() {
  return container.querySelector('[role="status"].xidig-dm-voice__unavailable');
}

describe('VoiceRecorderButton degradation', () => {
  it('swaps to the announced unavailable note when the member denies the mic prompt', async () => {
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder = class {};
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
      },
      configurable: true,
    });

    mount();
    const button = recordButton();
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(recordButton()).toBeNull();
    expect(unavailableNote()?.textContent).toBe('Voice isn’t available');
  });

  it('shows the same note without recording UI when MediaRecorder is missing', async () => {
    // jsdom default: no MediaRecorder, no mediaDevices.
    mount();
    const button = recordButton();
    expect(button).not.toBeNull();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(recordButton()).toBeNull();
    expect(unavailableNote()?.textContent).toBe('Voice isn’t available');
  });
});
