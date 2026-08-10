import { describe, expect, it } from 'vitest';

import { toParticipant, type ParticipantProfileRow } from './views';

/**
 * Participant hydration (Task 8 avatars): a profiles row maps onto the DM
 * Participant projection the inbox/thread render verbatim. The avatar rides
 * the same convention as Plaza bylines — `avatar_path` becomes the derived
 * THUMB public URL (<8KB by the 96px pipeline), never the full image, and a
 * missing path yields null so the UI falls back to the initials disc.
 */

function row(overrides: Partial<ParticipantProfileRow> = {}): ParticipantProfileRow {
  return {
    user_id: 'u1',
    handle: 'ayaan',
    display_name: 'Ayaan Warsame',
    verification_status: 'unverified',
    avatar_path: null,
    avatar_blurhash: null,
    ...overrides,
  };
}

describe('toParticipant', () => {
  it('maps the identity fields verbatim', () => {
    const p = toParticipant(row());
    expect(p.userId).toBe('u1');
    expect(p.handle).toBe('ayaan');
    expect(p.displayName).toBe('Ayaan Warsame');
    expect(p.verificationStatus).toBe('unverified');
  });

  it('derives the public THUMB url from avatar_path (never the full image)', () => {
    const p = toParticipant(row({ avatar_path: 'u1/abc.webp' }));
    expect(p.avatarThumbUrl).toContain('/storage/v1/object/public/post-media/u1/abc_thumb.webp');
    expect(p.avatarThumbUrl).not.toContain('u1/abc.webp');
  });

  it('yields null (initials-disc fallback) when there is no avatar', () => {
    const p = toParticipant(row());
    expect(p.avatarThumbUrl).toBeNull();
    expect(p.avatarBlurhash).toBeNull();
  });

  it('passes the blurhash through for the tinted fallback disc', () => {
    const p = toParticipant(row({ avatar_blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }));
    expect(p.avatarBlurhash).toBe('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
  });
});

// ---------------------------------------------------------------------------
// f5 — silent decline. "The silence is the design": these two functions are
// the single presentation boundary; if either regresses, the sender learns
// they were declined and the consent grammar collapses.
// ---------------------------------------------------------------------------

import { presentConversationStatus, presentInboxRow } from './views';

function inboxRow(overrides: Record<string, unknown> = {}) {
  return {
    conversation_id: 'c1',
    other_user_id: 'u2',
    status: 'pending' as const,
    is_initiator: true,
    last_message_body: 'salaan',
    last_message_at: '2026-08-01T00:00:00Z',
    last_message_sender: 'u1',
    last_message_deleted: false,
    unread_count: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('presentInboxRow — f5 silent decline', () => {
  it('presents a declined request as PENDING to its initiator (indistinguishable)', () => {
    const declined = presentInboxRow(
      inboxRow({ status: 'declined', is_initiator: true }) as never,
    );
    const pending = presentInboxRow(inboxRow({ status: 'pending', is_initiator: true }) as never);
    expect(declined).not.toBeNull();
    expect(declined!.status).toBe('pending');
    // Structural indistinguishability: same row shape, same status.
    expect(declined).toEqual(pending);
  });

  it('drops the declined row entirely for the recipient who declined', () => {
    expect(presentInboxRow(inboxRow({ status: 'declined', is_initiator: false }) as never)).toBeNull();
  });

  it('passes every other status through untouched', () => {
    for (const status of ['pending', 'accepted'] as const) {
      const row = presentInboxRow(inboxRow({ status }) as never);
      expect(row!.status).toBe(status);
    }
  });
});

describe('presentConversationStatus — f5 for the thread header', () => {
  it('lies to the initiator only', () => {
    expect(presentConversationStatus('declined', true)).toBe('pending');
    expect(presentConversationStatus('declined', false)).toBe('declined');
  });

  it('never touches other statuses', () => {
    expect(presentConversationStatus('pending', true)).toBe('pending');
    expect(presentConversationStatus('accepted', true)).toBe('accepted');
    expect(presentConversationStatus('blocked', true)).toBe('blocked');
  });
});
