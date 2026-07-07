import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { ConversationView } from '@/components/messages/conversation-view';
import { getAuthContext } from '@/lib/auth/guards';
import { loadConversationForUser, otherParticipant } from '@/lib/dm/service';
import { loadMessagesPage, participantProfile } from '@/lib/dm/views';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Fariimo — a single conversation thread (§13, Phase 3). SSR the header + the
 * newest page of messages; the client component subscribes to Realtime for
 * live delivery and drives the request/accept/decline/block states.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/messages');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const { id } = await params;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id)) notFound();

  const admin = getSupabaseAdmin();
  const convo = await loadConversationForUser(admin, id, ctx.appUser.id);
  if (!convo) notFound();

  const [other, page] = await Promise.all([
    participantProfile(admin, otherParticipant(convo, ctx.appUser.id)),
    loadMessagesPage(ctx.supabase, id, ctx.appUser.id, null),
  ]);

  const t = await getT();

  return (
    <main className="xidig-section">
      <p className="xidig-dm-back">
        <Link href="/messages">← {t('nav.messages')}</Link>
      </p>
      <ConversationView
        meId={ctx.appUser.id}
        initialHeader={{
          id: convo.id,
          status: convo.status,
          isInitiator: convo.initiator_user_id === ctx.appUser.id,
          other,
        }}
        initialMessages={page.messages}
        initialNextCursor={page.nextCursor}
      />
    </main>
  );
}
