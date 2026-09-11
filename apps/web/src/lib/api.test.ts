import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/locale', () => ({ getT: async () => (key: string) => key }));

import * as Sentry from '@sentry/nextjs';

import { ApiError, handleApiError } from './api';

/**
 * handleApiError: the profile freeze trigger (tg_profiles_freeze_deleted,
 * 20260911000100) raises P0001 `profile_frozen: account <uuid> is anonymised`
 * when any writer races an anonymisation. That is an expected lifecycle
 * conflict, not a server fault: it must answer 409 `account_deleted`, must
 * not page Sentry, and must never echo the message (it carries the account
 * id).
 */

const FROZEN =
  'profile_frozen: account 0b5c1e4e-6d0a-4a39-9d51-2d6f3c7e9a10 is anonymised; its profile cannot be updated';

afterEach(() => {
  vi.restoreAllMocks();
});

async function bodyOf(response: Response) {
  return (await response.json()) as { error: { code: string; message: string } };
}

describe('handleApiError — lifecycle freeze conflicts', () => {
  it('maps a route-wrapped freeze error to 409 account_deleted', async () => {
    const error = new Error(`profile award failed: ${FROZEN}`);
    const response = await handleApiError(error);
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error.code).toBe('account_deleted');
  });

  it('maps a raw PostgREST freeze error object (code P0001) the same way', async () => {
    const response = await handleApiError({
      code: 'P0001',
      message: FROZEN,
      details: null,
      hint: null,
    });
    expect(response.status).toBe(409);
    expect((await bodyOf(response)).error.code).toBe('account_deleted');
  });

  it('does not page Sentry or log the message (it names the account)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await handleApiError(new Error(`profile save failed: ${FROZEN}`));
    expect(vi.mocked(Sentry.captureException)).not.toHaveBeenCalled();
    const logged = JSON.stringify([log.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain('0b5c1e4e');
    expect(JSON.stringify(await bodyOf(response))).not.toContain('0b5c1e4e');
  });

  it('leaves every other failure as it was', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleApiError(new Error('profile save failed: connection reset'))).status).toBe(
      500,
    );
    expect((await handleApiError({ code: 'P0001', message: 'some other raise' })).status).toBe(500);
    expect((await handleApiError(new ApiError('not_found', 404))).status).toBe(404);
  });
});
