import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import {
  ERROR_DEFS,
  NOTICE_KEYS,
  resolveError,
  type ErrorCode,
  type NoticeCode,
  type PlainError,
} from '@/lib/errors';
import { getT } from '@/lib/locale';

/**
 * API response envelope (API-first, §22). Success: `{ data }`. Failure:
 * `{ error: { code, message, cta? } }` where message/cta are §27
 * plain-language copy resolved in the request locale — clients render them
 * verbatim, never raw codes.
 */

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
  ) {
    super(ERROR_DEFS[code].messageKey);
    this.name = 'ApiError';
  }
}

export interface ApiErrorBody {
  error: PlainError;
}

export async function apiError(
  code: ErrorCode,
  status: number,
): Promise<NextResponse<ApiErrorBody>> {
  const t = await getT();
  return NextResponse.json({ error: resolveError(code, t) }, { status });
}

export function apiOk<T>(data: T, status = 200): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, { status });
}

/** Success-with-message helper: `{ data: { notice, message } }`. */
export async function apiNotice(
  notice: NoticeCode,
  extra: Record<string, unknown> = {},
): Promise<NextResponse<{ data: Record<string, unknown> }>> {
  const t = await getT();
  return NextResponse.json({ data: { notice, message: t(NOTICE_KEYS[notice]), ...extra } });
}

/**
 * The profile freeze trigger (tg_profiles_freeze_deleted, 20260911000100)
 * refuses any write to an anonymised account's profile with P0001
 * `profile_frozen: …`. Routes usually re-throw a PostgREST failure wrapped in
 * an Error whose message embeds the original, so both shapes are recognised.
 * The trigger stays a hard invariant; this only turns its refusal — which a
 * writer racing an anonymisation can legitimately hit — into an explicit
 * conflict instead of an accidental 500.
 */
function isProfileFrozen(error: unknown): boolean {
  if (error instanceof Error) return error.message.includes('profile_frozen:');
  if (typeof error === 'object' && error !== null) {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return code === 'P0001' && typeof message === 'string' && message.startsWith('profile_frozen:');
  }
  return false;
}

/**
 * Uniform catch-all for route handlers: expected failures (ApiError) map to
 * their §27 copy, validation noise maps to invalid_request, a lifecycle freeze
 * conflict maps to account_deleted, everything else is a 500 that pages us
 * (Sentry) and tells the user we already know.
 */
export async function handleApiError(error: unknown): Promise<NextResponse<ApiErrorBody>> {
  if (error instanceof ApiError) {
    return apiError(error.code, error.status);
  }
  if (error instanceof ZodError) {
    return apiError('invalid_request', 400);
  }
  if (isProfileFrozen(error)) {
    // Expected, not a fault: no Sentry page, and never the message — it
    // names the anonymised account.
    return apiError('account_deleted', 409);
  }
  console.error('[api] unhandled error:', error);
  Sentry.captureException(error);
  return apiError('server_error', 500);
}
