import { describe, expect, it } from 'vitest';

import { createTranslator } from '@xidig/i18n';

import type { NotificationBundle } from './bundle';
import { bundleExtras, bundleHref, bundleSummary } from './present';

/**
 * Presenter contract: one shared summary/permalink builder for every surface
 * that renders a notification bundle (full inbox page, header bell dropdown).
 */

const t = createTranslator('en');
const tSo = createTranslator('so');

// Task 4's send-time snapshot payload — the fixture instant/timezone match
// events/datetime.test.ts exactly (2026-08-15T13:00 UTC in Europe/London =
// Saturday 14:00 local), so the SO weekday/time in the meta line is the same
// "Sabti 14:00" the design frame (e7) specifies.
const reminderPayload = {
  eventSlug: 'shir-madasha-london',
  title: 'Shir-madasha Xidig London',
  startsAt: '2026-08-15T13:00:00Z',
  timezone: 'Europe/London',
  going: 14,
  capacity: 30,
  status: 'going',
};

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

  it('interpolates the event title into the SO reminder line', () => {
    expect(
      bundleSummary(bundle({ type: 'event_reminder', payload: reminderPayload }), tSo),
    ).toBe('3 maalmood ka hor: Shir-madasha Xidig London');
  });

  it('falls back to the generic line for a legacy reminder payload missing a title', () => {
    expect(
      bundleSummary(bundle({ type: 'event_reminder', payload: { eventSlug: 'old-event' } }), t),
    ).toBe(t('notif.generic'));
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

describe('bundleExtras', () => {
  it('returns null meta and no actions for every non-event_reminder type', () => {
    expect(bundleExtras(bundle({}), t)).toEqual({ meta: null, actions: [] });
    expect(bundleExtras(bundle({ type: 'event_rsvp' }), t)).toEqual({ meta: null, actions: [] });
  });

  it('builds the going meta line + view/unrsvp actions for a full reminder payload', () => {
    const extras = bundleExtras(bundle({ type: 'event_reminder', payload: reminderPayload }), tSo);

    expect(extras.meta).toContain('Sabti 14:00');
    expect(extras.meta).toContain('waad xaqiijisay');
    expect(extras.meta).toContain('14/30');
    expect(extras.actions).toEqual([
      { labelKey: 'action.view', href: '/events/shir-madasha-london' },
      { labelKey: 'events.reminderCancelRsvp', kind: 'unrsvp', eventSlug: 'shir-madasha-london' },
    ]);
  });

  it('uses the interested meta key when the payload status is interested', () => {
    const extras = bundleExtras(
      bundle({
        type: 'event_reminder',
        payload: { ...reminderPayload, status: 'interested' },
      }),
      tSo,
    );

    expect(extras.meta).toContain('xiise ayaad calaamadisay');
    expect(extras.meta).toContain('14/30');
  });

  it('uses the no-capacity meta key when the event has no capacity cap', () => {
    const extras = bundleExtras(
      bundle({
        type: 'event_reminder',
        payload: { ...reminderPayload, capacity: null },
      }),
      tSo,
    );

    expect(extras.meta).toContain('waad xaqiijisay');
    expect(extras.meta).toContain('14 la xaqiijiyay');
    expect(extras.meta).not.toContain('/30');
  });

  it('uses the interested no-capacity meta key when status is interested and no capacity cap', () => {
    const extras = bundleExtras(
      bundle({
        type: 'event_reminder',
        payload: { ...reminderPayload, status: 'interested', capacity: null },
      }),
      tSo,
    );

    expect(extras.meta).toContain('xiise ayaad calaamadisay');
    expect(extras.meta).toContain('14 la xaqiijiyay');
    expect(extras.meta).not.toContain('/30');
  });

  it('degrades to no meta and no actions for a legacy reminder payload missing a title', () => {
    expect(
      bundleExtras(bundle({ type: 'event_reminder', payload: { eventSlug: 'old-event' } }), t),
    ).toEqual({ meta: null, actions: [] });
  });
});
