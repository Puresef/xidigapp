import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@xidig/db';

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
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  isMine: boolean;
  deleted: boolean;
  createdAt: string;
}

export function toMessageView(row: Tables<'messages'>, meId: string): MessageView {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    // Soft-deleted (moderation, §19): never leak the original body.
    body: deleted ? '' : row.body,
    isMine: row.sender_user_id === meId,
    deleted,
    createdAt: row.created_at,
  };
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
    .select('user_id, handle, display_name, verification_status')
    .in('user_id', unique);
  for (const row of data ?? []) {
    map.set(row.user_id, {
      userId: row.user_id,
      handle: row.handle,
      displayName: row.display_name,
      verificationStatus: row.verification_status,
    });
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
  lastMessage: { body: string | null; at: string | null; senderUserId: string | null; deleted: boolean } | null;
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
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export async function hydrateInbox(
  admin: SupabaseClient<Database>,
  rows: DmInboxRow[],
): Promise<InboxItem[]> {
  const participants = await fetchParticipants(
    admin,
    rows.map((r) => r.other_user_id),
  );
  return rows.map((r) => ({
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

  // Fetched newest-first for the keyset; reverse to oldest→newest for display.
  const messages = page.map((row) => toMessageView(row, meId)).reverse();
  return { messages, nextCursor };
}
