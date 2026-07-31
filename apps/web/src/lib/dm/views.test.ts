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
