import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

import { env } from '@/env';

/**
 * Plaza auto-post on event publish (extras item 8: awards/digest auto-post
 * pattern — no new feed machinery). One 'update'-type post FROM THE HOST
 * linking the event page, so the event surfaces in the chronological feed
 * without any ranking. Fires once per event: on create-as-published and on
 * the draft→published transition (a draft can only publish once — the status
 * machine has no published→draft edge — so no dedup registry is needed).
 *
 * Space-only events deliberately DON'T auto-post to the global Plaza (their
 * audience is the Space); they post lab-scoped instead, which the Phase 4
 * policies already gate to Space members.
 *
 * Best-effort like notifications: a failed auto-post never fails the publish.
 */

export async function autopostEventPublished(
  admin: SupabaseClient<Database>,
  input: {
    hostUserId: string;
    slug: string;
    title: string;
    startsAt: string;
    visibility: string;
    labId: string | null;
    /** Post copy resolved by the caller in the request locale (t()). */
    bodyLead: string;
  },
): Promise<void> {
  const url = `${env.APP_URL.replace(/\/$/, '')}/events/${input.slug}`;
  const insert = {
    author_user_id: input.hostUserId,
    type: 'update' as const,
    title: input.title,
    body: `${input.bodyLead}\n\n${url}`,
    // members/public events → global Plaza; space_only stays lab-scoped.
    lab_id: input.visibility === 'space_only' ? input.labId : null,
  };
  const { error } = await admin.from('posts').insert(insert);
  if (error) {
    console.error('[events] plaza auto-post failed:', error.message);
  }
}
