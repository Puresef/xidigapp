import { describe, expect, it } from 'vitest';

import { parseEnv } from './env';

const validEnv: Record<string, string> = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  SUPABASE_SECRET_KEY: 'secret-key',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
  EMAIL_API_KEY: 'email-key',
  MAPTILER_KEY: 'maptiler-key',
  MEILISEARCH_HOST: 'https://search.example.com',
  MEILISEARCH_API_KEY: 'meili-key',
  POSTHOG_KEY: 'ph-key',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.com',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  SENTRY_DSN: 'https://abc@sentry.example.com/1',
  NEXT_PUBLIC_SENTRY_DSN: 'https://abc@sentry.example.com/1',
  AI_API_KEY: 'ai-key',
};

describe('env validation', () => {
  it('accepts a complete environment and applies defaults', () => {
    const parsed = parseEnv(validEnv);
    expect(parsed.SUPABASE_URL).toBe('https://project.supabase.co');
    // Defaults for optional keys are filled in.
    expect(parsed.POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });

  it('throws a single descriptive error when everything is missing', () => {
    expect(() => parseEnv({})).toThrowError(/Invalid or missing environment variables/);
  });

  it('names the offending key in the error message', () => {
    const missingUrl: Record<string, string> = { ...validEnv };
    delete missingUrl.SUPABASE_URL;
    expect(() => parseEnv(missingUrl)).toThrowError(/SUPABASE_URL/);
  });

  it('rejects a malformed URL', () => {
    const badUrl: Record<string, string> = { ...validEnv, SUPABASE_URL: 'not-a-url' };
    expect(() => parseEnv(badUrl)).toThrowError(/SUPABASE_URL/);
  });
});
