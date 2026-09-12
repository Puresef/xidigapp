import { NextResponse } from 'next/server';

import { apiError } from '@/lib/api';
import { env } from '@/env';

import { decideSeedTarget, type SeedTargetDecision } from './target-guard';

/**
 * The URLs this process builds Supabase clients from. The service client uses
 * SUPABASE_URL; the public URL must agree (the guard refuses a mismatch).
 */
export function configuredSupabaseUrls(): Array<string | undefined> {
  const e = env as { SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_URL?: string };
  return [e.SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_URL];
}

/** Decide against the configured target (fails closed when unconfigured). */
export function decideConfiguredSeedTarget(): SeedTargetDecision {
  return decideSeedTarget(configuredSupabaseUrls());
}

/**
 * A 403 for a refused seed target: the plain-language `forbidden` body plus an
 * operator-facing `seedTarget` {reason, detail} the CLI prints. It names the
 * refusal class only; it never echoes secrets.
 */
export async function seedTargetRefusedResponse(
  decision: Extract<SeedTargetDecision, { allowed: false }>,
): Promise<Response> {
  const base = await apiError('forbidden', 403);
  const body = (await base.json()) as Record<string, unknown>;
  console.error(`[seed] target refused (${decision.reason}): ${decision.detail}`);
  return NextResponse.json(
    { ...body, seedTarget: { reason: decision.reason, detail: decision.detail } },
    { status: 403 },
  );
}
