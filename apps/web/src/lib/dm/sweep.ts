import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { DM_MEDIA_BUCKET } from '@/lib/media/storage';

import { DM_REQUEST_TTL_DAYS } from './constants';

/**
 * The 30-day request sweep (HANDOFF Fariimo row: "request auto-deletes 30d").
 *
 * What ages out: conversations still in 'pending' OR 'declined' whose
 * updated_at is older than the TTL. Declined must age out with pending —
 * to the sender the two are indistinguishable (f5), so if declined rows
 * lived forever while pending ones vanished, the deletion itself would leak
 * the decline. Accepted and blocked conversations are NEVER touched
 * (blocked history is report evidence; accepted threads are the product).
 *
 * Order matters for voice notes: messages reference media_uploads with
 * ON DELETE RESTRICT, so the sweep deletes conversations FIRST (messages
 * cascade), then the now-unreferenced upload rows, then the storage
 * objects. A storage removal hiccup never aborts the sweep — orphaned
 * objects are retried implicitly on the next run only if their rows
 * survived, so rows are deleted LAST of the pair.
 */

export interface DmSweepCounts {
  conversations: number;
  voiceUploads: number;
  voiceObjects: number;
}

/**
 * Expiry anchor for a request: the last MESSAGE time (falling back to the
 * conversation's creation). Deliberately NOT updated_at — the decline UPDATE
 * bumps updated_at, which would make a declined request outlive its
 * pending twin by the pending→decline gap and turn deletion timing into a
 * decline oracle (adversarial review #3). Messages are the one clock the
 * decline doesn't touch, so pending and declined age out identically.
 */
export function requestExpiryAnchor(
  conversationCreatedAt: string,
  lastMessageAt: string | null,
): string {
  if (lastMessageAt !== null && lastMessageAt > conversationCreatedAt) return lastMessageAt;
  return conversationCreatedAt;
}

export async function sweepStaleDmRequests(
  admin: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<DmSweepCounts> {
  const cutoff = new Date(now.getTime() - DM_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Candidates by status alone; the expiry decision uses the decline-proof
  // anchor above, never updated_at.
  const { data: candidates, error: staleError } = await admin
    .from('conversations')
    .select('id, created_at')
    .in('status', ['pending', 'declined']);
  if (staleError) throw new Error(`dm sweep lookup failed: ${staleError.message}`);
  const candidateRows = candidates ?? [];
  if (candidateRows.length === 0) return { conversations: 0, voiceUploads: 0, voiceObjects: 0 };

  const { data: lastMessages, error: lastError } = await admin
    .from('messages')
    .select('conversation_id, created_at')
    .in(
      'conversation_id',
      candidateRows.map((row) => row.id),
    );
  if (lastError) throw new Error(`dm sweep message lookup failed: ${lastError.message}`);
  const lastByConversation = new Map<string, string>();
  for (const row of lastMessages ?? []) {
    const current = lastByConversation.get(row.conversation_id);
    if (!current || row.created_at > current) {
      lastByConversation.set(row.conversation_id, row.created_at);
    }
  }

  const ids = candidateRows
    .filter(
      (row) =>
        requestExpiryAnchor(row.created_at, lastByConversation.get(row.id) ?? null) < cutoff,
    )
    .map((row) => row.id);
  if (ids.length === 0) return { conversations: 0, voiceUploads: 0, voiceObjects: 0 };

  // Voice uploads referenced by messages of the doomed conversations — grab
  // them BEFORE the cascade erases the reference.
  const { data: voiceRows, error: voiceError } = await admin
    .from('messages')
    .select('voice_upload_id')
    .in('conversation_id', ids)
    .not('voice_upload_id', 'is', null);
  if (voiceError) throw new Error(`dm sweep voice lookup failed: ${voiceError.message}`);
  const voiceIds = [
    ...new Set(
      (voiceRows ?? [])
        .map((row) => row.voice_upload_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  const { data: uploads } = voiceIds.length
    ? await admin.from('media_uploads').select('id, storage_path').in('id', voiceIds)
    : { data: [] as { id: string; storage_path: string }[] };

  // 1) Conversations go first — messages cascade with them.
  const { error: deleteError } = await admin.from('conversations').delete().in('id', ids);
  if (deleteError) throw new Error(`dm sweep delete failed: ${deleteError.message}`);

  // 2) Storage objects, best-effort…
  let objectsRemoved = 0;
  const paths = (uploads ?? []).map((row) => row.storage_path);
  if (paths.length > 0) {
    const { error: storageError } = await admin.storage.from(DM_MEDIA_BUCKET).remove(paths);
    if (storageError) {
      console.warn('[dm-sweep] voice object removal failed (rows kept for retry):', storageError.message);
    } else {
      objectsRemoved = paths.length;
      // 3) …and rows only after their objects are gone (retry safety).
      const { error: uploadDeleteError } = await admin
        .from('media_uploads')
        .delete()
        .in('id', voiceIds);
      if (uploadDeleteError) {
        console.warn('[dm-sweep] voice row removal failed:', uploadDeleteError.message);
      }
    }
  }

  return {
    conversations: ids.length,
    voiceUploads: voiceIds.length,
    voiceObjects: objectsRemoved,
  };
}
