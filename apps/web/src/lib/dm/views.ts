import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Enums, Tables } from '@xidig/db';

import { derivedThumbPath, publicMediaUrl } from '@/lib/media/storage';
import { decodeCursor, encodeCursor, keysetBefore, type Cursor } from '@/lib/pagination';

import { DM_MESSAGE_PAGE_SIZE } from './constants';

/**
 * Read-side hydration for the DM surface: message rows → client views, the
 * dm_inbox() RPC rows → inbox items joined with the other participant's public
 * profile, and single-message keyset history. All shaped so the client renders
 * verbatim (API-first, §22).
 */

export interface Participant {
  userId: string;
  handle: string | null;
  displayName: string | null;
  verificationStatus: string | null;
  /** Avatar THUMB public URL (<8KB, 96px pipeline) — null → initials disc. */
  avatarThumbUrl: string | null;
  avatarBlurhash: string | null;
}

/** The profiles projection the DM surface needs — display fields only. */
export interface ParticipantProfileRow {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  verification_status: Enums<'profile_verification_status'> | null;
  avatar_path: string | null;
  avatar_blurhash: string | null;
}

/**
 * Profiles row → Participant (pure; unit-tested). Avatar follows the Plaza
 * byline convention (lib/plaza/views.ts fetchAuthors): storage path → derived
 * thumb public URL, never the full image; missing path → null so the client
 * renders the zero-byte initials disc.
 */
export function toParticipant(row: ParticipantProfileRow): Participant {
  return {
    userId: row.user_id,
    handle: row.handle,
    displayName: row.display_name,
    verificationStatus: row.verification_status,
    avatarThumbUrl: row.avatar_path ? publicMediaUrl(derivedThumbPath(row.avatar_path)) : null,
    avatarBlurhash: row.avatar_blurhash ?? null,
  };
}

export interface MessageVoice {
  uploadId: string;
  /** Client-measured seconds (server-clamped); null when unknown. */
  durationSeconds: number | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  /** Voice note attachment — audio streams via the participant-checked
   * signed-URL route, never a public URL. */
  voice: MessageVoice | null;
  isMine: boolean;
  deleted: boolean;
  createdAt: string;
}

export function toMessageView(
  row: Tables<'messages'>,
  meId: string,
  durations?: Map<string, number | null>,
): MessageView {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    // Soft-deleted (moderation, §19): never leak the original body or audio.
    body: deleted ? '' : (row.body ?? ''),
    voice:
      !deleted && row.voice_upload_id
        ? {
            uploadId: row.voice_upload_id,
            durationSeconds: durations?.get(row.voice_upload_id) ?? null,
          }
        : null,
    isMine: row.sender_user_id === meId,
    deleted,
    createdAt: row.created_at,
  };
}

/** Durations for a set of voice uploads — service role (the recipient can't
 * read the owner-scoped media_uploads rows; the AUDIO stays gated behind the
 * participant-checked signed-URL route regardless). */
export async function fetchVoiceDurations(
  admin: SupabaseClient<Database>,
  uploadIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  const unique = [...new Set(uploadIds)];
  if (unique.length === 0) return map;
  const { data } = await admin
    .from('media_uploads')
    .select('id, duration_seconds')
    .in('id', unique);
  for (const row of data ?? []) map.set(row.id, row.duration_seconds);
  return map;
}

async function fetchParticipants(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<Map<string, Participant>> {
  const map = new Map<string, Participant>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return map;
  const { data } = await admin
    .from('profiles')
    .select('user_id, handle, display_name, verification_status, avatar_path, avatar_blurhash')
    .in('user_id', unique);
  for (const row of data ?? []) {
    map.set(row.user_id, toParticipant(row));
  }
  return map;
}

export async function participantProfile(
  admin: SupabaseClient<Database>,
  userId: string,
): Promise<Participant | null> {
  const map = await fetchParticipants(admin, [userId]);
  return map.get(userId) ?? null;
}

export interface InboxItem {
  conversationId: string;
  status: Database['public']['Enums']['conversation_status'];
  isInitiator: boolean;
  other: Participant | null;
  lastMessage: {
    body: string | null;
    at: string | null;
    senderUserId: string | null;
    deleted: boolean;
    voice: boolean;
  } | null;
  unreadCount: number;
  updatedAt: string;
  createdAt: string;
}

interface DmInboxRow {
  conversation_id: string;
  other_user_id: string;
  status: Database['public']['Enums']['conversation_status'];
  is_initiator: boolean;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender: string | null;
  last_message_deleted: boolean | null;
  /** Optional-defensive: absent until migration 20260810000000 is applied. */
  last_message_voice?: boolean | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * The SILENT-DECLINE presentation boundary (f5 — "the silence is the
 * design"): a declined conversation NEVER reaches the sender as declined.
 * For the initiator it presents as 'pending' — same row, same copy, same
 * locked composer as a genuinely unanswered request. For the recipient who
 * declined it, the row simply vanishes from the inbox (declining is closing
 * the door, not keeping a trophy). Every consumer downstream of this
 * function is structurally unable to leak the decline.
 */
export function presentInboxRow(row: DmInboxRow): DmInboxRow | null {
  if (row.status !== 'declined') return row;
  if (row.is_initiator) return { ...row, status: 'pending' };
  return null;
}

export { presentConversationStatus } from './presentation';

export async function hydrateInbox(
  admin: SupabaseClient<Database>,
  rows: DmInboxRow[],
): Promise<InboxItem[]> {
  const presented = rows
    .map(presentInboxRow)
    .filter((row): row is DmInboxRow => row !== null);
  const participants = await fetchParticipants(
    admin,
    presented.map((r) => r.other_user_id),
  );
  return presented.map((r) => ({
    conversationId: r.conversation_id,
    status: r.status,
    isInitiator: r.is_initiator,
    other: participants.get(r.other_user_id) ?? null,
    lastMessage: r.last_message_at
      ? {
          body: r.last_message_deleted ? null : r.last_message_body,
          at: r.last_message_at,
          senderUserId: r.last_message_sender,
          deleted: Boolean(r.last_message_deleted),
          voice: Boolean(r.last_message_voice ?? false),
        }
      : null,
    unreadCount: r.unread_count,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));
}

export interface MessagePage {
  messages: MessageView[];
  /** Cursor for the NEXT (older) page, or null when history is exhausted. */
  nextCursor: string | null;
}

/**
 * One page of message history, newest page first but returned oldest→newest
 * for display. Keyset over (created_at desc, id desc); "load older" walks
 * backwards from the cursor. The RLS-scoped client is fine here — the caller
 * already proved participation, and messages' SELECT policy re-checks it.
 */
export async function loadMessagesPage(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  meId: string,
  rawCursor: string | null,
  limit = DM_MESSAGE_PAGE_SIZE,
  /** Service role for voice-duration hydration (owner-scoped rows); omit →
   * voice bubbles render without a duration figure. */
  admin?: SupabaseClient<Database>,
): Promise<MessagePage> {
  const cursor: Cursor | null = decodeCursor(rawCursor);

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.or(keysetBefore(cursor, 'id'));

  const { data, error } = await query;
  if (error) throw new Error(`message history failed: ${error.message}`);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1); // oldest row on this page (desc order)
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;

  const voiceIds = page
    .map((row) => row.voice_upload_id)
    .filter((id): id is string => id !== null);
  const durations =
    admin && voiceIds.length > 0 ? await fetchVoiceDurations(admin, voiceIds) : undefined;

  // Fetched newest-first for the keyset; reverse to oldest→newest for display.
  const messages = page.map((row) => toMessageView(row, meId, durations)).reverse();
  return { messages, nextCursor };
}
