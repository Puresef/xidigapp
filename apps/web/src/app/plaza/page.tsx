import Link from 'next/link';
import { redirect } from 'next/navigation';

import type { MessageKey } from '@xidig/i18n';

import { PlazaFeed } from '@/components/plaza/plaza-feed';
import { PostComposer } from '@/components/plaza/post-composer';
import { getAuthContext } from '@/lib/auth/guards';
import { getLowBandwidth } from '@/lib/bandwidth-server';
import { getLitePrefs } from '@/lib/lite/server';
import { getT } from '@/lib/locale';

export const dynamic = 'force-dynamic';

/**
 * Madal / Plaza (§13, Phase 2): global members-only feed with an inline
 * composer. Type filters are links (?type=) like the Suuq tabs — shareable
 * URLs, no JS needed to switch.
 */

const POST_TYPES = ['intro', 'ask', 'win', 'update', 'poll'] as const;
type PlazaType = (typeof POST_TYPES)[number];

const TYPE_TAB_KEYS: Record<PlazaType, MessageKey> = {
  intro: 'plaza.typeIntro',
  ask: 'plaza.typeAsk',
  win: 'plaza.typeWin',
  update: 'plaza.typeUpdate',
  poll: 'plaza.typePoll',
};

export default async function PlazaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/signin?next=/plaza');
  if (ctx.appUser.status === 'suspended') redirect('/auth/error?reason=account_suspended');

  const params = await searchParams;
  const requested = params.type;
  const type: PlazaType | undefined = POST_TYPES.find((value) => value === requested);

  const t = await getT();
  const lowBandwidth = await getLowBandwidth();
  // Granular per-category prefs (§22) — the feed must honor images:true +
  // embeds:false etc., not collapse to an all-or-nothing bundle. lowBandwidth
  // stays only as the legacy fallback inside PostCard.
  const prefs = await getLitePrefs();

  return (
    <main className="xidig-section">
      <h1 className="xidig-auth__title">{t('nav.plaza')}</h1>

      {/* ?compose=1 (contextual header Create from another page) boots the
          composer expanded; on-plaza clicks use COMPOSE_EVENT instead. */}
      <PostComposer lowBandwidth={lowBandwidth} defaultExpanded={params.compose === '1'} />

      <div className="xidig-tabs">
        <Link
          className="xidig-tabs__tab"
          href="/plaza"
          aria-current={type === undefined ? 'page' : undefined}
        >
          {t('plaza.filterAll')}
        </Link>
        {POST_TYPES.map((value) => (
          <Link
            key={value}
            className="xidig-tabs__tab"
            href={`/plaza?type=${value}`}
            aria-current={type === value ? 'page' : undefined}
          >
            {t(TYPE_TAB_KEYS[value])}
          </Link>
        ))}
      </div>

      <PlazaFeed
        type={type}
        viewerId={ctx.appUser.id}
        lowBandwidth={lowBandwidth}
        prefs={prefs}
      />
    </main>
  );
}
