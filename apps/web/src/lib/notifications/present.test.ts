import { describe, expect, it } from 'vitest';

import { createTranslator } from '@xidig/i18n';

import type { NotificationBundle } from './bundle';
import { bundleHref, bundleSummary } from './present';

/**
 * Presenter contract: one shared summary/permalink builder for every surface
 * that renders a notification bundle (full inbox page, header bell dropdown).
 */

const t = createTranslator('en');

function bundle(partial: Partial<NotificationBundle>): NotificationBundle {
  return {
    id: 'b1',
    type: 'reply',
    count: 1,
    actors: [{ userId: 'u1', displayName: 'Asha', handle: 'asha' }],
    actorCount: 1,
    latestAt: '2026-07-18T00:00:00Z',
    unread: true,
    entityType: null,
    entityId: null,
    notificationIds: ['n1'],
    payload: null,
    ...partial,
  } as NotificationBundle;
}

describe('bundleSummary', () => {
  it('names the actor for a single reply and counts the rest for a bundle', () => {
    expect(bundleSummary(bundle({}), t)).toContain('Asha');
    const bundled = bundleSummary(bundle({ actorCount: 3 }), t);
    expect(bundled).toContain('Asha');
    expect(bundled).toContain('2');
  });

  it('falls back to the generic line for unknown types', () => {
    expect(bundleSummary(bundle({ type: 'something_new' as never }), t)).toBe(t('notif.generic'));
  });
});

describe('bundleHref', () => {
  it('maps entity types and payload fallbacks to permalinks', () => {
    expect(bundleHref(bundle({ entityType: 'conversation', entityId: 'c1' }))).toBe('/messages/c1');
    expect(bundleHref(bundle({ entityType: 'post', entityId: 'p1' }))).toBe('/p/p1');
    expect(bundleHref(bundle({ entityType: 'event', payload: { eventSlug: 'iftar' } }))).toBe(
      '/events/iftar',
    );
    expect(bundleHref(bundle({ payload: { postId: 'p9' } }))).toBe('/p/p9');
    expect(bundleHref(bundle({}))).toBeNull();
  });
});
