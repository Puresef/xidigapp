import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { MessageView } from '@/lib/dm/views';

import { ConversationView, type ConversationHeader } from './conversation-view';

/**
 * Empty-thread teaching state (Task 9): a fresh ACCEPTED conversation with no
 * messages renders the "say salaam" EmptyState instead of the bare
 * history-start line — and ONLY then. Threads with messages keep the
 * history-start line; non-composable states (declined/blocked) keep their own
 * banners and never invite a salaam they can't send. All SSR-known (messages
 * arrive as props), so this asserts render branching, not fetch timing.
 */

const OTHER = {
  userId: 'u2',
  handle: 'hodan',
  displayName: 'Hodan Cabdi',
  verificationStatus: 'unverified',
  avatarThumbUrl: null,
  avatarBlurhash: null,
};

function render(status: ConversationHeader['status'], messages: MessageView[] = []): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(ConversationView, {
        meId: 'user-1',
        initialHeader: { id: 'c1', status, isInitiator: true, other: OTHER },
        initialMessages: messages,
        initialNextCursor: null,
      }),
    }),
  );
}

const MESSAGE: MessageView = {
  id: 'm1',
  conversationId: 'c1',
  senderUserId: 'user-1',
  body: 'salaam!',
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
    const html = render('declined');
    expect(html).not.toContain('say salaam');
  });
});
