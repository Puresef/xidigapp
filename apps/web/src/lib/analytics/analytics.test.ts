import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLIENT_EVENT_NAMES, event, isClientEventName } from './events';
import { buildCapturePayload, captureServer, distinctIdFor, sanitizeProperties } from './server';

/**
 * The analytics taxonomy is a contract (§23): stable names, and NO PII in
 * payloads. These tests lock both — plus the fail-safe/disabled behaviour so
 * a capture can never break a request.
 *
 * POSTHOG_KEY is unset under the test env (SKIP_ENV_VALIDATION), so capture is
 * "disabled": the PII guard still runs, but no network call is made. That lets
 * us assert the guard and the no-network contract without mocking PostHog.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('event() + client whitelist', () => {
  it('constructs a typed event', () => {
    const e = event('follow_created', { target_type: 'user' });
    expect(e).toEqual({ name: 'follow_created', properties: { target_type: 'user' } });
  });

  it('recognises only the client-safe event names', () => {
    for (const name of CLIENT_EVENT_NAMES) {
      expect(isClientEventName(name)).toBe(true);
    }
    // Server-owned events are not client-forgeable.
    expect(isClientEventName('signup_completed')).toBe(false);
    expect(isClientEventName('badge_awarded')).toBe(false);
    expect(isClientEventName('nonsense')).toBe(false);
  });
});

describe('sanitizeProperties (no-PII guard, §23)', () => {
  it('keeps enums, counts, booleans and entity ids', () => {
    const { safe, dropped } = sanitizeProperties({
      category: 'finance',
      has_coordinates: true,
      skills_count: 4,
      listing_id: '11111111-1111-1111-1111-111111111111',
      note: null,
    });
    expect(dropped).toEqual([]);
    expect(safe).toEqual({
      category: 'finance',
      has_coordinates: true,
      skills_count: 4,
      listing_id: '11111111-1111-1111-1111-111111111111',
      note: null,
    });
  });

  it('drops PII-bearing keys', () => {
    const { safe, dropped } = sanitizeProperties({
      email: 'a@b.com',
      phone: '+252611234567',
      display_name: 'Maxamed',
      latitude: 2.04,
      longitude: 45.34,
      session_token: 'abc',
      category: 'retail',
    });
    expect(dropped.sort()).toEqual(
      ['display_name', 'email', 'latitude', 'longitude', 'phone', 'session_token'].sort(),
    );
    expect(safe).toEqual({ category: 'retail' });
  });

  it('drops values that look like an email even under a benign key', () => {
    const { safe, dropped } = sanitizeProperties({ ref: 'someone@example.com' });
    expect(dropped).toEqual(['ref']);
    expect(safe).toEqual({});
  });

  it('does not confuse `has_coordinates` (a boolean flag) for a coordinate', () => {
    const { safe, dropped } = sanitizeProperties({ has_coordinates: false });
    expect(dropped).toEqual([]);
    expect(safe).toEqual({ has_coordinates: false });
  });

  it('drops nested objects/arrays that could hide PII', () => {
    const { dropped } = sanitizeProperties({ nested: { email: 'x@y.com' }, list: [1, 2] });
    expect(dropped.sort()).toEqual(['list', 'nested']);
  });
});

describe('buildCapturePayload', () => {
  it('produces a PostHog-shaped body with $lib tag and distinct_id', () => {
    const payload = buildCapturePayload(
      event('listing_created', { category: 'agriculture', has_coordinates: true }),
      'user-123',
      '2026-07-05T00:00:00.000Z',
      { category: 'agriculture', has_coordinates: true },
    );
    expect(payload).toMatchObject({
      event: 'listing_created',
      distinct_id: 'user-123',
      timestamp: '2026-07-05T00:00:00.000Z',
      properties: { category: 'agriculture', has_coordinates: true, $lib: 'xidig-server' },
    });
  });
});

describe('captureServer', () => {
  it('throws in dev/test when a payload carries PII (caught before shipping)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(
      captureServer(
        // Deliberately smuggle PII past the types to prove the runtime guard.
        event('listing_view', { listing_id: 'x', email: 'a@b.com' } as never),
        { distinctId: 'user-1' },
      ),
    ).rejects.toThrow(/refused PII/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('is a no-op (no network) when POSTHOG_KEY is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await captureServer(event('map_view', {}), { distinctId: 'anonymous' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('distinctIdFor', () => {
  it('prefers the user id, falls back to anon id, then to "anonymous"', () => {
    expect(distinctIdFor('user-1', 'anon-1')).toBe('user-1');
    expect(distinctIdFor(null, 'anon-1')).toBe('anon-1');
    expect(distinctIdFor(undefined, undefined)).toBe('anonymous');
  });
});
