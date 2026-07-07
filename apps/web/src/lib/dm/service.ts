import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

import { ApiError } from '@/lib/api';
import { env } from '@/env';
import { sendEmailChecked } from '@/lib/email/send';
import { dmRequestEmail } from '@/lib/email/templates';
import { notify } from '@/lib/notifications/notify';
import { isChannelEnabled } from '@/lib/notifications/prefs';

import { DM_PREVIEW_LENGTH, DM_REQUEST_WINDOW_SECONDS } from './constants';

/**
 * Fariimo DM domain logic (§13): request-to-chat, accept/decline, send, block.
 * The API routes own auth + throttles; this module owns the conversation state
 * machine and its §26 notification / email / push side effects, so the rules
 * live in one place (and a direct-API caller that skips the UI still hits
 * them). All writes here run as the service role — DM tables are API-only.
 */

export type Conversation = Tables<'conversations'>;

export function isParticipant(convo: Conversation, userId: string): boolean {
  return convo.initiator_user_id === userId || convo.recipient_user_id === userId;
}

export function otherParticipant(convo: Conversation, userId: string): string {
  return convo.initiator_user_id === userId ? convo.recipient_user_id : convo.initiator_user_id;
}

/** Contact-option opt-out: DMs are on by default (request-to-chat already
 * guards unwanted contact); a member restricts them with contact_options.dm=false. */
export function canReceiveDms(contactOptions: unknown): boolean {
  if (contactOptions && typeof contactOptions === 'object' && 'dm' in contactOptions) {
    return (contactOptions as Record<string, unknown>).dm !== false;
  }
  return true;
}

/** Active block in EITHER direction. */
export async function isBlockedBetween(
  admin: SupabaseClient<Database>,
  a: string,
  b: string,
): Promise<boolean> {
  const { data } = await admin
    .from('user_blocks')
    .select('blocker_user_id')
    .or(
      `and(blocker_user_id.eq.${a},blocked_user_id.eq.${b}),and(blocker_user_id.eq.${b},blocked_user_id.eq.${a})`,
    )
    .limit(1);
  return Boolean(data && data.length > 0);
}

/** A conversation the user participates in, or null (not found / not theirs). */
export async function loadConversationForUser(
  admin: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
): Promise<Conversation | null> {
  const { data } = await admin
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!data || !isParticipant(data, userId)) return null;
  return data;
}

async function findConversationByPair(
  admin: SupabaseClient<Database>,
  a: string,
  b: string,
): Promise<Conversation | null> {
  const { data } = await admin
    .from('conversations')
    .select('*')
    .or(
      `and(initiator_user_id.eq.${a},recipient_user_id.eq.${b}),and(initiator_user_id.eq.${b},recipient_user_id.eq.${a})`,
    )
    .maybeSingle();
  return data ?? null;
}

/** DM requests this member sent in the last 24h — a durable throttle backstop
 * that works even when Upstash is unconfigured (§26 5/day). Counts dm_request
 * NOTIFICATION events (one per request the member fires), NOT conversation
 * rows: a request that RE-OPENS a declined thread reuses the same conversation
 * row but still emits a fresh dm_request notification, so counting events is
 * what actually caps the anti-harassment vector (repeatedly re-requesting a
 * declining recipient, or reopening many old threads in one day). */
export async function countDmRequestsToday(
  admin: SupabaseClient<Database>,
  initiatorId: string,
): Promise<number> {
  const since = new Date(Date.now() - DM_REQUEST_WINDOW_SECONDS * 1000).toISOString();
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('actor_user_id', initiatorId)
    .eq('type', 'dm_request')
    .gte('created_at', since);
  return count ?? 0;
}

function preview(body: string | undefined): string | null {
  if (!body) return null;
  return body.length > DM_PREVIEW_LENGTH ? `${body.slice(0, DM_PREVIEW_LENGTH)}…` : body;
}

async function insertMessage(
  admin: SupabaseClient<Database>,
  conversationId: string,
  senderId: string,
  body: string,
): Promise<Tables<'messages'>> {
  const { data, error } = await admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_user_id: senderId, body })
    .select('*')
    .single();
  if (error || !data) throw new Error(`message insert failed: ${error?.message ?? 'no row'}`);
  return data;
}

/** Best-effort email to the recipient of a new DM request (§26 email = DM
 * requests). The sender name is the INITIATOR's, not the recipient's. Never
 * throws (a suppressed/bouncing address must not fail the request); silent
 * no-op when the email provider is unconfigured. */
async function emailDmRequest(
  admin: SupabaseClient<Database>,
  recipientId: string,
  initiatorId: string,
): Promise<void> {
  try {
    // Phase 4.5 prefs (§26): recipient can turn the DM-request email off.
    if (!(await isChannelEnabled(admin, recipientId, 'dm_request', 'email'))) return;
    const [{ data: recipient }, { data: initiator }] = await Promise.all([
      admin.from('users').select('email').eq('id', recipientId).maybeSingle(),
      admin.from('profiles').select('display_name').eq('user_id', initiatorId).maybeSingle(),
    ]);
    if (!recipient?.email) return;
    const senderName = initiator?.display_name ?? 'A Xidig member';
    const url = `${env.APP_URL}/messages`;
    await sendEmailChecked(admin, dmRequestEmail(recipient.email, senderName, url));
  } catch (error) {
    console.warn('[dm] request email failed (non-fatal):', error);
  }
}

export type StartState = 'requested' | 'pending_exists' | 'accepted' | 'reopened';

export interface StartResult {
  conversation: Conversation;
  state: StartState;
}

/**
 * Start (or resume) a conversation with a recipient — the request-to-chat
 * entry point. Enforces the block + contact-option gates, then walks the
 * conversation state machine. Throws ApiError('dm_blocked') for a blocked or
 * DM-restricted recipient (§27). Throttling is the caller's responsibility.
 */
export async function startConversation(
  admin: SupabaseClient<Database>,
  initiatorId: string,
  recipientId: string,
  message: string | undefined,
): Promise<StartResult> {
  if (initiatorId === recipientId) throw new ApiError('invalid_request', 400);

  const { data: recipient } = await admin
    .from('profiles')
    .select('user_id, display_name, handle, contact_options')
    .eq('user_id', recipientId)
    .maybeSingle();
  if (!recipient) throw new ApiError('not_found', 404);

  // §27 "they've restricted their messages" — recipient opted out, or a block.
  if (!canReceiveDms(recipient.contact_options)) throw new ApiError('dm_blocked', 403);
  if (await isBlockedBetween(admin, initiatorId, recipientId)) {
    throw new ApiError('dm_blocked', 403);
  }

  // Phase 4.5 privacy (§26): user_settings.dm_privacy. 'none' closes DMs;
  // 'verified' requires the SENDER to hold a verified profile. Both surface
  // as the same §27 dm_blocked copy — never reveal which gate fired.
  const { data: recipientSettings } = await admin
    .from('user_settings')
    .select('dm_privacy')
    .eq('user_id', recipientId)
    .maybeSingle();
  const dmPrivacy = recipientSettings?.dm_privacy ?? 'everyone';
  if (dmPrivacy === 'none') throw new ApiError('dm_blocked', 403);
  if (dmPrivacy === 'verified') {
    const { data: sender } = await admin
      .from('profiles')
      .select('verification_status')
      .eq('user_id', initiatorId)
      .maybeSingle();
    // "Verified" = either §11 verification tier (community or identity).
    const senderVerified =
      sender?.verification_status === 'community_verified' ||
      sender?.verification_status === 'identity_verified';
    if (!senderVerified) throw new ApiError('dm_blocked', 403);
  }

  const existing = await findConversationByPair(admin, initiatorId, recipientId);

  if (existing) {
    if (existing.status === 'accepted') {
      // Already chatting — a "request" is a no-op; the UI just opens the thread.
      if (message) await insertMessage(admin, existing.id, initiatorId, message);
      return { conversation: existing, state: 'accepted' };
    }

    if (existing.status === 'pending') {
      if (existing.initiator_user_id === initiatorId) {
        return { conversation: existing, state: 'pending_exists' }; // idempotent re-request
      }
      // The other member had a pending request to me — replying accepts it.
      const { data: accepted } = await admin
        .from('conversations')
        .update({ status: 'accepted' })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (message) await insertMessage(admin, existing.id, initiatorId, message);
      await notify(admin, {
        userId: existing.initiator_user_id,
        actorUserId: initiatorId,
        type: 'dm_accepted',
        entityType: 'conversation',
        entityId: existing.id,
      });
      return { conversation: accepted ?? existing, state: 'accepted' };
    }

    // declined / blocked (no ACTIVE block reached here) → re-open as a fresh
    // request from the current initiator. Bounded by the 5/day throttle; the
    // recipient's remedy for nagging is a block (the authoritative gate).
    const { data: reopened } = await admin
      .from('conversations')
      .update({
        initiator_user_id: initiatorId,
        recipient_user_id: recipientId,
        status: 'pending',
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    const convo = reopened ?? existing;
    if (message) await insertMessage(admin, convo.id, initiatorId, message);
    await notify(admin, {
      userId: recipientId,
      actorUserId: initiatorId,
      type: 'dm_request',
      entityType: 'conversation',
      entityId: convo.id,
      payload: { preview: preview(message) },
    });
    await emailDmRequest(admin, recipientId, initiatorId);
    return { conversation: convo, state: 'reopened' };
  }

  // Brand-new request.
  const { data: created, error } = await admin
    .from('conversations')
    .insert({ initiator_user_id: initiatorId, recipient_user_id: recipientId, status: 'pending' })
    .select('*')
    .single();
  if (error || !created) {
    // 23505 = the conversations_pair_uq unique index fired: a concurrent
    // start (double-click / two tabs) already created the row. Re-fetch and
    // return it idempotently rather than surfacing a 500.
    if (error?.code === '23505') {
      const raced = await findConversationByPair(admin, initiatorId, recipientId);
      if (raced) {
        return {
          conversation: raced,
          state: raced.status === 'accepted' ? 'accepted' : 'pending_exists',
        };
      }
    }
    throw new Error(`conversation create failed: ${error?.message ?? 'no row'}`);
  }
  if (message) await insertMessage(admin, created.id, initiatorId, message);
  await notify(admin, {
    userId: recipientId,
    actorUserId: initiatorId,
    type: 'dm_request',
    entityType: 'conversation',
    entityId: created.id,
    payload: { preview: preview(message) },
  });
  await emailDmRequest(admin, recipientId, initiatorId);
  return { conversation: created, state: 'requested' };
}

/** Recipient accepts/declines a pending request. */
export async function respondToRequest(
  admin: SupabaseClient<Database>,
  userId: string,
  conversation: Conversation,
  action: 'accept' | 'decline',
): Promise<Conversation> {
  if (conversation.status !== 'pending' || conversation.recipient_user_id !== userId) {
    throw new ApiError('invalid_request', 409);
  }
  const nextStatus = action === 'accept' ? 'accepted' : 'declined';
  const { data, error } = await admin
    .from('conversations')
    .update({ status: nextStatus })
    .eq('id', conversation.id)
    .select('*')
    .single();
  if (error || !data) throw new Error(`respond failed: ${error?.message ?? 'no row'}`);

  // Notify the initiator only on accept (in-app; §26 keeps accept off email/
  // push). A decline is silent — the initiator sees the state in their inbox,
  // and no notification avoids rewarding a rejected requester with a ping.
  if (action === 'accept') {
    await notify(admin, {
      userId: conversation.initiator_user_id,
      actorUserId: userId,
      type: 'dm_accepted',
      entityType: 'conversation',
      entityId: conversation.id,
    });
  }
  return data;
}

/** Send a message in an accepted thread. Enforces the accept gate + live block
 * check (a block after acceptance halts sends). Notifies the recipient
 * (new_dm: in-app + push per §26). */
export async function sendMessage(
  admin: SupabaseClient<Database>,
  senderId: string,
  conversation: Conversation,
  body: string,
): Promise<Tables<'messages'>> {
  if (conversation.status !== 'accepted') {
    // pending (waiting on accept) or declined/blocked — cannot send into it.
    throw new ApiError(conversation.status === 'pending' ? 'dm_not_accepted' : 'dm_blocked', 409);
  }
  const recipientId = otherParticipant(conversation, senderId);
  if (await isBlockedBetween(admin, senderId, recipientId)) {
    throw new ApiError('dm_blocked', 403);
  }

  const message = await insertMessage(admin, conversation.id, senderId, body);

  await notify(admin, {
    userId: recipientId,
    actorUserId: senderId,
    type: 'new_dm',
    entityType: 'conversation',
    entityId: conversation.id,
    bundleKey: `dm:${conversation.id}`,
    payload: { preview: preview(body) },
  });

  return message;
}

/** Block a member: record the block and halt any live conversation with them. */
export async function blockUser(
  admin: SupabaseClient<Database>,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  if (blockerId === blockedId) throw new ApiError('invalid_request', 400);
  await admin
    .from('user_blocks')
    .upsert(
      { blocker_user_id: blockerId, blocked_user_id: blockedId },
      { onConflict: 'blocker_user_id,blocked_user_id', ignoreDuplicates: true },
    );
  // Halt any conversation between the two (either role) — status 'blocked'
  // removes it from both inboxes and blocks sends.
  await admin
    .from('conversations')
    .update({ status: 'blocked' })
    .or(
      `and(initiator_user_id.eq.${blockerId},recipient_user_id.eq.${blockedId}),and(initiator_user_id.eq.${blockedId},recipient_user_id.eq.${blockerId})`,
    );
}

/** Unblock a member. The conversation stays 'blocked' until a fresh request
 * re-opens it (startConversation's re-open branch) — the live block check no
 * longer fires, so re-contact is possible again. */
export async function unblockUser(
  admin: SupabaseClient<Database>,
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await admin
    .from('user_blocks')
    .delete()
    .eq('blocker_user_id', blockerId)
    .eq('blocked_user_id', blockedId);
}
