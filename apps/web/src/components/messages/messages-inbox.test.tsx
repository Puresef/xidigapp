import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LocaleProvider } from '@xidig/i18n/react';

import type { InboxItem } from '@/lib/dm/views';

import { MessagesInbox } from './messages-inbox';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => '/messages',
}));

/**
 * Inbox contract (6a/6c/6d): requests sit INLINE above the chats — never a
 * hidden second tab — as accent-rail cards with the sender's one message and
 * Aqbal/Diid on the card, followed by the silent-decline footnote. Chat rows
 * are plain; unread rows carry the count chip; verified members wear the
 * trust ring; the empty inbox is the 6c warm state pointing at the Plaza.
 */

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    conversationId: 'c1',
    status: 'accepted',
    isInitiator: true,
    other: {
      userId: 'u2',
      handle: 'hodan',
      displayName: 'Hodan Cabdi',
      verificationStatus: 'unverified',
      avatarThumbUrl: null,
      avatarBlurhash: null,
    },
    lastMessage: {
      body: 'salaam',
      at: '2026-07-30T10:00:00Z',
      senderUserId: 'u2',
      deleted: false,
      voice: false,
    },
    unreadCount: 0,
    updatedAt: '2026-07-30T10:00:00Z',
    createdAt: '2026-07-29T10:00:00Z',
    ...overrides,
  };
}

function render(conversations: InboxItem[] = [], activeId?: string): string {
  return renderToStaticMarkup(
    createElement(LocaleProvider, {
      initialLocale: 'en',
      children: createElement(MessagesInbox, {
        meId: 'user-1',
        initial: { conversations, nextCursor: null },
        activeId,
      }),
    }),
  );
}

const REQUEST = item({
  conversationId: 'r1',
  status: 'pending',
  isInitiator: false,
  other: {
    userId: 'u3',
    handle: 'faysal',
    displayName: 'Faysal Hirsi',
    verificationStatus: 'unverified',
    avatarThumbUrl: null,
    avatarBlurhash: null,
  },
  lastMessage: {
    body: 'Salaan Hodan. Waxaan arkay qoraalkaaga…',
    at: '2026-07-30T08:00:00Z',
    senderUserId: 'u3',
    deleted: false,
    voice: false,
  },
});

describe('MessagesInbox — inline requests (no tabs)', () => {
  it('never renders a tablist — requests are not a second inbox', () => {
    const html = render([REQUEST, item()]);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
  });

  it('requests lead as accent-rail cards with the one message and inline Aqbal/Diid', () => {
    const html = render([REQUEST, item()]);
    expect(html).toContain('Message requests · 1');
    expect(html).toContain('xidig-dm-reqcard');
    expect(html).toContain('Waxaan arkay qoraalkaaga');
    expect(html).toContain('Accept');
    expect(html).toContain('Decline');
    // The silent-decline footnote sits under the cards.
    expect(html).toContain('never told');
  });

  it('chats render below their own heading, requests never mix in', () => {
    const html = render([REQUEST, item()]);
    const requestsIdx = html.indexOf('xidig-dm-reqcard');
    const chatsIdx = html.indexOf('xidig-dm-row');
    expect(requestsIdx).toBeGreaterThan(-1);
    expect(chatsIdx).toBeGreaterThan(requestsIdx);
  });

  it('an outgoing pending request lists as a plain chat row — the sender sees no special state', () => {
    const html = render([item({ status: 'pending', isInitiator: true })]);
    expect(html).not.toContain('xidig-dm-reqcard');
    expect(html).toContain('xidig-dm-row');
  });
});

describe('MessagesInbox — chat rows', () => {
  it('unread rows carry the count chip and the emphasis class', () => {
    const html = render([item({ unreadCount: 2 })]);
    expect(html).toContain('xidig-dm-row--unread');
    expect(html).toContain('>2<');
  });

  it('verified members wear the trust ring on the disc', () => {
    const html = render([
      item({
        other: {
          userId: 'u2',
          handle: 'deeqa',
          displayName: 'Deeqa Axmed',
          verificationStatus: 'identity_verified',
          avatarThumbUrl: null,
          avatarBlurhash: null,
        },
      }),
    ]);
    expect(html).toContain('xidig-dm-row__disc--verified');
  });

  it('a voice-only last message previews as the neutral label, never fake text', () => {
    const html = render([
      item({
        lastMessage: { body: null, at: '2026-07-30T10:00:00Z', senderUserId: 'u2', deleted: false, voice: true },
      }),
    ]);
    expect(html).toContain('Voice note');
  });

  it('the open conversation is marked current (6d rail)', () => {
    const html = render([item()], 'c1');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('xidig-dm-row--active');
  });

  it('rows lead with an avatar — initials disc when the participant has no photo', () => {
    const html = render([item()]);
    expect(html).toContain('xidig-avatar--initials');
    expect(html).toContain('HC');
    expect(html).toContain('Hodan Cabdi');
  });
});

describe('MessagesInbox — 6c empty', () => {
  it('the empty inbox is a warm fact with one route out (the Plaza) and the consent footnote', () => {
    const html = render([]);
    expect(html).toContain('No messages yet');
    expect(html).toContain('href="/plaza"');
    expect(html).toContain('Open the Plaza');
    expect(html).toContain('You decide who you talk to.');
  });
});
