// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { HeaderViewer } from '@/lib/auth/header-viewer';

import { UserMenu } from './user-menu';

/**
 * Ruling 3 as amended (Fariimo dispatch): on mobile the dock carries no
 * Fariimo slot — the unread count rides the ACCOUNT icon (calm accent, never
 * red) and the account menu carries the Fariimo entry. Live-DOM suite because
 * the menu opens on click.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const badges = { messages: 0, notifications: 0, signedIn: true };
vi.mock('@/components/nav/badge-provider', () => ({
  useBadges: () => badges,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/',
}));
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { signOut: async () => {} } }),
}));
vi.mock('@/lib/api-client', () => ({
  apiPost: async () => ({}),
}));

const viewer: HeaderViewer = {
  signedIn: true,
  userId: 'u-hodan',
  displayName: 'Hodan Cabdi',
  handle: 'hodan',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  badges.messages = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
});

function mount() {
  root = createRoot(container);
  act(() =>
    root!.render(
      <LocaleProvider initialLocale="en">
        <UserMenu viewer={viewer} />
      </LocaleProvider>,
    ),
  );
}

function trigger(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('.xidig-user-menu__trigger');
  if (!button) throw new Error('trigger not found');
  return button;
}

describe('UserMenu — mobile unread home per ruling 3', () => {
  it('shows no badge when there are no unread messages', () => {
    mount();
    expect(container.querySelector('.xidig-user-menu__badge')).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe('Account menu');
  });

  it('rides the unread count on the avatar trigger, calmly', () => {
    badges.messages = 3;
    mount();
    const badge = container.querySelector('.xidig-user-menu__badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('3');
    expect(badge!.className).toContain('xidig-nav__badge');
    expect(trigger().getAttribute('aria-label')).toContain('3');
  });

  it('caps the trigger badge at 99+', () => {
    badges.messages = 240;
    mount();
    expect(container.querySelector('.xidig-user-menu__badge')!.textContent).toBe('99+');
  });

  it('carries the Fariimo entry (with count) inside the account menu', () => {
    badges.messages = 3;
    mount();
    act(() => trigger().click());
    const items = [...container.querySelectorAll('[role="menuitem"]')];
    const fariimo = items.find((item) => item.getAttribute('href') === '/messages');
    expect(fariimo).toBeDefined();
    expect(fariimo!.textContent).toContain('Messages');
    expect(fariimo!.textContent).toContain('3');
    expect(items.indexOf(fariimo!)).toBe(0);
  });
});
