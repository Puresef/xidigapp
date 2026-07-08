import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireVerifier } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { applyModAction } from '@/lib/moderation/actions';
import {
  verificationDecisionSchema,
  verificationScheduleSchema,
} from '@/lib/moderation/schemas';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * §14 verifier action on one request: either SCHEDULE the video call (booking
 * link + slot) or DECIDE it (approve / decline / more_info). Approval awards the
 * §14 tier — identity_verified on the profile or `verified` on the business
 * listing, plus the matching badge — and records a `verify_user` mod_action for
 * the §19 ledger. Every branch notifies the member in plain language and writes
 * an immutable audit row. Verifier-gated; all writes are service role.
 */

const idSchema = z.string().uuid();

// Resolve a seeded badge slug → its UUID (user_badges.badge_id FKs
// badge_definitions.id, not the slug), tolerating a re-award race.
async function awardBadge(
  admin: ReturnType<typeof getSupabaseAdmin>,
  input: { userId: string; slug: string; context?: string | null; awardedBy: string },
): Promise<void> {
  const { data: badge, error: badgeError } = await admin
    .from('badge_definitions')
    .select('id')
    .eq('slug', input.slug)
    .maybeSingle();
  if (badgeError) throw new Error(`badge lookup failed: ${badgeError.message}`);
  if (!badge) return;

  const { error } = await admin.from('user_badges').insert({
    user_id: input.userId,
    badge_id: badge.id,
    context: input.context ?? null,
    awarded_by_user_id: input.awardedBy,
  });
  if (error && error.code !== '23505' && !/duplicate|unique/i.test(error.message)) {
    throw new Error(`badge award failed: ${error.message}`);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const verifier = await requireVerifier();
    const parsedId = idSchema.safeParse((await context.params).id);
    if (!parsedId.success) throw new ApiError('not_found', 404);
    const id = parsedId.data;

    const raw = await request.json();
    if (typeof raw !== 'object' || raw === null) throw new ApiError('invalid_request', 400);
    const body = raw as Record<string, unknown>;
    const admin = getSupabaseAdmin();

    const { data: verification, error: loadError } = await admin
      .from('verifications')
      .select('id, user_id, type, status, listing_id')
      .eq('id', id)
      .maybeSingle();
    if (loadError) throw new Error(`verification load failed: ${loadError.message}`);
    if (!verification) throw new ApiError('not_found', 404);

    const now = new Date().toISOString();

    // --- SCHEDULE (booking link) ---------------------------------------------
    if ('bookingUrl' in body) {
      const input = verificationScheduleSchema.parse(body);
      const { error } = await admin
        .from('verifications')
        .update({
          booking_url: input.bookingUrl,
          scheduled_at: input.scheduledAt ?? now,
          status: 'scheduled',
          verifier_user_id: verifier.appUser.id,
        })
        .eq('id', id);
      if (error) throw new Error(`verification schedule failed: ${error.message}`);

      await insertNotification(admin, {
        userId: verification.user_id,
        type: 'verification_scheduled',
        entityType: 'verification',
        entityId: id,
        payload: { bookingUrl: input.bookingUrl },
      });

      await writeAudit(admin, {
        actorUserId: verifier.appUser.id,
        action: 'verification.scheduled',
        targetType: 'verification',
        targetId: id,
      });

      return apiOk({ verification: { id, status: 'scheduled' } });
    }

    // --- DECISION (approve / decline / more_info) ----------------------------
    const input = verificationDecisionSchema.parse(body);

    if (input.decision === 'approved') {
      const { error } = await admin
        .from('verifications')
        .update({
          status: 'approved',
          decided_at: now,
          verifier_user_id: verifier.appUser.id,
          decision_notes: input.notes ?? null,
        })
        .eq('id', id);
      if (error) throw new Error(`verification approve failed: ${error.message}`);

      if (verification.type === 'identity') {
        // Never downgrade an already-identity_verified member.
        const { error: profileError } = await admin
          .from('profiles')
          .update({ verification_status: 'identity_verified' })
          .eq('user_id', verification.user_id)
          .neq('verification_status', 'identity_verified');
        if (profileError) throw new Error(`profile award failed: ${profileError.message}`);

        await awardBadge(admin, {
          userId: verification.user_id,
          slug: 'identity-verified',
          awardedBy: verifier.appUser.id,
        });
      } else if (verification.type === 'business' && verification.listing_id) {
        const { error: listingError } = await admin
          .from('business_listings')
          .update({ verification_status: 'verified' })
          .eq('id', verification.listing_id);
        if (listingError) throw new Error(`listing award failed: ${listingError.message}`);

        await awardBadge(admin, {
          userId: verification.user_id,
          slug: 'verified-business',
          context: verification.listing_id,
          awardedBy: verifier.appUser.id,
        });
      }

      // §19 ledger: record the award as an attributable mod_action.
      await applyModAction(admin, {
        actorUserId: verifier.appUser.id,
        action: 'verify_user',
        targetType: 'user',
        targetId: verification.user_id,
        reason: input.notes ?? null,
      });

      await insertNotification(admin, {
        userId: verification.user_id,
        type: 'verification_approved',
        entityType: 'verification',
        entityId: id,
      });

      await writeAudit(admin, {
        actorUserId: verifier.appUser.id,
        action: 'verification.approved',
        targetType: 'verification',
        targetId: id,
        metadata: { type: verification.type, listingId: verification.listing_id ?? null },
      });

      return apiOk({ verification: { id, status: 'approved' } });
    }

    if (input.decision === 'declined') {
      const { error } = await admin
        .from('verifications')
        .update({
          status: 'rejected',
          decided_at: now,
          verifier_user_id: verifier.appUser.id,
          decision_notes: input.notes ?? null,
        })
        .eq('id', id);
      if (error) throw new Error(`verification decline failed: ${error.message}`);

      // Clear the "pending" trust marker back to unverified (only if it's still
      // pending — a member with an independent community badge keeps it).
      const { error: profileError } = await admin
        .from('profiles')
        .update({ verification_status: 'unverified' })
        .eq('user_id', verification.user_id)
        .eq('verification_status', 'pending');
      if (profileError) throw new Error(`profile reset failed: ${profileError.message}`);

      await insertNotification(admin, {
        userId: verification.user_id,
        type: 'verification_declined',
        entityType: 'verification',
        entityId: id,
      });

      await writeAudit(admin, {
        actorUserId: verifier.appUser.id,
        action: 'verification.declined',
        targetType: 'verification',
        targetId: id,
      });

      return apiOk({ verification: { id, status: 'rejected' } });
    }

    // more_info — keep the request open, record the ask, notify the member.
    const { error } = await admin
      .from('verifications')
      .update({
        info_requested_at: now,
        verifier_user_id: verifier.appUser.id,
        decision_notes: input.notes ?? null,
      })
      .eq('id', id);
    if (error) throw new Error(`verification more_info failed: ${error.message}`);

    await insertNotification(admin, {
      userId: verification.user_id,
      type: 'verification_more_info',
      entityType: 'verification',
      entityId: id,
    });

    await writeAudit(admin, {
      actorUserId: verifier.appUser.id,
      action: 'verification.more_info',
      targetType: 'verification',
      targetId: id,
    });

    return apiOk({ verification: { id, status: verification.status } });
  } catch (error) {
    return handleApiError(error);
  }
}
