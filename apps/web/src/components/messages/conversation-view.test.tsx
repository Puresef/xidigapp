import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { MessageView } from '@/lib/dm/views';

import { ConversationView, type ConversationHeader } from './conversation-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/messages/c1',
}));

/**
 * Render-branching contracts for the thread (6b/6d + f4/f5):
 *
 *   * empty ACCEPTED thread teaches "say salaam" — and only then;
 *   * f5: the sender of a pending request sees the normalising notice and a
 *     CLOSED composer — and because the server presents declined as pending,
 *     this render IS the declined render (no declined-only string exists in
 *     the component at all);
 *   * 6d: an incoming request renders the explainer + decision bar, never a
 *     composer, and never a read signal;
 *   * f4: blocked-by-me renders anonymised chrome + the block date; blocked
 *     the other way renders only the neutral restricted notice.
 *
 * All SSR-known (messages arrive as props), so this asserts branching, not
 * fetch timing.
 */

const OTHER = {
  userId: 'u2',
  handle: 'hodan',
  displayName: 'Hodan Cabdi',
  verificationStatus: 'unverified',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

function render(
  status: ConversationHeader['status'],
  messages: MessageView[] = [],
  overrides: {
    isInitiator?: boolean;
    blockedAt?: string | null;
    requestContext?: {
      sharedLabName: string | null;
      repliedAskTitle: string | null;
      verified: boolean;
      memberYear: number | null;
    } | null;
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(ConversationView, {
        meId: 'user-1',
        initialHeader: {
          id: 'c1',
          status,
          isInitiator: overrides.isInitiator ?? true,
          other: OTHER,
          createdAt: '2026-08-01T10:00:00Z',
        },
        initialMessages: messages,
        initialNextCursor: null,
        requestContext: overrides.requestContext ?? null,
        blockedAt: overrides.blockedAt ?? null,
      }),
    }),
  );
}

const MESSAGE: MessageView = {
  id: 'm1',
  conversationId: 'c1',
  senderUserId: 'user-1',
  body: 'salaam!',
  voice: null,
  isMine: true,
  deleted: false,
  createdAt: '2026-07-30T10:00:00Z',
};

describe('ConversationView empty thread', () => {
  it('empty accepted thread teaches the first move (say salaam)', () => {
    const html = render('accepted');
    expect(html).toContain('say salaam');
    expect(html).not.toContain('This is the start of your conversation');
  });

  it('a thread with messages keeps the history-start line, no teaching state', () => {
    const html = render('accepted', [MESSAGE]);
    expect(html).not.toContain('say salaam');
    expect(html).toContain('This is the start of your conversation');
  });

  it('non-composable states never invite a salaam the member cannot send', () => {
    const html = render('pending', [], { isInitiator: true });
    expect(html).not.toContain('say salaam');
  });
});

describe('f5 — sent request (the declined render, by construction)', () => {
  it('shows the sent meta, the normalising notice, and NO composer', () => {
    const html = render('pending', [MESSAGE], { isInitiator: true });
    expect(html).toContain('Request · sent');
    expect(html).toContain('both are normal');
    expect(html).toContain('The composer opens if');
    expect(html).not.toContain('xidig-dm-composer');
  });

  it('carries no declined-only string anywhere in the initiator render', () => {
    const html = render('pending', [MESSAGE], { isInitiator: true });
    expect(html.toLowerCase()).not.toContain('decline');
  });
});

describe('6d — incoming request', () => {
  it('renders the explainer, the context card, and the decision bar — no composer', () => {
    const html = render('pending', [MESSAGE], {
      isInitiator: false,
      requestContext: {
        sharedLabName: 'Gaadiidka Bulshada',
        repliedAskTitle: 'GDPR',
        verified: false,
        memberYear: 2025,
      },
    });
    expect(html).toContain('message request');
    expect(html).toContain('Accept and reply');
    expect(html).toContain('What you know about');
    expect(html).toContain('Gaadiidka Bulshada');
    expect(html).toContain('Not yet verified');
    expect(html).toContain('never told');
    expect(html).not.toContain('xidig-dm-composer');
  });
});

describe('f4 — blocked', () => {
  it('blocker view: anonymised chrome, dimmed history, date, unblock', () => {
    const html = render('blocked', [MESSAGE], { blockedAt: '2026-07-12T09:00:00Z' });
    expect(html).toContain('Blocked member');
    expect(html).not.toContain('Hodan Cabdi');
    expect(html).toContain('xidig-dm-thread--dimmed');
    expect(html).toContain('You blocked this member');
    expect(html).toContain('Unblock');
    expect(html).toContain('The composer is closed.');
  });

  it('the other side sees only the neutral restricted notice — a block is never revealed', () => {
    const html = render('blocked', [MESSAGE], { blockedAt: null });
    expect(html).toContain('You can’t message this member.');
    expect(html).not.toContain('You blocked');
    expect(html).not.toContain('Unblock');
  });
});
