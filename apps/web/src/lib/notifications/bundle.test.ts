import { describe, expect, it } from 'vitest';

import { bundleNotifications, type RawNotification } from './bundle';

function n(partial: Partial<RawNotification> & Pick<RawNotification, 'id' | 'type'>): RawNotification {
  return {
    actorUserId: null,
    entityType: null,
    entityId: null,
    bundleKey: null,
    readAt: null,
    createdAt: '2026-07-06T00:00:00.000Z',
    payload: {},
    actor: null,
    ...partial,
  };
}

describe('bundleNotifications', () => {
  it('collapses same-type same-bundleKey notifications into one bundle with a count', () => {
    const rows = [
      n({ id: '3', type: 'reply', bundleKey: 'reply:post1', actorUserId: 'c', actor: { handle: 'c', displayName: 'Caro' }, createdAt: '2026-07-06T03:00:00Z' }),
      n({ id: '2', type: 'reply', bundleKey: 'reply:post1', actorUserId: 'b', actor: { handle: 'b', displayName: 'Bilal' }, createdAt: '2026-07-06T02:00:00Z' }),
      n({ id: '1', type: 'reply', bundleKey: 'reply:post1', actorUserId: 'a', actor: { handle: 'a', displayName: 'Amina' }, createdAt: '2026-07-06T01:00:00Z' }),
    ];
    const bundles = bundleNotifications(rows);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.count).toBe(3);
    expect(bundles[0]!.actorCount).toBe(3);
    expect(bundles[0]!.notificationIds).toEqual(['3', '2', '1']);
    expect(bundles[0]!.latestAt).toBe('2026-07-06T03:00:00Z');
  });

  it('keeps different bundleKeys separate', () => {
    const rows = [
      n({ id: '2', type: 'reply', bundleKey: 'reply:post2' }),
      n({ id: '1', type: 'reply', bundleKey: 'reply:post1' }),
    ];
    expect(bundleNotifications(rows)).toHaveLength(2);
  });

  it('never bundles null-bundleKey notifications (each stands alone)', () => {
    const rows = [
      n({ id: '2', type: 'dm_request', bundleKey: null }),
      n({ id: '1', type: 'dm_request', bundleKey: null }),
    ];
    const bundles = bundleNotifications(rows);
    expect(bundles).toHaveLength(2);
    expect(bundles.every((b) => b.count === 1)).toBe(true);
  });

  it('does not bundle across different types even with the same key', () => {
    const rows = [
      n({ id: '2', type: 'mention', bundleKey: 'x' }),
      n({ id: '1', type: 'reply', bundleKey: 'x' }),
    ];
    expect(bundleNotifications(rows)).toHaveLength(2);
  });

  it('marks a bundle unread if ANY member is unread', () => {
    const rows = [
      n({ id: '2', type: 'new_dm', bundleKey: 'dm:conv1', readAt: '2026-07-06T05:00:00Z' }),
      n({ id: '1', type: 'new_dm', bundleKey: 'dm:conv1', readAt: null }),
    ];
    const [bundle] = bundleNotifications(rows);
    expect(bundle!.unread).toBe(true);
  });

  it('dedupes actors and caps the displayed actors at 3 while keeping the true count', () => {
    const rows = ['e', 'd', 'c', 'b', 'a'].map((who, i) =>
      n({
        id: String(i),
        type: 'reply',
        bundleKey: 'reply:post1',
        actorUserId: who,
        actor: { handle: who, displayName: who.toUpperCase() },
        createdAt: `2026-07-06T0${5 - i}:00:00Z`,
      }),
    );
    // add a duplicate actor
    rows.push(n({ id: '9', type: 'reply', bundleKey: 'reply:post1', actorUserId: 'a', actor: { handle: 'a', displayName: 'A' } }));
    const [bundle] = bundleNotifications(rows);
    expect(bundle!.actorCount).toBe(5);
    expect(bundle!.actors).toHaveLength(3);
  });

  it('preserves newest-first bundle order by first appearance', () => {
    const rows = [
      n({ id: '3', type: 'mention', bundleKey: 'm3', createdAt: '2026-07-06T03:00:00Z' }),
      n({ id: '2', type: 'new_dm', bundleKey: 'dm:2', createdAt: '2026-07-06T02:00:00Z' }),
      n({ id: '1', type: 'reply', bundleKey: 'reply:1', createdAt: '2026-07-06T01:00:00Z' }),
    ];
    expect(bundleNotifications(rows).map((b) => b.type)).toEqual(['mention', 'new_dm', 'reply']);
  });
});
