import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests exercise the module-level side effect of `src/env.ts`: importing
 * it validates `process.env` and throws immediately (fail-fast at boot) unless
 * `SKIP_ENV_VALIDATION` is set. `vi.resetModules()` forces the singleton to be
 * re-evaluated on each dynamic import.
 */
describe('env module boot behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws at import when validation is on and required vars are missing', async () => {
    // The shared vitest config sets SKIP_ENV_VALIDATION=true; turn it off here.
    vi.stubEnv('SKIP_ENV_VALIDATION', '');
    vi.resetModules();

    await expect(import('./env')).rejects.toThrow(/Invalid or missing environment variables/);
  });

  it('does not throw at import when SKIP_ENV_VALIDATION is set', async () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true');
    vi.resetModules();

    await expect(import('./env')).resolves.toHaveProperty('env');
  });
});
