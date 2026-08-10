import { redirect } from 'next/navigation';

import { MessagesInbox } from '@/components/messages/messages-inbox';
import { NewMessageButton } from '@/components/messages/new-message-button';
import { getAuthContext } from '@/lib/auth/guards';
import { DM_INBOX_PAGE_SIZE } from '@/lib/dm/constants';
import { hydrateInbox } from '@/lib/dm/views';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';
import { encodeCursor } from '@/lib/pagination';

export const dynamic = 'force-dynamic';

/**
 * Fariimo — Messages inbox (§13, Phase 3). SSR the first page of conversations
 * (fast first paint, works before client JS), then the client component keeps
 * it live over Realtime.
 */
export default async function MessagesPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/messages');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const t = await getT();
  const prefs = await getLitePrefs();

  const { data } = await ctx.supabase.rpc('dm_inbox', { p_limit: DM_INBOX_PAGE_SIZE });
  const rows = data ?? [];
  const conversations = await hydrateInbox(ctx.supabase, rows);
  const last = rows[rows.length - 1];
  const nextCursor =
    rows.length === DM_INBOX_PAGE_SIZE && last
      ? encodeCursor({ createdAt: last.updated_at, id: last.conversation_id })
      : null;

  return (
    <main className="xidig-section">
      <div className="xidig-dm-pagehead">
        <h1 className="xidig-auth__title">{t('nav.messages')}</h1>
        {/* 6a header: compose sits beside the title. (The Raadi search icon
            from the frame is deferred — no conversation-search backend yet;
            flagged in the dispatch report.) */}
        <NewMessageButton />
      </div>
      <p className="xidig-card__meta">{t('messages.subtitle')}</p>
      <MessagesInbox meId={ctx.appUser.id} initial={{ conversations, nextCursor }} prefs={prefs} />
    </main>
  );
}
