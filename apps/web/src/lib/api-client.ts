import type { PlainError } from '@/lib/errors';

/**
 * Browser-side fetch helper for the app's API envelope:
 * success `{ data }`, failure `{ error: PlainError }` (§27 copy, already
 * resolved in the request locale — render `error.message`/`error.cta`
 * verbatim, never switch on codes for copy).
 */

export class ApiRequestError extends Error {
  constructor(public readonly plain: PlainError) {
    super(plain.message);
    this.name = 'ApiRequestError';
  }
}

interface Envelope<T> {
  data?: T;
  error?: PlainError;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  let body: Envelope<T>;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = {};
  }

  if (!res.ok || body.error) {
    throw new ApiRequestError(
      body.error ?? {
        // Offline/proxy failures never produced our envelope; the caller's
        // catch shows this fallback (§27 generic server copy comes from the
        // server when it CAN answer).
        code: 'server_error',
        message: '',
      },
    );
  }

  return body.data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });
}
