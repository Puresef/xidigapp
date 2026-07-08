import { ApiError, apiOk, handleApiError } from '@/lib/api';
import { requireUser } from '@/lib/auth/guards';
import { writeAudit } from '@/lib/audit';
import { COMMUNITY_VOUCH_THRESHOLD } from '@/lib/moderation/constants';
import { vouchSchema } from '@/lib/moderation/schemas';
import { insertNotification } from '@/lib/notifications/notify';
import { getSupabaseAdmin } from '@/lib/supabase/server';

/**
 * Community Verified vouching (§14). A member who is themselves verified
 * (community or identity) vouches for another. When a vouchee crosses
 * COMMUNITY_VOUCH_THRESHOLD from verified voucher(s) and is not already a
 * higher tier, they are auto-upgraded to `community_verified` with the badge +
 * an in-app notice. Idempotent: a repeat vouch (unique constraint) is a no-op
 * success. Writes are service role (`vouches`/`user_badges` have no client
 * write grant); the eligibility read uses the caller's own profile.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireUser();
    const { voucheeUserId } = vouchSchema.parse(await request.json());

    // No self-vouch (DB also enforces vouches_no_self).
    if (voucheeUserId === ctx.appUser.id) throw new ApiError('invalid_request', 400);

    const admin = getSupabaseAdmin();

    // Only a verified member may vouch (§14). Read the caller's own trust tier.
    const { data: voucher, error: voucherError } = await admin
      .from('profiles')
      .select('verification_status')
      .eq('user_id', ctx.appUser.id)
      .maybeSingle();
    if (voucherError) throw new Error(`voucher lookup failed: ${voucherError.message}`);
    if (
      !voucher ||
      (voucher.verification_status !== 'community_verified' &&
        voucher.verification_status !== 'identity_verified')
    ) {
      throw new ApiError('forbidden', 403);
    }

    // Insert the vouch; a duplicate (23505) is an idempotent success — we still
    // report the current count so a client always gets a truthful tally.
    const { error: vouchError } = await admin.from('vouches').insert({
      voucher_user_id: ctx.appUser.id,
      vouchee_user_id: voucheeUserId,
    });
    if (vouchError && vouchError.code !== '23505' && !/duplicate|unique/i.test(vouchError.message)) {
      throw new Error(`vouch insert failed: ${vouchError.message}`);
    }

    const { count, error: countError } = await admin
      .from('vouches')
      .select('id', { count: 'exact', head: true })
      .eq('vouchee_user_id', voucheeUserId);
    if (countError) throw new Error(`vouch count failed: ${countError.message}`);
    const vouchCount = count ?? 0;

    await writeAudit(admin, {
      actorUserId: ctx.appUser.id,
      action: 'vouch.created',
      targetType: 'user',
      targetId: voucheeUserId,
      metadata: { vouchCount },
    });

    // Auto-upgrade at the threshold, but only from a below-community state so a
    // vouch never downgrades an identity-verified member back to community.
    if (vouchCount >= COMMUNITY_VOUCH_THRESHOLD) {
      const { data: vouchee, error: voucheeError } = await admin
        .from('profiles')
        .select('verification_status')
        .eq('user_id', voucheeUserId)
        .maybeSingle();
      if (voucheeError) throw new Error(`vouchee lookup failed: ${voucheeError.message}`);

      if (
        vouchee &&
        (vouchee.verification_status === 'unverified' ||
          vouchee.verification_status === 'pending')
      ) {
        const { error: upgradeError } = await admin
          .from('profiles')
          .update({ verification_status: 'community_verified' })
          .eq('user_id', voucheeUserId)
          .in('verification_status', ['unverified', 'pending']);
        if (upgradeError) throw new Error(`community upgrade failed: ${upgradeError.message}`);

        // Resolve the badge slug → id (user_badges.badge_id FKs badge_definitions.id).
        const { data: badge, error: badgeError } = await admin
          .from('badge_definitions')
          .select('id')
          .eq('slug', 'community-verified')
          .maybeSingle();
        if (badgeError) throw new Error(`badge lookup failed: ${badgeError.message}`);
        if (badge) {
          const { error: awardError } = await admin.from('user_badges').insert({
            user_id: voucheeUserId,
            badge_id: badge.id,
          });
          // A concurrent award (partial-unique on non-revoked) is fine to ignore.
          if (
            awardError &&
            awardError.code !== '23505' &&
            !/duplicate|unique/i.test(awardError.message)
          ) {
            throw new Error(`badge award failed: ${awardError.message}`);
          }
        }

        await insertNotification(admin, {
          userId: voucheeUserId,
          type: 'community_verified',
          entityType: 'user',
          entityId: voucheeUserId,
        });

        await writeAudit(admin, {
          actorUserId: ctx.appUser.id,
          action: 'vouch.community_verified',
          targetType: 'user',
          targetId: voucheeUserId,
          metadata: { vouchCount },
        });
      }
    }

    return apiOk({ vouchCount });
  } catch (error) {
    return handleApiError(error);
  }
}
