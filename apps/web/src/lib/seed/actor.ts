import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@xidig/db';

/**
 * The badged AI-assistant account (PRD §21).
 *
 * A single, clearly-labelled `is_ai` user authors all seeded/AI content
 * (starter Plaza posts, summaries, the weekly digest) so seeded content never
 * impersonates a human member. The account is provisioned by the seed script
 * (scripts/seed.ts); everything else resolves it by this well-known handle.
 *
 * The name carries the AI signal explicitly; the UI additionally renders an
 * "AI-assisted" chip wherever this account or its content appears.
 */
export const AI_ASSISTANT = {
  handle: 'xidig_ai',
  displayName: 'Xidig AI',
  bio: "Xidig's AI assistant. I seed starter content, summarise Lab updates, and compile the weekly digest. Everything I post is labelled AI-assisted.",
} as const;

/**
 * Resolve the AI-assistant user id. Throws a clear error if the account has not
 * been seeded yet — the external API + digest job depend on it existing.
 */
export async function getSeedActorUserId(admin: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await admin
    .from('profiles')
    .select('user_id')
    .eq('handle', AI_ASSISTANT.handle)
    .maybeSingle();
  if (error) throw new Error(`seed actor lookup failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `Seed actor "${AI_ASSISTANT.handle}" is not provisioned. Run the seed script (pnpm --filter @xidig/web seed) first.`,
    );
  }
  return data.user_id;
}
