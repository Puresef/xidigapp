import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { emitServer } from '@/lib/analytics/emit';
import { event } from '@/lib/analytics/events';
import { fetchLinkPage, profileUrlCandidates, resolveOwnLink } from '@/lib/aniga/link-verify';
import { checkLinkBack, sameVerifiableHost, type LinkBackFailure } from '@/lib/aniga/links';
import { requireUser } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * POST /api/me/profile/links/verify/check — run the link-back check.
 *
 * The server fetches the page and decides. There is no client-supplied verdict
 * to trust and no shape of request that can assert one: the body is a URL, the
 * nonce is read from the row the client cannot see, and `verification_status`
 * has no client write grant. That is acceptance A7 — the orange check exists
 * only where this handler put it.
 *
 * A page that doesn't link back yet is a 200 with `status: 'failed'`, not an
 * error. It is the ordinary outcome of checking before editing the page, and
 * the ladder UI shows `profile.linkVerifyFailed` for it.
 */

const postSchema = z.object({ url: z.string().trim().min(1).max(2048) }).strict();

/** Outbound fetch on member demand — tighter than the token issue limit. */
const CHECK_RATE = { max: 10, windowSeconds: 3600 };

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const input = postSchema.parse(await request.json());

    await enforceRateLimit(`linkcheck:${ctx.appUser.id}`, CHECK_RATE);

    const link = await resolveOwnLink(ctx, input.url);
    const admin = getSupabaseAdmin();

    const { data: meta, error: readError } = await admin
      .from('profile_link_meta')
      .select('verification_token')
      .eq('user_id', ctx.appUser.id)
      .eq('url_key', link.urlKey)
      .maybeSingle();
    if (readError) throw new Error(`link meta lookup failed: ${readError.message}`);
    // No row means the member never asked for a nonce, so there is nothing on
    // the page to find. Start at /verify.
    if (!meta) throw new ApiError('invalid_request', 400);

    const page = await fetchLinkPage(link.url);
    // A page we could not retrieve carries no link back, by definition. Naming
    // it 'no_link_back' keeps the fetch outcome out of the response, so the
    // route reports nothing about what the server can and cannot reach.
    let failure: LinkBackFailure | null = 'no_link_back';
    // A redirect may not launder the check onto a different host. The badge says
    // "this host links back to this profile"; if the fetch ended up somewhere
    // else, that sentence was never proved about the host the member claimed.
    // Reporting the reason plainly is safe here — the member supplied the URL
    // and owns the redirect, so it discloses nothing about server reachability.
    if (page && !sameVerifiableHost(link.url.toString(), page.finalUrl)) {
      failure = 'offsite_redirect';
    } else if (page) {
      for (const profileUrl of profileUrlCandidates(link.handle)) {
        const result = checkLinkBack(page.document, {
          profileUrl,
          pageUrl: page.finalUrl,
          token: meta.verification_token,
        });
        if (result.verified) {
          failure = null;
          break;
        }
        // Keep the most specific reason: "the link is there, the code isn't"
        // is actionable, "no link back" is the fallback.
        if (result.reason === 'token_missing') failure = 'token_missing';
      }
    }

    const checkedAt = new Date().toISOString();
    const verified = failure === null;
    const { error: writeError } = await admin
      .from('profile_link_meta')
      .update({
        verification_status: verified ? 'verified' : 'failed',
        // The DB CHECK ties these together: verified iff verified_at is set.
        verified_at: verified ? checkedAt : null,
        verification_checked_at: checkedAt,
        updated_at: checkedAt,
      })
      .eq('user_id', ctx.appUser.id)
      .eq('url_key', link.urlKey);
    if (writeError) throw new Error(`link verification save failed: ${writeError.message}`);

    if (verified) {
      emitServer(event('profile_link_verified', {}), {
        distinctId: ctx.appUser.id,
        userId: ctx.appUser.id,
      });
    }

    return apiOk({
      urlKey: link.urlKey,
      status: verified ? ('verified' as const) : ('failed' as const),
      checkedAt,
      ...(failure ? { reason: failure } : {}),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
