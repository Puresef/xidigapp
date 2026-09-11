import { z } from 'zod';

import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireVerifier } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { applyModAction } from '@/lib/moderation/actions';
import { verificationDecisionSchema, verificationScheduleSchema } from '@/lib/moderation/schemas';
import { loadSubjectStatus } from '@/lib/lifecycle/subject';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * §14 verifier action on one request: either SCHEDULE the video call (booking
 * link + slot) or DECIDE it (approve / decline / more_info). Approval awards the
 * §14 tier — identity_verified on the profile or `verified` on the business
 * listing, plus the matching badge — and records a `verify_user` mod_action for
 * the §19 ledger. Every branch notifies the member in plain language and writes
 * an immutable audit row. Verifier-gated; all writes are service role.
 *
 * Deleted members. A request can sit in the queue while its member is
 * anonymised. Before ANY write, the subject's status is read (service role);
 * a deleted subject gets 409 `account_deleted` and nothing is approved,
 * declined, scheduled, awarded or notified. An OPEN request is closed as
 * 'cancelled' — guarded on its status, so a final decision is never
 * overwritten — with an audit row carrying who closed it, why, and what was
 * attempted. The input is validated first, so a malformed request never
 * closes anything.
 */

const idSchema = z.string().uuid();

const OPEN_STATUSES = ['pending', 'scheduled'] as const;

type Admin = ReturnType<typeof getSupabaseAdmin>;

async function closeForDeletedSubject(
  admin: Admin,
  input: {
    verifierId: string;
    verification: { id: string; status: string };
    attempted: 'schedule' | 'approved' | 'declined' | 'more_info';
  },
): Promise<void> {
  const { verification } = input;
  if (!(OPEN_STATUSES as readonly string[]).includes(verification.status)) return;

  const { data, error } = await admin
    .from('verifications')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', verification.id)
    .in('status', [...OPEN_STATUSES])
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`verification close failed: ${error.message}`);
  // Someone else finalised it between our read and this write: leave it be.
  if (!data) return;

  await writeAudit(admin, {
    actorUserId: input.verifierId,
    action: 'verification.closed_subject_deleted',
    targetType: 'verification',
    targetId: verification.id,
    metadata: {
      reason: 'subject_deleted',
      priorStatus: verification.status,
      attempted: input.attempted,
    },
  });
}

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

    // Validate first: a malformed request must not reach the lifecycle step.
    const scheduleInput = 'bookingUrl' in body ? verificationScheduleSchema.parse(body) : null;
    const decisionInput = scheduleInput ? null : verificationDecisionSchema.parse(body);

    // Subject lifecycle, before any write.
    const subjectStatus = await loadSubjectStatus(admin, verification.user_id);
    if (subjectStatus === null) throw new ApiError('not_found', 404);
    if (subjectStatus === 'deleted') {
      await closeForDeletedSubject(admin, {
        verifierId: verifier.appUser.id,
        verification,
        attempted: scheduleInput ? 'schedule' : decisionInput!.decision,
      });
      throw new ApiError('account_deleted', 409);
    }

    // --- SCHEDULE (booking link) ---------------------------------------------
    if (scheduleInput) {
      const input = scheduleInput;
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
    const input = decisionInput!;

    if (input.decision === 'approved') {
      // Exhaustiveness guard BEFORE any state is written. The award effects
      // below enumerate verification types and there is NO transaction — an
      // unhandled type (the enum grows by migration; if/else-if has no
      // compile-time exhaustiveness) must 500 here, not record an approved
      // status + mod action + notification with zero credential effect.
      if (verification.type !== 'identity' && verification.type !== 'business') {
        throw new Error(`unhandled verification type: ${String(verification.type)}`);
      }

      // Credential effect FIRST, then the request's status. The profile write
      // is the one the freeze trigger guards, so a member anonymised after the
      // lifecycle check above is refused THERE (→ 409 account_deleted via
      // handleApiError) before this request ever reads 'approved'. A later
      // failure leaves the credential awarded and the request open; retrying
      // completes it (both writes are idempotent).
      if (verification.type === 'identity') {
        // Never downgrade an already-identity_verified member.
        const { error: profileError } = await admin
          .from('profiles')
          .update({ verification_status: 'identity_verified' })
          .eq('user_id', verification.user_id)
          .neq('verification_status', 'identity_verified');
        if (profileError) throw new Error(`profile award failed: ${profileError.message}`);
      } else if (verification.type === 'business' && verification.listing_id) {
        // verified_at is the denormalized "Checked: {date}" the §18 explainer
        // shows — stamped with the same decision timestamp written to
        // verifications.decided_at below. The DB-side sync trigger
        // (20260731000000) is the backstop: any OTHER transition out of
        // 'verified' (a future revoke flow, moderation, manual correction)
        // nulls it, and a transition in that forgot to stamp gets now().
        const { error: listingError } = await admin
          .from('business_listings')
          .update({ verification_status: 'verified', verified_at: now })
          .eq('id', verification.listing_id);
        if (listingError) throw new Error(`listing award failed: ${listingError.message}`);
      }

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
        await awardBadge(admin, {
          userId: verification.user_id,
          slug: 'identity-verified',
          awardedBy: verifier.appUser.id,
        });
      } else if (verification.type === 'business' && verification.listing_id) {
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
