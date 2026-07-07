import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModerationProvider } from './provider';
import { getModerationProvider, parseVerdict, resetModerationProviderForTests } from './provider';

// Keep the fail-open paths quiet and side-effect free under test.
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

/**
 * §15/§24 AI pre-scan. parseVerdict() must survive a sloppy model (fences,
 * prose, junk fields); provider selection mirrors EMAIL_PROVIDER ('auto' =
 * console outside production); AnthropicProvider is fail-open — every failure
 * mode resolves to 'skipped', never a throw.
 *
 * Env note (verified empirically): under vitest SKIP_ENV_VALIDATION=true and
 * the full schema does not validate, so `env` in provider.ts is the LIVE
 * process.env object — vi.stubEnv + resetModerationProviderForTests() is
 * enough to re-select the provider.
 */

describe('parseVerdict', () => {
  it('parses a clean minified verdict and stamps the model', () => {
    const verdict = parseVerdict(
      '{"decision":"allow","language":"so","categories":["spam"],"confidence":0.9}',
    );
    expect(verdict).not.toBeNull();
    expect(verdict?.decision).toBe('allow');
    expect(verdict?.language).toBe('so');
    expect(verdict?.categories).toEqual(['spam']);
    expect(verdict?.confidence).toBe(0.9);
    expect(typeof verdict?.model).toBe('string');
    expect(verdict?.model?.length).toBeGreaterThan(0);
  });

  it('tolerates code fences around the JSON', () => {
    const verdict = parseVerdict('```json\n{"decision":"flag","language":"en"}\n```');
    expect(verdict?.decision).toBe('flag');
    expect(verdict?.language).toBe('en');
  });

  it('tolerates prose around the JSON', () => {
    const verdict = parseVerdict(
      'Sure — here is the verdict: {"decision":"uncertain","language":"so"} — done.',
    );
    expect(verdict?.decision).toBe('uncertain');
  });

  it('returns null when decision is missing or invalid', () => {
    expect(parseVerdict('{"language":"so"}')).toBeNull();
    expect(parseVerdict('{"decision":"maybe"}')).toBeNull();
    // 'skipped' is an internal state, never a valid model answer.
    expect(parseVerdict('{"decision":"skipped"}')).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    expect(parseVerdict('no braces here')).toBeNull();
    expect(parseVerdict('{broken')).toBeNull();
    expect(parseVerdict('}{')).toBeNull();
  });

  it('drops unknown languages', () => {
    const verdict = parseVerdict('{"decision":"allow","language":"fr"}');
    expect(verdict?.decision).toBe('allow');
    expect(verdict?.language).toBeUndefined();
  });

  it('clamps confidence to [0,1] and drops non-finite/non-number values', () => {
    expect(parseVerdict('{"decision":"allow","confidence":4}')?.confidence).toBe(1);
    expect(parseVerdict('{"decision":"allow","confidence":-2}')?.confidence).toBe(0);
    expect(parseVerdict('{"decision":"allow","confidence":1e999}')?.confidence).toBeUndefined();
    expect(parseVerdict('{"decision":"allow","confidence":"high"}')?.confidence).toBeUndefined();
  });

  it('filters non-string categories and caps the list at 8', () => {
    expect(
      parseVerdict('{"decision":"flag","categories":["scam",1,null,"spam",{}]}')?.categories,
    ).toEqual(['scam', 'spam']);
    const many = JSON.stringify({
      decision: 'flag',
      categories: Array.from({ length: 12 }, (_, i) => `c${i}`),
    });
    expect(parseVerdict(many)?.categories).toHaveLength(8);
  });
});

describe('provider selection + AnthropicProvider (fetch stubbed)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetModerationProviderForTests();
  });

  function forceAnthropic(): ModerationProvider {
    vi.stubEnv('AI_MODERATION_PROVIDER', 'anthropic');
    vi.stubEnv('AI_API_KEY', 'test-api-key');
    resetModerationProviderForTests();
    return getModerationProvider();
  }

  it("'auto' outside production selects the console provider (skipped, no network)", async () => {
    vi.stubEnv('AI_MODERATION_PROVIDER', 'auto');
    vi.stubEnv('NODE_ENV', 'test');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    resetModerationProviderForTests();

    const provider = getModerationProvider();
    await expect(provider.scanText('salaan wanaagsan')).resolves.toEqual({ decision: 'skipped' });
    await expect(provider.scanImage(new Uint8Array([1, 2, 3]), 'image/webp')).resolves.toEqual({
      decision: 'skipped',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches the provider until the test seam resets it', () => {
    vi.stubEnv('AI_MODERATION_PROVIDER', 'console');
    resetModerationProviderForTests();
    const first = getModerationProvider();
    expect(getModerationProvider()).toBe(first);
    resetModerationProviderForTests();
    expect(getModerationProvider()).not.toBe(first);
  });

  it('parses an ok response into a verdict with the model set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: 'thinking' },
          {
            type: 'text',
            text: '{"decision":"flag","language":"so","categories":["scam"],"confidence":0.92}',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const verdict = await forceAnthropic().scanText('qoraal la hubinayo');
    expect(verdict.decision).toBe('flag');
    expect(verdict.language).toBe('so');
    expect(verdict.categories).toEqual(['scam']);
    expect(verdict.confidence).toBe(0.92);
    expect(typeof verdict.model).toBe('string');
    expect(verdict.model?.length).toBeGreaterThan(0);

    // Confirms the env override really selected AnthropicProvider.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-api-key');
    const body = JSON.parse(init.body) as {
      messages: { content: { type: string; text: string }[] }[];
    };
    expect(body.messages[0]?.content[0]?.text).toBe('qoraal la hubinayo');
  });

  it('resolves skipped on a non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const verdict = await forceAnthropic().scanText('x');
    expect(verdict.decision).toBe('skipped');
  });

  it('resolves skipped when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const verdict = await forceAnthropic().scanText('x');
    expect(verdict.decision).toBe('skipped');
  });

  it('resolves skipped when the model returns unparseable content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ content: [{ type: 'text', text: 'I cannot classify that.' }] }),
      }),
    );
    const verdict = await forceAnthropic().scanText('x');
    expect(verdict.decision).toBe('skipped');
  });
});
