import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';

/**
 * AI moderation pre-scan (§15, §24): posts, comments and uploaded images run
 * through a provider before/at publish. The pipeline is deliberately
 * FAIL-OPEN — a provider outage must not silence the Plaza — so any error
 * resolves to 'skipped'. What the AI can't judge confidently comes back
 * 'uncertain' and lands in the human review queue (Somali-language cases are
 * the primary lane, per the Phase 2 build brief).
 *
 * Provider selection mirrors lib/email/provider.ts: 'auto' = anthropic in
 * production, console (log + skip) in development.
 */

export type ModerationDecision = 'allow' | 'flag' | 'uncertain' | 'skipped';

export interface ModerationVerdict {
  decision: ModerationDecision;
  /** Language guess for HITL queue routing ('so' | 'en' | 'other'). */
  language?: 'so' | 'en' | 'other';
  categories?: string[];
  confidence?: number;
  model?: string;
}

export interface ModerationProvider {
  scanText(text: string): Promise<ModerationVerdict>;
  scanImage(bytes: Uint8Array, mimeType: string): Promise<ModerationVerdict>;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 8_000;

const SYSTEM_PROMPT = [
  'You are the content-moderation pre-filter for Xidig, a members platform where Somali builders',
  'post in Somali and English. Classify ONE piece of member content.',
  'Respond with ONLY minified JSON, no prose, no code fences:',
  '{"decision":"allow|flag|uncertain","language":"so|en|other","categories":["..."],"confidence":0.0}',
  'decision=flag ONLY for unmistakable violations: sexual content involving minors, credible threats',
  'or incitement to violence, targeted hate or harassment, scams/fraud, doxxing (dumping private',
  'contact/ID data of others), or bulk spam. decision=allow for ordinary community content:',
  'asking for help, business and commerce talk, wins, greetings, religious expressions.',
  'decision=uncertain when you cannot judge confidently — for Somali-language content ALWAYS prefer',
  'uncertain over flag unless the violation is unmistakable; a Somali-speaking human reviews',
  'uncertain items. Never flag ordinary commerce, religion, or political discussion.',
  'language is the dominant language of the content itself.',
].join(' ');

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

/** Exported for unit tests. */
export function parseVerdict(raw: string): ModerationVerdict | null {
  // Tolerate accidental fences/prose around the JSON object.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const decision = obj.decision;
  if (decision !== 'allow' && decision !== 'flag' && decision !== 'uncertain') return null;

  const verdict: ModerationVerdict = { decision, model: MODEL };
  if (obj.language === 'so' || obj.language === 'en' || obj.language === 'other') {
    verdict.language = obj.language;
  }
  if (Array.isArray(obj.categories)) {
    verdict.categories = obj.categories.filter((c): c is string => typeof c === 'string').slice(0, 8);
  }
  if (typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)) {
    verdict.confidence = Math.max(0, Math.min(1, obj.confidence));
  }
  return verdict;
}

class AnthropicProvider implements ModerationProvider {
  constructor(private readonly apiKey: string) {}

  private async scan(content: unknown): Promise<ModerationVerdict> {
    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`moderation API responded ${response.status}`);
      }

      const body = (await response.json()) as { content?: AnthropicContentBlock[] };
      const text = (body.content ?? []).find((block) => block.type === 'text')?.text ?? '';
      const verdict = parseVerdict(text);
      if (!verdict) throw new Error('moderation verdict was not parseable JSON');
      return verdict;
    } catch (error) {
      // Fail-open by design: never block publishing on a scanner outage.
      console.error('[moderation] scan failed, skipping:', error);
      Sentry.captureException(error);
      return { decision: 'skipped', model: MODEL };
    }
  }

  scanText(text: string): Promise<ModerationVerdict> {
    // Cap what we send: the first 4k chars decide moderation outcomes.
    return this.scan([{ type: 'text', text: text.slice(0, 4_000) }]);
  }

  scanImage(bytes: Uint8Array, mimeType: string): Promise<ModerationVerdict> {
    return this.scan([
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: Buffer.from(bytes).toString('base64'),
        },
      },
      { type: 'text', text: 'Classify this image per the system instructions.' },
    ]);
  }
}

class ConsoleProvider implements ModerationProvider {
  scanText(text: string): Promise<ModerationVerdict> {
    console.warn(`[moderation:console] text scan skipped (${text.length} chars)`);
    return Promise.resolve({ decision: 'skipped' });
  }

  scanImage(bytes: Uint8Array): Promise<ModerationVerdict> {
    console.warn(`[moderation:console] image scan skipped (${bytes.byteLength} bytes)`);
    return Promise.resolve({ decision: 'skipped' });
  }
}

let cachedProvider: ModerationProvider | null = null;

export function getModerationProvider(): ModerationProvider {
  if (cachedProvider) return cachedProvider;

  // typeof-guards: modules loaded under SKIP_ENV_VALIDATION may see raw env.
  const mode = typeof env.AI_MODERATION_PROVIDER === 'string' ? env.AI_MODERATION_PROVIDER : 'auto';
  const apiKey = typeof env.AI_API_KEY === 'string' ? env.AI_API_KEY : '';
  const production = env.NODE_ENV === 'production';

  const useAnthropic = mode === 'anthropic' || (mode === 'auto' && production);
  cachedProvider = useAnthropic && apiKey ? new AnthropicProvider(apiKey) : new ConsoleProvider();
  return cachedProvider;
}

/** Test seam. */
export function resetModerationProviderForTests(): void {
  cachedProvider = null;
}
