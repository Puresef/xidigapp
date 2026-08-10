import type { Database } from '@xidig/db';

/**
 * f5 — SILENT DECLINE, the pure client-safe half. "The silence is the
 * design": a declined request NEVER reaches its initiator as declined; it
 * presents as 'pending' — same copy, same locked composer — so declined and
 * simply-unanswered are one state to the sender. Server hydration
 * (lib/dm/views.ts) and the client Realtime handler both route through this
 * one function; if it regresses, the consent grammar collapses.
 */
export function presentConversationStatus(
  status: Database['public']['Enums']['conversation_status'],
  isInitiator: boolean,
): Database['public']['Enums']['conversation_status'] {
  return status === 'declined' && isInitiator ? 'pending' : status;
}
