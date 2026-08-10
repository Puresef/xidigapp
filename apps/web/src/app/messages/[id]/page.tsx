import { notFound, redirect } from 'next/navigation';

import { BackLink } from '@/components/back-link';
import {
  ConversationView,
  type CodsiContext,
  type RequestContext,
} from '@/components/messages/conversation-view';
import { MessagesInbox } from '@/components/messages/messages-inbox';
import { getAuthContext } from '@/lib/auth/guards';
import { DM_INBOX_PAGE_SIZE } from '@/lib/dm/constants';
import { loadConversationForUser, otherParticipant } from '@/lib/dm/service';
import {
  hydrateInbox,
  loadMessagesPage,
  participantProfile,
  presentConversationStatus,
} from '@/lib/dm/views';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { encodeCursor } from '@/lib/pagination';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@xidig/db';

export const dynamic = 'force-dynamic';

/**
 * Fariimo — a single conversation thread (6b/6d). SSR the header + newest
 * page; the client keeps it live over Realtime. Desktop (≥64rem) renders the
 * 6d two-pane: the inbox rail on the left with this thread marked current.
 *
 * For an INCOMING REQUEST the page also computes the sender-context card —
 * what the recipient already knows about the requester (shared lab, a reply
 * on one of their asks, verification, member-since) — so the accept/decline
 * choice is informed. Service-role queries, participant-scoped by
 * construction.
 */

async function computeRequestContext(
  admin: SupabaseClient<Database>,
  meId: string,
  otherId: string,
): Promise<RequestContext> {
  const [labs, reply, profile] = await Promise.all([
    // One lab you're BOTH members of (first alphabetically — one line, 6d).
    admin.from('lab_members').select('lab_id, labs(name)').eq('user_id', otherId),
    // The requester replied to one of MY asks — strong context (frame copy).
    admin
      .from('comments')
      .select('post_id, posts!inner(title, author_user_id, type)')
      .eq('author_user_id', otherId)
      .eq('posts.author_user_id', meId)
      .eq('posts.type', 'ask')
      .order('created_at', { ascending: false })
      .limit(1),
    admin
      .from('profiles')
      .select('verification_status, created_at')
      .eq('user_id', otherId)
      .maybeSingle(),
  ]);

  let sharedLabName: string | null = null;
  const otherLabIds = (labs.data ?? []).map((row) => row.lab_id);
  if (otherLabIds.length > 0) {
    const { data: mine } = await admin
      .from('lab_members')
      .select('lab_id')
      .eq('user_id', meId)
      .in('lab_id', otherLabIds);
    const sharedId = mine?.[0]?.lab_id ?? null;
    if (sharedId) {
      const hit = (labs.data ?? []).find((row) => row.lab_id === sharedId);
      const lab = hit?.labs as { name?: string | null } | null;
      sharedLabName = lab?.name ?? null;
    }
  }

  const replyRow = reply.data?.[0] as { posts?: { title?: string | null } | null } | undefined;

  return {
    sharedLabName,
    repliedAskTitle: replyRow?.posts?.title ?? null,
    verified:
      profile.data?.verification_status === 'community_verified' ||
      profile.data?.verification_status === 'identity_verified',
    memberYear: profile.data?.created_at
      ? new Date(profile.data.created_at).getFullYear()
      : null,
  };
}

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

  const isInitiator = convo.initiator_user_id === ctx.appUser.id;
  const otherId = otherParticipant(convo, ctx.appUser.id);
  const isIncomingRequest = convo.status === 'pending' && !isInitiator;

  const [other, page, prefs, inboxRows] = await Promise.all([
    participantProfile(admin, otherId),
    loadMessagesPage(ctx.supabase, id, ctx.appUser.id, null, undefined, admin),
    getLitePrefs(),
    // 6d two-pane rail (hidden below 64rem by CSS).
    ctx.supabase.rpc('dm_inbox', { p_limit: DM_INBOX_PAGE_SIZE }),
  ]);

  const requestContext = isIncomingRequest
    ? await computeRequestContext(admin, ctx.appUser.id, otherId)
    : null;

  // The Codsi that opened this conversation (post_offers linkage) — pinned
  // context, not a notification (6b).
  let codsiContext: CodsiContext | null = null;
  const { data: offer } = await admin
    .from('post_offers')
    .select('post_id, posts(title, ask_status)')
    .eq('conversation_id', id)
    .maybeSingle();
  if (offer) {
    const post = offer.posts as { title?: string | null; ask_status?: string | null } | null;
    codsiContext = {
      postId: offer.post_id,
      title: post?.title ?? null,
      askStatus: post?.ask_status ?? null,
    };
  }

  // f4: only the BLOCKER gets the block chrome (date + unblock). The other
  // side never learns — they see the neutral restricted notice.
  let blockedAt: string | null = null;
  if (convo.status === 'blocked') {
    const { data: block } = await admin
      .from('user_blocks')
      .select('created_at')
      .eq('blocker_user_id', ctx.appUser.id)
      .eq('blocked_user_id', otherId)
      .maybeSingle();
    blockedAt = block?.created_at ?? null;
  }

  const t = await getT();
  const rows = inboxRows.data ?? [];
  const conversations = await hydrateInbox(admin, rows);
  const last = rows[rows.length - 1];
  const inboxNextCursor =
    rows.length === DM_INBOX_PAGE_SIZE && last
      ? encodeCursor({ createdAt: last.updated_at, id: last.conversation_id })
      : null;

  return (
    <main className="xidig-section xidig-dm-page">
      <div className="xidig-dm-twopane">
        <aside className="xidig-dm-twopane__rail" aria-label={t('nav.messages')}>
          <MessagesInbox
            meId={ctx.appUser.id}
            initial={{ conversations, nextCursor: inboxNextCursor }}
            prefs={prefs}
            activeId={id}
            compact
          />
        </aside>
        <div className="xidig-dm-twopane__main">
          <BackLink href="/messages" labelKey="nav.messages" />
          <ConversationView
            meId={ctx.appUser.id}
            initialHeader={{
              id: convo.id,
              // f5: declined presents as pending to its initiator — the SSR
              // path applies the same shared rule as the header API.
              status: presentConversationStatus(convo.status, isInitiator),
              isInitiator,
              other,
              createdAt: convo.created_at,
            }}
            initialMessages={page.messages}
            initialNextCursor={page.nextCursor}
            prefs={prefs}
            requestContext={requestContext}
            codsiContext={codsiContext}
            blockedAt={blockedAt}
          />
        </div>
      </div>
    </main>
  );
}
